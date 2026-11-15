import json
import sqlite3
import uuid
import time
import zipfile
import shutil
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any
from . import db, config, ffmpeg_utils as fx

def create_folder(project_id: str, name: str) -> Dict[str, Any]:
    folder_id = uuid.uuid4().hex
    now = time.time()
    conn = db.get_connection()
    c = conn.cursor()
    max_order = c.execute("SELECT COALESCE(MAX(sort_order), 0) FROM project_folders WHERE project_id = ?", (project_id,)).fetchone()[0]
    c.execute("""
        INSERT INTO project_folders (id, project_id, name, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (folder_id, project_id, name, max_order + 1, now))
    conn.commit()
    conn.close()
    return {"id": folder_id, "project_id": project_id, "name": name, "sort_order": max_order + 1, "created_at": now}

def update_folder(folder_id: str, name: Optional[str] = None, sort_order: Optional[int] = None) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    if name is not None:
        c.execute("UPDATE project_folders SET name = ? WHERE id = ?", (name, folder_id))
    if sort_order is not None:
        c.execute("UPDATE project_folders SET sort_order = ? WHERE id = ?", (sort_order, folder_id))
    conn.commit()
    row = c.execute("SELECT * FROM project_folders WHERE id = ?", (folder_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_folder(folder_id: str) -> bool:
    conn = db.get_connection()
    c = conn.cursor()
    # Unassign clips from this folder
    c.execute("UPDATE clips SET folder_id = NULL WHERE folder_id = ?", (folder_id,))
    c.execute("DELETE FROM project_folders WHERE id = ?", (folder_id,))
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def create_clip(project_id: str, name: str, start_time: float, end_time: float, folder_id: Optional[str] = None) -> Dict[str, Any]:
    clip_id = uuid.uuid4().hex
    now = time.time()
    conn = db.get_connection()
    c = conn.cursor()
    max_order = c.execute("SELECT COALESCE(MAX(sort_order), 0) FROM clips WHERE project_id = ? AND (folder_id = ? OR (folder_id IS NULL AND ? IS NULL))", 
                          (project_id, folder_id, folder_id)).fetchone()[0]
    c.execute("""
        INSERT INTO clips (id, project_id, folder_id, name, start_time, end_time, sort_order, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)
    """, (clip_id, project_id, folder_id, name, round(start_time, 3), round(end_time, 3), max_order + 1, now))
    conn.commit()
    row = c.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
    conn.close()
    return dict(row)

def update_clip(clip_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    allowed = ["name", "folder_id", "start_time", "end_time", "sort_order", "status", "job_id", "output_file"]
    set_clauses = []
    params = []
    for k in allowed:
        if k in updates:
            set_clauses.append(f"{k} = ?")
            params.append(updates[k])
    if set_clauses:
        params.append(clip_id)
        c.execute(f"UPDATE clips SET {', '.join(set_clauses)} WHERE id = ?", params)
        conn.commit()
    row = c.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_clip(clip_id: str) -> bool:
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM clips WHERE id = ?", (clip_id,))
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def duplicate_clip(clip_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    orig = c.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
    if not orig:
        conn.close()
        return None
    new_id = uuid.uuid4().hex
    now = time.time()
    new_name = f"{orig['name']} (Copy)"
    c.execute("""
        INSERT INTO clips (id, project_id, folder_id, name, start_time, end_time, sort_order, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)
    """, (new_id, orig["project_id"], orig["folder_id"], new_name, orig["start_time"], orig["end_time"], orig["sort_order"] + 1, now))
    conn.commit()
    row = c.execute("SELECT * FROM clips WHERE id = ?", (new_id,)).fetchone()
    conn.close()
    return dict(row)

def reorder_clips(clip_ids: List[str]) -> bool:
    conn = db.get_connection()
    c = conn.cursor()
    for index, cid in enumerate(clip_ids):
        c.execute("UPDATE clips SET sort_order = ? WHERE id = ?", (index + 1, cid))
    conn.commit()
    conn.close()
    return True

def auto_number_clips(project_id: str, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Automatically assigns sequential serial numbers e.g. Intro_01.mp4, Intro_02.mp4"""
    conn = db.get_connection()
    c = conn.cursor()
    
    prefix = "Clip"
    if folder_id:
        f_row = c.execute("SELECT name FROM project_folders WHERE id = ?", (folder_id,)).fetchone()
        if f_row and f_row["name"]:
            prefix = f_row["name"].strip().replace(" ", "_")
            
    query = "SELECT id, name FROM clips WHERE project_id = ?"
    params = [project_id]
    if folder_id:
        query += " AND folder_id = ?"
        params.append(folder_id)
    else:
        query += " AND folder_id IS NULL"
    query += " ORDER BY sort_order ASC, created_at ASC"
    
    rows = c.execute(query, params).fetchall()
    updated = []
    for idx, r in enumerate(rows, start=1):
        num_str = f"{idx:02d}"
        new_name = f"{prefix}_{num_str}"
        c.execute("UPDATE clips SET name = ? WHERE id = ?", (new_name, r["id"]))
        updated.append({"id": r["id"], "name": new_name})
        
    conn.commit()
    conn.close()
    return updated

def combine_clips_sequence(src_video: Path, clips_data: List[Dict[str, Any]], out_file: Path, mode: str = "precise"):
    """Cuts clips and stitches them together seamlessly in sequence order."""
    if not clips_data:
        raise ValueError("No clips to combine.")
    
    temp_dir = out_file.parent / f"tmp_concat_{uuid.uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_files = []
    
    try:
        # First, cut each clip individually
        for idx, clip in enumerate(clips_data):
            part_path = temp_dir / f"part_{idx:03d}.mp4"
            start = float(clip["start_time"])
            end = float(clip["end_time"])
            dur = end - start
            
            # Re-encode to ensure consistent timebase, SAR, audio sample rate
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-nostdin", "-loglevel", "error",
                "-ss", f"{start:.3f}", "-i", str(src_video), "-t", f"{dur:.3f}",
                "-map", "0:v:0", "-map", "0:a:0?",
                "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                str(part_path)
            ]
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if r.returncode != 0:
                raise RuntimeError(f"Failed cutting clip segment {clip.get('name')}: {r.stderr}")
            temp_files.append(part_path)
            
        # Concat list file
        concat_txt = temp_dir / "concat.txt"
        with open(concat_txt, "w", encoding="utf-8") as f:
            for p in temp_files:
                # Escape backslashes for FFmpeg concat demuxer
                escaped = str(p.resolve()).replace("\\", "/")
                f.write(f"file '{escaped}'\n")
                
        # Concat demuxer
        concat_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-nostdin", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(concat_txt),
            "-c", "copy", "-movflags", "+faststart", str(out_file)
        ]
        r = subprocess.run(concat_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            raise RuntimeError(f"Concat failed: {r.stderr}")
            
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
