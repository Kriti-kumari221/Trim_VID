import json
import os
import shutil
import subprocess
import time
import uuid
import zipfile
from pathlib import Path
from typing import Optional, List, Dict, Any
from . import db, config, subtitles_service, enhancement_service, ffmpeg_utils as fx

EXPORTS_DIR = config.DATA_DIR / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

def assemble_short_video(
    project_id: str,
    clip_ids: List[str],
    music_track_id: Optional[str] = None,
    music_volume: float = 0.2,
    subtitle_preset: Optional[str] = "pop_ap_yellow",
    subtitle_config: Optional[Dict[str, Any]] = None,
    aspect_ratio: str = "9:16",
    resolution: str = "1080p",
    enhancements: Optional[Dict[str, Any]] = None,
    export_name: str = "Assembled_Short"
) -> Dict[str, Any]:
    """Combines clips, adds background music, burns subtitles, and renders final video."""
    conn = db.get_connection()
    c = conn.cursor()
    p_row = c.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not p_row:
        conn.close()
        raise ValueError("Project not found.")
        
    src_video = config.DATA_DIR / p_row["video_id"] / p_row["video_name"]
    if not src_video.is_file():
        # Fallback to source.*
        cands = list((config.DATA_DIR / p_row["video_id"]).glob("source.*"))
        if cands:
            src_video = cands[0]
            
    # Fetch clips in order
    placeholders = ",".join("?" * len(clip_ids))
    clips = [dict(r) for r in c.execute(f"SELECT * FROM clips WHERE id IN ({placeholders})", clip_ids).fetchall()]
    # Maintain user's ordered sequence
    clip_dict = {clip["id"]: clip for clip in clips}
    ordered_clips = [clip_dict[cid] for cid in clip_ids if cid in clip_dict]
    
    if not ordered_clips:
        conn.close()
        raise ValueError("No valid clips selected.")

    # Background music path
    music_path = None
    if music_track_id:
        m_row = c.execute("SELECT * FROM music_tracks WHERE id = ?", (music_track_id,)).fetchone()
        if m_row:
            music_path = config.DATA_DIR / "music" / m_row["filename"]
            
    # Subtitle segments from transcript
    subtitle_segments = []
    if subtitle_preset:
        t_row = c.execute("SELECT segments_json FROM transcripts WHERE project_id = ?", (project_id,)).fetchone()
        if t_row and t_row["segments_json"]:
            all_segs = json.loads(t_row["segments_json"])
            # Remap timestamps relative to the assembled timeline
            current_timeline_offset = 0.0
            for clip in ordered_clips:
                c_start = clip["start_time"]
                c_end = clip["end_time"]
                c_dur = c_end - c_start
                # Find transcript segments inside this clip
                for s in all_segs:
                    if s["end"] > c_start and s["start"] < c_end:
                        new_s_start = max(0.0, s["start"] - c_start) + current_timeline_offset
                        new_s_end = min(c_dur, s["end"] - c_start) + current_timeline_offset
                        subtitle_segments.append({
                            "start": round(new_s_start, 2),
                            "end": round(new_s_end, 2),
                            "text": s["text"]
                        })
                current_timeline_offset += c_dur

    export_id = uuid.uuid4().hex
    out_filename = f"{export_name}_{export_id[:8]}.mp4"
    final_out = EXPORTS_DIR / out_filename
    temp_dir = config.DATA_DIR / f"tmp_asm_{export_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Save pending export record
    c.execute("""
        INSERT INTO exports (id, project_id, name, export_type, format, resolution, file_path, status, created_at)
        VALUES (?, ?, ?, 'short_video', 'mp4', ?, ?, 'processing', ?)
    """, (export_id, project_id, export_name, resolution, str(final_out), time.time()))
    conn.commit()
    conn.close()

    try:
        # Step 1: Cut individual clip segments with aspect ratio and enhancements
        temp_segments = []
        enh_opts = enhancements or {}
        enh_opts["aspect_ratio"] = aspect_ratio
        vf_filters, af_filters = enhancement_service.build_enhancement_filter(enh_opts)
        
        for idx, clip in enumerate(ordered_clips):
            part_path = temp_dir / f"clip_{idx:03d}.mp4"
            start_t = clip["start_time"]
            dur = clip["end_time"] - start_t
            
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-nostdin", "-loglevel", "error",
                "-ss", f"{start_t:.3f}", "-i", str(src_video), "-t", f"{dur:.3f}",
                "-map", "0:v:0", "-map", "0:a:0?"
            ]
            
            if vf_filters:
                filter_str = vf_filters[0]
                # Ensure input pad is explicit if using split
                if filter_str.startswith("split"):
                    filter_str = f"[0:v]{filter_str}"
                out_pad = "[outv]" if "[outv]" in filter_str else ("[fg]" if "overlay" not in filter_str else "0:v:0")
                if "[bg][fg]overlay=(W-w)/2:(H-h)/2" in filter_str and "[outv]" not in filter_str:
                    filter_str = filter_str.replace("[bg][fg]overlay=(W-w)/2:(H-h)/2", "[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]")
                    out_pad = "[outv]"
                cmd.extend(["-filter_complex", filter_str, "-map", out_pad, "-map", "0:a:0?"])
            else:
                cmd.extend(["-map", "0:v:0", "-map", "0:a:0?"])
                
            cmd.extend([
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
                str(part_path)
            ])
            
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if r.returncode != 0:
                # Simpler cut fallback if complex filter fails
                cmd_simple = [
                    "ffmpeg", "-y", "-hide_banner", "-nostdin", "-loglevel", "error",
                    "-ss", f"{start_t:.3f}", "-i", str(src_video), "-t", f"{dur:.3f}",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-c:a", "aac", "-b:a", "192k", str(part_path)
                ]
                subprocess.run(cmd_simple, check=True)
            temp_segments.append(part_path)

        # Step 2: Concat clips together
        concat_txt = temp_dir / "concat.txt"
        with open(concat_txt, "w", encoding="utf-8") as f:
            for p in temp_segments:
                escaped = str(p.resolve()).replace("\\", "/")
                f.write(f"file '{escaped}'\n")
                
        concatenated_video = temp_dir / "concatenated.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-f", "concat", "-safe", "0",
            "-i", str(concat_txt), "-c", "copy", str(concatenated_video)
        ], check=True)

        # Step 3: Subtitles and Background Music Mixing
        ass_path = None
        if subtitle_segments and (subtitle_config or subtitle_preset):
            sub_target = subtitle_config if subtitle_config else subtitle_preset
            ass_path = subtitles_service.generate_ass_subtitles(
                subtitle_segments,
                sub_target,
                temp_dir / "subs.ass",
                canvas_w=1080 if aspect_ratio == "9:16" else (1920 if aspect_ratio == "16:9" else 1080),
                canvas_h=1920 if aspect_ratio == "9:16" else (1080 if aspect_ratio == "16:9" else 1080)
            )

        final_cmd = ["ffmpeg", "-y", "-hide_banner", "-i", str(concatenated_video)]
        
        if music_path and music_path.is_file():
            final_cmd.extend(["-stream_loop", "-1", "-i", str(music_path)])
            
        # Audio filter for mixing video audio + background music
        filter_complex = []
        if music_path and music_path.is_file():
            filter_complex.append(f"[1:a]volume={music_volume:.2f}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]")
            
        if ass_path and ass_path.is_file():
            # Escape path for FFmpeg subtitles filter
            ass_escaped = str(ass_path.resolve()).replace("\\", "/").replace(":", "\\:")
            filter_complex.append(f"[0:v]subtitles='{ass_escaped}'[vout]")
            
        if filter_complex:
            final_cmd.extend(["-filter_complex", ";".join(filter_complex)])
            if ass_path:
                final_cmd.extend(["-map", "[vout]"])
            else:
                final_cmd.extend(["-map", "0:v:0"])
            if music_path:
                final_cmd.extend(["-map", "[aout]"])
            else:
                final_cmd.extend(["-map", "0:a:0?"])
            final_cmd.extend(["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-b:v", "6M", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", str(final_out)])
        else:
            final_cmd.extend(["-c", "copy", "-movflags", "+faststart", str(final_out)])
        subprocess.run(final_cmd, check=True)

        file_size = final_out.stat().st_size
        meta = fx.probe(final_out)
        
        # Update export DB entry
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("""
            UPDATE exports SET status = 'completed', file_size = ?, duration = ? WHERE id = ?
        """, (file_size, meta.get("duration", 0), export_id))
        conn.commit()
        conn.close()

        return {
            "export_id": export_id,
            "filename": out_filename,
            "file_size": file_size,
            "duration": meta.get("duration", 0),
            "download_url": f"/api/exports/{export_id}/download",
            "status": "completed"
        }
    except Exception as e:
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("UPDATE exports SET status = 'failed' WHERE id = ?", (export_id,))
        conn.commit()
        conn.close()
        raise e
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

def create_project_zip_archive(project_id: str, include_clips: bool = True, include_transcript: bool = True) -> Path:
    """Packages project assets (clips, transcript, metadata) into a neat ZIP archive."""
    conn = db.get_connection()
    c = conn.cursor()
    p_row = c.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not p_row:
        conn.close()
        raise ValueError("Project not found.")
        
    p_name = p_row["name"].replace(" ", "_")
    zip_path = EXPORTS_DIR / f"{p_name}_package_{uuid.uuid4().hex[:8]}.zip"
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Project summary JSON
        summary = {
            "project_name": p_row["name"],
            "video_duration": p_row["video_duration"],
            "created_at": p_row["created_at"],
            "status": p_row["status"]
        }
        zf.writestr("project_info.json", json.dumps(summary, indent=2))
        
        # Add transcript if requested
        if include_transcript:
            t_row = c.execute("SELECT * FROM transcripts WHERE project_id = ?", (project_id,)).fetchone()
            if t_row:
                zf.writestr("transcript.txt", t_row["full_text"] or "")
                
        # Add clips metadata
        clips = [dict(r) for r in c.execute("SELECT * FROM clips WHERE project_id = ? ORDER BY sort_order ASC", (project_id,)).fetchall()]
        zf.writestr("clips_list.json", json.dumps(clips, indent=2))
        
    conn.close()
    return zip_path
