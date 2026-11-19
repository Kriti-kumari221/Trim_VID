import json
import os
import shutil
import time
import uuid
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, List, Dict, Any, Literal
from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import config, db, projects_service, clips_service, gdrive_service
from . import transcription_service, ai_analyzer_service, music_service, subtitles_service, enhancement_service, assembly_service

router = APIRouter(prefix="/api", tags=["studio"])

# Background thread pool for long-running studio tasks (transcription, analysis, etc.)
_studio_pool = ThreadPoolExecutor(max_workers=2)
# In-memory task store: { task_id: { status, progress, result, error } }
_STUDIO_TASKS: Dict[str, Dict] = {}

# ----------------- Models -----------------
class CreateProjectReq(BaseModel):
    name: str
    folder: str = "General"
    video_id: Optional[str] = None

class UpdateProjectReq(BaseModel):
    name: Optional[str] = None
    folder: Optional[str] = None
    status: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    video_id: Optional[str] = None
    video_name: Optional[str] = None
    video_duration: Optional[float] = None
    thumbnail_url: Optional[str] = None

class CreateFolderReq(BaseModel):
    name: str

class UpdateFolderReq(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None

class CreateClipReq(BaseModel):
    name: str
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)
    folder_id: Optional[str] = None

class UpdateClipReq(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None

class ReorderClipsReq(BaseModel):
    clip_ids: List[str]

class AutoNumberReq(BaseModel):
    folder_id: Optional[str] = None

class TranscribeReq(BaseModel):
    language: Optional[str] = "auto"
    model_size: str = "base"

class YouTubeTranscribeReq(BaseModel):
    url: str

class UpdateTranscriptReq(BaseModel):
    segments: List[Dict[str, Any]]

class ParseScriptReq(BaseModel):
    script_text: str

class ParseTranscriptReq(BaseModel):
    raw_text: str

class GenerateScriptReq(BaseModel):
    topic_id: Optional[str] = None
    duration_target: int = 60
    style: str = "educational"
    api_key: Optional[str] = None
    provider: Optional[str] = "gemini"

class MapScriptClipsReq(BaseModel):
    folder_name: str = "Script Clips"

class GenerateMusicReq(BaseModel):
    mood: str = "emotional"
    genre: str = "cinematic"
    duration: float = 60.0

class DetectMusicReq(BaseModel):
    script_id: Optional[str] = None
    script_text: Optional[str] = None
    api_key: Optional[str] = None

class AuditMusicReq(BaseModel):
    name: Optional[str] = None
    mood: Optional[str] = None
    genre: Optional[str] = None
    tempo: Optional[int] = None
    energy: Optional[str] = None
    re_render: bool = False

class AssembleReq(BaseModel):
    clip_ids: List[str]
    music_track_id: Optional[str] = None
    music_volume: float = 0.2
    subtitle_preset: Optional[str] = "viral_yellow"
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    enhancements: Optional[Dict[str, Any]] = None
    export_name: str = "Short_Video"

class GDriveImportReq(BaseModel):
    url: str

class GDriveExtractReq(BaseModel):
    zip_path: str
    selected_filenames: List[str]

# ----------------- Projects -----------------
@router.get("/projects")
def get_projects(search: str = "", folder: str = ""):
    return projects_service.list_projects(search, folder)

@router.post("/projects")
def create_project_route(req: CreateProjectReq):
    return projects_service.create_project(req.name, req.folder, req.video_id)

@router.get("/projects/{project_id}")
def get_project_route(project_id: str):
    p = projects_service.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p

@router.put("/projects/{project_id}")
def update_project_route(project_id: str, req: UpdateProjectReq):
    updates = req.dict(exclude_unset=True)
    p = projects_service.update_project(project_id, updates)
    if not p:
        raise HTTPException(404, "Project not found")
    return p

@router.delete("/projects/{project_id}")
def delete_project_route(project_id: str):
    success = projects_service.delete_project(project_id)
    if not success:
        raise HTTPException(404, "Project not found")
    return {"deleted": True}

@router.post("/projects/{project_id}/duplicate")
def duplicate_project_route(project_id: str):
    dup = projects_service.duplicate_project(project_id)
    if not dup:
        raise HTTPException(404, "Project not found")
    return dup

# ----------------- Clip Folders -----------------
@router.post("/projects/{project_id}/folders")
def create_folder_route(project_id: str, req: CreateFolderReq):
    return clips_service.create_folder(project_id, req.name)

@router.put("/folders/{folder_id}")
def update_folder_route(folder_id: str, req: UpdateFolderReq):
    f = clips_service.update_folder(folder_id, req.name, req.sort_order)
    if not f:
        raise HTTPException(404, "Folder not found")
    return f

@router.delete("/folders/{folder_id}")
def delete_folder_route(folder_id: str):
    success = clips_service.delete_folder(folder_id)
    if not success:
        raise HTTPException(404, "Folder not found")
    return {"deleted": True}

# ----------------- Clips -----------------
@router.post("/projects/{project_id}/clips")
def create_clip_route(project_id: str, req: CreateClipReq):
    if req.start_time >= req.end_time:
        raise HTTPException(400, "Start time must be before end time.")
    return clips_service.create_clip(project_id, req.name, req.start_time, req.end_time, req.folder_id)

@router.put("/clips/{clip_id}")
def update_clip_route(clip_id: str, req: UpdateClipReq):
    updates = req.dict(exclude_unset=True)
    c = clips_service.update_clip(clip_id, updates)
    if not c:
        raise HTTPException(404, "Clip not found")
    return c

@router.delete("/clips/{clip_id}")
def delete_clip_route(clip_id: str):
    success = clips_service.delete_clip(clip_id)
    if not success:
        raise HTTPException(404, "Clip not found")
    return {"deleted": True}

@router.post("/clips/{clip_id}/duplicate")
def duplicate_clip_route(clip_id: str):
    dup = clips_service.duplicate_clip(clip_id)
    if not dup:
        raise HTTPException(404, "Clip not found")
    return dup

@router.post("/projects/{project_id}/clips/reorder")
def reorder_clips_route(project_id: str, req: ReorderClipsReq):
    clips_service.reorder_clips(req.clip_ids)
    return {"reordered": True}

@router.post("/projects/{project_id}/clips/auto-number")
def auto_number_route(project_id: str, req: AutoNumberReq):
    return clips_service.auto_number_clips(project_id, req.folder_id)

# ----------------- Google Drive & ZIP Handling -----------------
@router.post("/gdrive/import")
def gdrive_import(req: GDriveImportReq):
    file_id = gdrive_service.extract_drive_file_id(req.url)
    if not file_id:
        raise HTTPException(400, "Invalid Google Drive URL. Enter a valid drive.google.com link.")
        
    temp_dest = config.DATA_DIR / f"gdrive_{uuid.uuid4().hex}"
    temp_dest.mkdir(parents=True, exist_ok=True)
    target_file = temp_dest / f"drive_download_{file_id}"
    
    try:
        gdrive_service.download_drive_file(file_id, target_file)
        
        # Check if downloaded file is a ZIP archive
        if zipfile.is_zipfile(target_file):
            items = gdrive_service.inspect_zip_contents(target_file)
            return {
                "type": "zip",
                "zip_path": str(target_file),
                "total_files": len(items),
                "files": items
            }
        else:
            # Assessment of single video
            assessment = gdrive_service.assess_video_file(target_file)
            return {
                "type": "video",
                "file_path": str(target_file),
                "assessment": assessment
            }
    except Exception as e:
        shutil.rmtree(temp_dest, ignore_errors=True)
        raise HTTPException(400, f"Google Drive import error: {e}")

@router.post("/gdrive/zip/extract")
def extract_zip_assets(req: GDriveExtractReq):
    zip_path = Path(req.zip_path)
    if not zip_path.is_file():
        raise HTTPException(404, "ZIP file not found.")
        
    out_dir = zip_path.parent / "extracted"
    extracted_paths = gdrive_service.extract_selected_from_zip(zip_path, out_dir, req.selected_filenames)
    
    assessments = []
    for p in extracted_paths:
        ext = p.suffix.lower()
        if ext in {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mts"}:
            assessments.append(gdrive_service.assess_video_file(p))
            
    return {
        "extracted_count": len(extracted_paths),
        "video_assessments": assessments
    }

@router.get("/assessments/{assessment_id}/thumb.jpg")
def get_assessment_thumb(assessment_id: str):
    f = config.DATA_DIR / f"assess_{assessment_id}" / "thumb.jpg"
    if not f.is_file():
        raise HTTPException(404, "Thumbnail not found")
    return FileResponse(f, media_type="image/jpeg")

# ----------------- Transcription -----------------
def _make_task(task_type: str) -> Dict:
    tid = uuid.uuid4().hex
    task = {"id": tid, "type": task_type, "status": "running", "progress": 0.0, "result": None, "error": None}
    _STUDIO_TASKS[tid] = task
    return task

@router.get("/studio-tasks/{task_id}")
def get_studio_task(task_id: str):
    t = _STUDIO_TASKS.get(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return {k: t[k] for k in ("id", "type", "status", "progress", "error")}

@router.get("/studio-tasks/{task_id}/result")
def get_studio_task_result(task_id: str):
    t = _STUDIO_TASKS.get(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if t["status"] != "done":
        raise HTTPException(409, "Task not finished yet")
    return t["result"]

@router.post("/projects/{project_id}/transcribe-youtube")
def transcribe_youtube_route(project_id: str, req: YouTubeTranscribeReq):
    """Instantly extracts YouTube subtitles/captions with timestamps (like Tactiq)."""
    res = transcription_service.extract_youtube_transcript_fast(req.url, project_id=project_id)
    if not res:
        reason = getattr(transcription_service, "LAST_TRANSCRIPT_ERROR", "") or "unknown reason"
        raise HTTPException(400, f"Could not extract captions: {reason}")
    return res


@router.post("/projects/{project_id}/transcribe")
def transcribe_project_route(project_id: str, req: TranscribeReq):
    p = projects_service.get_project(project_id)
    if not p or not p["video_id"]:
        raise HTTPException(400, "Project has no video attached to transcribe.")
        
    src_dir = config.DATA_DIR / p["video_id"]
    meta_file = src_dir / "meta.json"
    if not meta_file.is_file():
        raise HTTPException(404, "Video metadata not found.")
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    src_video = src_dir / meta["source"]

    task = _make_task("transcribe")

    def _run():
        try:
            res = transcription_service.transcribe_video(
                project_id=project_id,
                video_path=src_video,
                language=req.language,
                model_size=req.model_size
            )
            task.update(status="done", progress=1.0, result=res)
        except Exception as e:
            task.update(status="failed", error=str(e))

    _studio_pool.submit(_run)
    return {"task_id": task["id"], "status": "running"}

@router.post("/projects/{project_id}/transcript/import-file")
async def import_transcript_file_route(project_id: str, file: UploadFile = File(...)):
    """Imports an SRT, VTT, or TXT transcript file directly from the user's local PC."""
    import re
    content_bytes = await file.read()
    raw_text = content_bytes.decode("utf-8", errors="replace")
    
    from . import ai_selection_service
    segments = []
    
    # Check if format is SRT / VTT or standard timestamped text
    # Standard SRT pattern:
    # 1
    # 00:00:01,000 --> 00:00:04,000
    # Text line
    srt_pattern = re.compile(r"(\d{1,2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{3})\r?\n(.*?)(?=\r?\n\r?\n|\Z)", re.DOTALL)
    srt_matches = list(srt_pattern.finditer(raw_text))
    
    if srt_matches:
        for idx, m in enumerate(srt_matches):
            t_start_str = m.group(1).replace(",", ".")
            t_end_str = m.group(2).replace(",", ".")
            clean_txt = re.sub(r"<[^>]+>", "", m.group(3)).replace("\r\n", " ").replace("\n", " ").strip()
            s_sec = ai_selection_service.parse_time_str(t_start_str)
            e_sec = ai_selection_service.parse_time_str(t_end_str)
            segments.append({
                "id": f"seg_{idx+1}",
                "start": s_sec,
                "end": e_sec,
                "speaker": "Speaker",
                "text": clean_txt
            })
    else:
        # Check standard YouTube / Tactiq timestamp format: 00:00:00.000 Text...
        parsed_raw = ai_selection_service.parse_raw_transcript_text(raw_text)
        for idx, p in enumerate(parsed_raw):
            segments.append({
                "id": f"seg_{idx+1}",
                "start": p["start"],
                "end": p["start"] + p["duration"],
                "speaker": "Speaker",
                "text": p["text"]
            })
            
    if not segments:
        raise HTTPException(400, "Could not parse timestamps from file. Supported formats: .srt, .vtt, or timestamped .txt")
        
    return transcription_service.update_transcript_segments(project_id, segments)

@router.get("/projects/{project_id}/transcript/chunks")
def get_transcript_chunks_route(project_id: str, words_per_cue: int = 3):
    """Returns transcript pre-chunked into punchy 2-4 word spoken cadence cues for live subtitle preview."""
    conn = db.get_connection()
    c = conn.cursor()
    row = c.execute("SELECT segments_json FROM transcripts WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()
    if not row or not row["segments_json"]:
        return []
    segments = json.loads(row["segments_json"])
    return transcription_service.chunk_segments_into_speech_rhythm(segments, words_per_cue=words_per_cue)

@router.put("/projects/{project_id}/transcript")
def update_transcript_route(project_id: str, req: UpdateTranscriptReq):
    return transcription_service.update_transcript_segments(project_id, req.segments)

@router.get("/projects/{project_id}/transcript/export")
def export_transcript_route(project_id: str, format: str = "srt", start: Optional[float] = None, end: Optional[float] = None):
    try:
        filename, media_type, content = transcription_service.export_transcript_file(project_id, format, start_time=start, end_time=end)
        return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    except Exception as e:
        raise HTTPException(400, str(e))

# ----------------- Content Analysis & AI Scripts -----------------
@router.post("/projects/{project_id}/analyze")
def analyze_project_content_route(project_id: str):
    p = projects_service.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p["transcript"] or not p["transcript"]["segments"]:
        raise HTTPException(400, "Please generate a transcript first before analyzing content.")
        
    res = ai_analyzer_service.analyze_transcript_content(
        project_id=project_id,
        transcript_segments=p["transcript"]["segments"],
        video_duration=p["video_duration"] or 180.0
    )
    return res

@router.post("/projects/{project_id}/scripts/generate")
def generate_script_route(project_id: str, req: GenerateScriptReq):
    try:
        return ai_analyzer_service.generate_short_script(
            project_id=project_id,
            topic_id=req.topic_id,
            duration_target=req.duration_target,
            style=req.style,
            api_key=req.api_key,
            provider=req.provider
        )
    except Exception as e:
        raise HTTPException(400, str(e))

@router.post("/projects/{project_id}/scripts/import-custom")
def import_custom_script_route(project_id: str, req: ParseScriptReq):
    try:
        return ai_analyzer_service.save_custom_parsed_script(project_id, req.script_text)
    except Exception as e:
        raise HTTPException(400, str(e))

@router.post("/projects/{project_id}/scripts/{script_id}/map-to-clips")
def map_script_clips_route(project_id: str, script_id: str, req: Optional[MapScriptClipsReq] = None):
    try:
        folder_name = req.folder_name if req and req.folder_name else "Script Clips"
        clips = ai_analyzer_service.map_script_to_project_clips(project_id, script_id, folder_name)
        return {"created_clips": clips}
    except Exception as e:
        raise HTTPException(400, str(e))

# ----------------- AI Instrumental Music -----------------
@router.get("/music")
def list_music(project_id: Optional[str] = None):
    return music_service.list_music_tracks(project_id)

@router.post("/music/generate")
def generate_music_route(req: GenerateMusicReq, project_id: Optional[str] = None):
    try:
        return music_service.generate_music_for_project(
            project_id=project_id,
            mood=req.mood,
            genre=req.genre,
            duration=req.duration
        )
    except Exception as e:
        raise HTTPException(500, f"Music generation error: {e}")

@router.post("/projects/{project_id}/music/detect-and-compose")
def detect_music_from_script_route(project_id: str, req: Optional[DetectMusicReq] = None):
    try:
        script_id = req.script_id if req else None
        script_text = req.script_text if req else None
        api_key = req.api_key if req else None
        return music_service.detect_and_compose_from_script(
            project_id=project_id,
            script_id=script_id,
            custom_script_text=script_text,
            api_key=api_key
        )
    except Exception as e:
        raise HTTPException(500, f"Script-to-music composition failed: {e}")

@router.put("/music/{track_id}/audit")
def audit_music_track_route(track_id: str, req: AuditMusicReq):
    try:
        return music_service.audit_and_update_track(
            track_id=track_id,
            name=req.name,
            mood=req.mood,
            genre=req.genre,
            tempo=req.tempo,
            energy=req.energy,
            re_render=req.re_render
        )
    except Exception as e:
        raise HTTPException(500, f"Track auditing/modification failed: {e}")

@router.delete("/music/{track_id}")
def delete_music_track_route(track_id: str):
    conn = db.get_connection()
    c = conn.cursor()
    row = c.execute("SELECT filename FROM music_tracks WHERE id = ?", (track_id,)).fetchone()
    if row and row["filename"]:
        (config.DATA_DIR / "music" / row["filename"]).unlink(missing_ok=True)
    c.execute("DELETE FROM music_tracks WHERE id = ?", (track_id,))
    conn.commit()
    conn.close()
    return {"deleted": True, "track_id": track_id}

@router.get("/music/{track_id}/audio")
def get_music_audio(track_id: str):
    conn = db.get_connection()
    c = conn.cursor()
    row = c.execute("SELECT filename FROM music_tracks WHERE id = ?", (track_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Track not found")
    audio_file = config.DATA_DIR / "music" / row["filename"]
    if not audio_file.is_file():
        raise HTTPException(404, "Audio file missing")
    return FileResponse(audio_file, media_type="audio/mpeg", filename=row["filename"])

# ----------------- Subtitle Presets -----------------
@router.get("/subtitles/presets")
def get_subtitle_presets():
    return subtitles_service.SUBTITLE_PRESETS

# ----------------- Video Assembly & Export Center -----------------
@router.post("/projects/{project_id}/detect-silence")
def detect_silence_route(project_id: str):
    p = projects_service.get_project(project_id)
    if not p or not p["video_id"]:
        raise HTTPException(400, "Project has no video.")
    src_dir = config.DATA_DIR / p["video_id"]
    meta = json.loads((src_dir / "meta.json").read_text(encoding="utf-8"))
    silences = enhancement_service.detect_silence(src_dir / meta["source"])
    return {"silences": silences}

@router.post("/projects/{project_id}/assemble")
def assemble_route(project_id: str, req: AssembleReq):
    try:
        res = assembly_service.assemble_short_video(
            project_id=project_id,
            clip_ids=req.clip_ids,
            music_track_id=req.music_track_id,
            music_volume=req.music_volume,
            subtitle_preset=req.subtitle_preset,
            aspect_ratio=req.aspect_ratio,
            resolution=req.resolution,
            enhancements=req.enhancements,
            export_name=req.export_name
        )
        return res
    except Exception as e:
        raise HTTPException(500, f"Video assembly failed: {e}")

@router.get("/projects/{project_id}/exports")
def get_project_exports(project_id: str):
    conn = db.get_connection()
    c = conn.cursor()
    rows = c.execute("SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.get("/exports/{export_id}/download")
def download_export(export_id: str):
    conn = db.get_connection()
    c = conn.cursor()
    row = c.execute("SELECT * FROM exports WHERE id = ?", (export_id,)).fetchone()
    conn.close()
    if not row or row["status"] != "completed":
        raise HTTPException(404, "Export not ready or not found")
    f_path = Path(row["file_path"])
    if not f_path.is_file():
        raise HTTPException(404, "File missing")
    return FileResponse(f_path, media_type="video/mp4", filename=f_path.name)

@router.post("/projects/{project_id}/export-zip")
def export_project_zip_route(project_id: str):
    try:
        zip_path = assembly_service.create_project_zip_archive(project_id)
        return FileResponse(zip_path, media_type="application/zip", filename=zip_path.name)
    except Exception as e:
        raise HTTPException(500, str(e))

class CookieReq(BaseModel):
    cookies: str

@router.get("/settings/cookies")
def get_cookie_status():
    cookie_path = config.DATA_DIR / "cookies.txt"
    return {"configured": cookie_path.is_file() and cookie_path.stat().st_size > 0}

@router.post("/settings/cookies")
def save_cookies_route(req: CookieReq):
    cookie_path = config.DATA_DIR / "cookies.txt"
    cookie_path.parent.mkdir(parents=True, exist_ok=True)
    cookie_path.write_text(req.cookies.strip(), encoding="utf-8")
    return {"saved": True, "size": len(req.cookies)}

class ParseScriptReq(BaseModel):
    script_text: str

class ParseTranscriptReq(BaseModel):
    raw_text: str

@router.post("/auto-shorts/parse-script")
def parse_script_route(req: ParseScriptReq):
    """Parses a structured user reel script with timestamps into ready-to-render scenes and an overall range."""
    from . import ai_selection_service
    overall_range, scenes = ai_selection_service.parse_custom_script_into_scenes(req.script_text)
    return {
        "overall_range": overall_range,
        "scenes": scenes,
        "total_scenes": len(scenes)
    }

@router.post("/auto-shorts/parse-transcript")
def parse_transcript_route(req: ParseTranscriptReq):
    """Parses pasted YouTube / Tactiq.io transcript with timestamps into standard segment objects."""
    from . import ai_selection_service
    segments = ai_selection_service.parse_raw_transcript_text(req.raw_text)
    return {
        "segments": segments,
        "total_segments": len(segments)
    }

# ----------------- Auto Shorts Pipeline Endpoints -----------------
class CreateAutoShortsReq(BaseModel):
    youtube_url: str
    template_id: str = "acharya_prashant_classic"
    num_clips: int = 5
    project_id: Optional[str] = None

class RenderApprovedReq(BaseModel):
    clips: List[Dict[str, Any]]
    font_file: Optional[str] = None
    casing: Optional[str] = "uppercase"
    animation_effect: Optional[str] = "scale_pop"

class ProceedAISelectionReq(BaseModel):
    custom_transcript: Optional[List[Dict[str, Any]]] = None

@router.get("/fonts")
def list_fonts_route():
    from . import config
    fonts_dir = config.DATA_DIR / "fonts"
    if not fonts_dir.is_dir():
        return []
    fonts = []
    for f in fonts_dir.glob("*.ttf"):
        fonts.append({"name": f.stem, "filename": f.name})
    return fonts

@router.get("/templates")
def list_templates_route():
    from . import template_service
    return template_service.list_templates()

@router.get("/templates/{template_id}")
def get_template_route(template_id: str):
    from . import template_service
    t = template_service.load_template(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    return t

@router.post("/auto-shorts/create")
def create_auto_shorts_route(req: CreateAutoShortsReq):
    from . import auto_shorts_service
    try:
        job = auto_shorts_service.create_auto_shorts_job(
            youtube_url=req.youtube_url,
            template_id=req.template_id,
            num_clips=req.num_clips,
            project_id=req.project_id
        )
        return job
    except Exception as e:
        raise HTTPException(500, f"Failed to start auto shorts pipeline: {e}")

@router.get("/auto-shorts/jobs/{job_id}")
def get_auto_shorts_job_route(job_id: str):
    from . import auto_shorts_service
    job = auto_shorts_service.get_auto_shorts_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job

@router.post("/auto-shorts/jobs/{job_id}/proceed-ai")
def proceed_ai_route(job_id: str, req: ProceedAISelectionReq):
    from . import auto_shorts_service
    try:
        threading.Thread(
            target=auto_shorts_service.proceed_to_ai_selection,
            args=(job_id, req.custom_transcript),
            daemon=True
        ).start()
        return {"status": "ai_selection_started", "job_id": job_id}
    except Exception as e:
        raise HTTPException(500, f"Failed to proceed to AI selection: {e}")

@router.post("/auto-shorts/jobs/{job_id}/render")
def render_auto_shorts_route(job_id: str, req: RenderApprovedReq):
    from . import auto_shorts_service
    try:
        threading.Thread(
            target=auto_shorts_service.render_approved_auto_shorts,
            args=(job_id, req.clips, req.font_file, req.casing, req.animation_effect),
            daemon=True
        ).start()
        return {"status": "rendering_started", "job_id": job_id}
    except Exception as e:
        raise HTTPException(500, f"Failed to render approved clips: {e}")

