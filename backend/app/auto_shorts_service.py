import json
import time
import uuid
import threading
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

from . import config, db, projects_service, clips_service
from . import ai_selection_service, shorts_engine, template_service, face_tracker_service

logger = logging.getLogger(__name__)

def create_auto_shorts_job(
    youtube_url: str,
    template_id: str = "acharya_prashant_classic",
    num_clips: int = 5,
    project_id: Optional[str] = None
) -> Dict[str, Any]:
    job_id = uuid.uuid4().hex
    now = time.time()
    
    # If no project supplied, create one
    if not project_id:
        proj = projects_service.create_project(f"Auto Shorts - {time.strftime('%b %d, %H:%M')}")
        project_id = proj["id"]
        
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO auto_shorts_jobs (id, project_id, youtube_url, template_id, status, stage, progress, num_clips, clips_json, renders_json, step_detail, transcript_json, script_content, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'queued', 'ingest', 0.05, ?, '[]', '[]', 'Initializing download...', '[]', '', ?, ?)
    """, (job_id, project_id, youtube_url, template_id, num_clips, now, now))
    conn.commit()
    conn.close()
    
    # Trigger background execution for Ingest stage
    t = threading.Thread(target=_run_auto_shorts_pipeline, args=(job_id,), daemon=True)
    t.start()
    
    return get_auto_shorts_job(job_id)

def get_auto_shorts_job(job_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    row = c.execute("SELECT * FROM auto_shorts_jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "youtube_url": row["youtube_url"],
        "template_id": row["template_id"],
        "status": row["status"],
        "stage": row["stage"],
        "progress": row["progress"],
        "num_clips": row["num_clips"],
        "clips": json.loads(row["clips_json"] or "[]"),
        "renders": json.loads(row["renders_json"] or "[]"),
        "step_detail": row["step_detail"] or "",
        "transcript": json.loads(row["transcript_json"] or "[]"),
        "script_content": row["script_content"] or "",
        "error": row["error"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"]
    }

def update_job_status(
    job_id: str,
    status: Optional[str] = None,
    stage: Optional[str] = None,
    progress: Optional[float] = None,
    clips: Optional[List] = None,
    renders: Optional[List] = None,
    step_detail: Optional[str] = None,
    transcript: Optional[List] = None,
    script_content: Optional[str] = None,
    error: Optional[str] = None
):
    conn = db.get_connection()
    c = conn.cursor()
    updates = ["updated_at = ?"]
    params = [time.time()]
    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if stage is not None:
        updates.append("stage = ?")
        params.append(stage)
    if progress is not None:
        updates.append("progress = ?")
        params.append(progress)
    if clips is not None:
        updates.append("clips_json = ?")
        params.append(json.dumps(clips))
    if renders is not None:
        updates.append("renders_json = ?")
        params.append(json.dumps(renders))
    if step_detail is not None:
        updates.append("step_detail = ?")
        params.append(step_detail)
    if transcript is not None:
        updates.append("transcript_json = ?")
        params.append(json.dumps(transcript))
    if script_content is not None:
        updates.append("script_content = ?")
        params.append(script_content)
    if error is not None:
        updates.append("error = ?")
        params.append(error)
        
    params.append(job_id)
    c.execute(f"UPDATE auto_shorts_jobs SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()

def _run_auto_shorts_pipeline(job_id: str):
    """
    Executes Ingest & Transcription, then pauses with status 'transcript_ready'
    so the user can inspect, edit, or adjust transcript before proceeding!
    """
    job = get_auto_shorts_job(job_id)
    if not job:
        return
        
    url = job["youtube_url"]
    project_id = job["project_id"]
    
    update_job_status(job_id, status="running", stage="ingest", progress=0.1, step_detail="Connecting to YouTube...")
    
    try:
        # Step 1: Ingest via _download_ytdlp
        from .main import _download_ytdlp
        ingest_dir = config.DATA_DIR / f"ingest_{job_id}"
        ingest_dir.mkdir(parents=True, exist_ok=True)
        
        def download_progress(p: float):
            pct = int(p * 100)
            update_job_status(job_id, progress=0.1 + (p * 0.2), step_detail=f"Downloading source stream: {pct}% complete")
            
        src_path, video_title = _download_ytdlp(url, ingest_dir, progress_cb=download_progress)
        
        update_job_status(job_id, progress=0.30, step_detail="Source video downloaded. Registering project metadata...")
        
        # Register video into project
        video_id = uuid.uuid4().hex
        v_dest_dir = config.DATA_DIR / video_id
        v_dest_dir.mkdir(parents=True, exist_ok=True)
        final_src = v_dest_dir / f"source{src_path.suffix}"
        import shutil
        shutil.move(str(src_path), str(final_src))
        
        # Generate metadata using fx.probe
        from . import ffmpeg_utils as fx
        probe_info = fx.probe(final_src)
        dur = float(probe_info.get("duration", 0))
        w = int(probe_info.get("width", 1920))
        h = int(probe_info.get("height", 1080))
        
        meta = {
            "name": video_title,
            "duration": dur,
            "width": w,
            "height": h,
            "source": final_src.name
        }
        (v_dest_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
        
        # Update project with video_id
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("UPDATE projects SET video_id = ?, video_name = ?, video_duration = ?, updated_at = ? WHERE id = ?",
                  (video_id, video_title, dur, time.time(), project_id))
        conn.commit()
        conn.close()
        
        # Step 2: Transcript extraction (Fast YouTube Captions -> faster-whisper fallback)
        update_job_status(job_id, stage="transcript", progress=0.35, step_detail="Extracting spoken Hindi / English transcript...")
        segments = []
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            import re
            m = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", url)
            if m:
                vid_code = m.group(1)
                tx_list = YouTubeTranscriptApi().list(video_id=vid_code)
                try:
                    caption = tx_list.find_transcript(['hi', 'en'])
                except Exception:
                    caption = next(iter(tx_list))
                raw_snips = caption.fetch()
                segments = [{"start": round(s.start, 2), "duration": round(s.duration, 2), "text": s.text.strip()} for s in raw_snips if s.text.strip()]
                update_job_status(job_id, progress=0.45, step_detail=f"Extracted {len(segments)} native speech segments instantly.")
        except Exception as e:
            logger.info(f"Direct caption fetch fallback: {e}")
            
        if not segments:
            update_job_status(job_id, progress=0.38, step_detail="Running local faster-whisper AI speech-to-text...")
            from .transcription_service import transcribe_video_deep
            trans_res = transcribe_video_deep(final_src, model_size="base")
            segments = trans_res.get("segments", [])
            
        # Save transcript to DB transcripts table
        conn = db.get_connection()
        c = conn.cursor()
        full_transcript_text = " ".join(s.get("text", "") for s in segments)
        c.execute("""
            INSERT OR REPLACE INTO transcripts (id, project_id, language, full_text, segments_json, created_at)
            VALUES (?, ?, 'mixed', ?, ?, ?)
        """, (uuid.uuid4().hex, project_id, full_transcript_text, json.dumps(segments), time.time()))
        conn.commit()
        conn.close()
        
        # Save transcript into job and pause for interactive inspection & manual edit if desired
        update_job_status(
            job_id,
            status="transcript_ready",
            stage="transcript",
            progress=0.50,
            step_detail="Transcript is ready! Review, edit text or proceed directly to AI Clip Selection.",
            transcript=segments,
            script_content=full_transcript_text
        )
        
    except Exception as e:
        logger.error(f"Auto shorts pipeline error: {e}", exc_info=True)
        update_job_status(job_id, status="error", error=str(e), step_detail="Pipeline error encountered.")

def proceed_to_ai_selection(job_id: str, custom_transcript: Optional[List[Dict[str, Any]]] = None):
    """
    Continues pipeline from Transcript to AI Clip Selection & Speaker Face Tracking.
    Accepts user-edited transcript so manual corrections are preserved.
    """
    job = get_auto_shorts_job(job_id)
    if not job:
        raise ValueError("Job not found")

    segments = custom_transcript if custom_transcript is not None else job.get("transcript", [])
    num_clips = job.get("num_clips", 5)
    project_id = job.get("project_id")
    
    update_job_status(job_id, status="running", stage="ai_selection", progress=0.55, step_detail="Gemini AI is analyzing discourse hooks...", transcript=segments)
    
    try:
        # Step 3: AI Selection with Gemini
        selected_clips = ai_selection_service.select_viral_clips_from_transcript(
            transcript_segments=segments,
            num_clips=num_clips
        )
        
        update_job_status(job_id, progress=0.70, step_detail="Detecting speaker faces and computing 9:16 reframing crops...")
        
        # Fetch project video source for face tracking
        p = projects_service.get_project(project_id)
        if p and p.get("video_id"):
            src_dir = config.DATA_DIR / p["video_id"]
            meta = json.loads((src_dir / "meta.json").read_text(encoding="utf-8"))
            final_src = src_dir / meta["source"]
            
            for idx, clip in enumerate(selected_clips):
                clip["id"] = uuid.uuid4().hex
                clip["accepted"] = True
                try:
                    face_crop = face_tracker_service.detect_speaker_face_crop(
                        video_path=final_src,
                        start_time=float(clip["start"]),
                        end_time=float(clip["end"])
                    )
                    clip["crop_rect"] = face_crop
                except Exception as e:
                    logger.warning(f"Face crop fallback for clip {idx}: {e}")
                    clip["crop_rect"] = {}
        
        # Pause at review stage
        update_job_status(
            job_id,
            status="awaiting_review",
            stage="review",
            progress=0.75,
            step_detail="AI Clips generated! Review script, adjust timings, or proceed to Render.",
            clips=selected_clips
        )
    except Exception as e:
        logger.error(f"AI selection error: {e}", exc_info=True)
        update_job_status(job_id, status="error", error=str(e), step_detail="AI Clip Selection error.")

def render_approved_auto_shorts(
    job_id: str,
    approved_clips: List[Dict[str, Any]],
    font_file: Optional[str] = None
):
    """
    Renders approved short clips with the template engine, saves them to DB clips & exports table.
    """
    job = get_auto_shorts_job(job_id)
    if not job:
        raise ValueError("Job not found")
        
    project_id = job["project_id"]
    template_id = job["template_id"]
    
    # Get project video source
    p = projects_service.get_project(project_id)
    src_dir = config.DATA_DIR / p["video_id"]
    meta = json.loads((src_dir / "meta.json").read_text(encoding="utf-8"))
    src_video = src_dir / meta["source"]
    
    update_job_status(job_id, status="rendering", stage="render", progress=0.80, step_detail="Preparing 1080x1920 Shorts renderer...")
    
    rendered_results = []
    total = len(approved_clips)
    
    for idx, clip in enumerate(approved_clips):
        if not clip.get("accepted", True):
            continue
            
        c_id = clip.get("id") or uuid.uuid4().hex
        out_name = f"short_{c_id[:8]}.mp4"
        export_dir = config.DATA_DIR / "exports" / project_id
        export_dir.mkdir(parents=True, exist_ok=True)
        out_file = export_dir / out_name
        
        clip_title = clip.get("hook_title", f"Short #{idx+1}")
        update_job_status(
            job_id,
            progress=0.80 + (0.19 * idx / max(total, 1)),
            step_detail=f"Rendering clip {idx+1}/{total}: '{clip_title}' with Khand subtitles..."
        )
        
        shorts_engine.render_short_clip(
            input_video=src_video,
            output_path=out_file,
            start_time=float(clip["start"]),
            end_time=float(clip["end"]),
            template_id=template_id,
            crop_rect=clip.get("crop_rect"),
            custom_subtitles=clip.get("custom_subtitles")
        )
        
        # Save into database clips table
        clips_service.create_clip(
            project_id=project_id,
            name=clip_title,
            start_time=float(clip["start"]),
            end_time=float(clip["end"])
        )
        
        # Save into database exports table
        conn = db.get_connection()
        c = conn.cursor()
        export_id = uuid.uuid4().hex
        file_size = out_file.stat().st_size if out_file.is_file() else 0
        c.execute("""
            INSERT INTO exports (id, project_id, name, export_type, format, resolution, file_path, file_size, duration, status, created_at)
            VALUES (?, ?, ?, 'short', 'mp4', '1080x1920', ?, ?, ?, 'completed', ?)
        """, (export_id, project_id, clip_title, str(out_file), file_size, float(clip["end"]) - float(clip["start"]), time.time()))
        conn.commit()
        conn.close()
        
        rendered_results.append({
            "clip_id": c_id,
            "export_id": export_id,
            "title": clip_title,
            "file_path": str(out_file),
            "download_url": f"/api/exports/{export_id}/download"
        })
        
    update_job_status(
        job_id,
        status="completed",
        stage="done",
        progress=1.0,
        step_detail="All Shorts successfully rendered and added to Export Center!",
        renders=rendered_results
    )
