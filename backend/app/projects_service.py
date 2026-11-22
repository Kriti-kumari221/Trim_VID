import json
import sqlite3
import uuid
import time
from pathlib import Path
from typing import Optional, List, Dict, Any
from . import db, config

def list_projects(search: str = "", folder: str = "", user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    query = "SELECT * FROM projects WHERE 1=1"
    params = []
    if user_id:
        # Strict user isolation: Logged-in users see ONLY their own projects
        query += " AND user_id = ?"
        params.append(user_id)
    else:
        # Guests see unassigned projects or nothing
        query += " AND (user_id IS NULL OR user_id = '')"

    if search:
        query += " AND (name LIKE ? OR video_name LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    if folder:
        query += " AND folder = ?"
        params.append(folder)
    query += " ORDER BY updated_at DESC"
    rows = c.execute(query, params).fetchall()
    
    projects = []
    for r in rows:
        clip_count = c.execute("SELECT COUNT(*) FROM clips WHERE project_id = ?", (r["id"],)).fetchone()[0]
        has_transcript = c.execute("SELECT 1 FROM transcripts WHERE project_id = ?", (r["id"],)).fetchone() is not None
        has_analysis = c.execute("SELECT 1 FROM ai_analyses WHERE project_id = ?", (r["id"],)).fetchone() is not None
        projects.append({
            "id": r["id"],
            "name": r["name"],
            "folder": r["folder"],
            "video_id": r["video_id"],
            "video_name": r["video_name"],
            "video_duration": r["video_duration"],
            "thumbnail_url": r["thumbnail_url"],
            "status": r["status"],
            "settings": json.loads(r["settings_json"] or "{}"),
            "clip_count": clip_count,
            "has_transcript": has_transcript,
            "has_analysis": has_analysis,
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        })
    conn.close()
    return projects

def create_project(name: str, folder: str = "General", video_id: Optional[str] = None, user_id: Optional[str] = None) -> Dict[str, Any]:
    project_id = uuid.uuid4().hex
    now = time.time()
    video_name = ""
    video_duration = 0.0
    thumbnail_url = ""
    
    if video_id:
        video_dir = config.DATA_DIR / video_id
        meta_file = video_dir / "meta.json"
        if meta_file.is_file():
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            video_name = meta.get("name", "")
            video_duration = float(meta.get("duration", 0))
            if (video_dir / "thumbs" / "000.jpg").is_file():
                thumbnail_url = f"/api/video/{video_id}/thumbs/0"

    conn = db.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO projects (id, name, folder, video_id, video_name, video_duration, thumbnail_url, status, settings_json, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', '{}', ?, ?, ?)
    """, (project_id, name, folder or "General", video_id, video_name, video_duration, thumbnail_url, user_id, now, now))
    
    # Create default folders
    for f_name, sort in [("Introduction", 1), ("Main Story", 2), ("Conclusion", 3)]:
        c.execute("""
            INSERT INTO project_folders (id, project_id, name, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (uuid.uuid4().hex, project_id, f_name, sort, now))
        
    conn.commit()
    conn.close()
    return get_project(project_id)

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    row = c.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not row:
        conn.close()
        return None
    
    folders = [dict(r) for r in c.execute("SELECT * FROM project_folders WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC", (project_id,)).fetchall()]
    clips = [dict(r) for r in c.execute("SELECT * FROM clips WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC", (project_id,)).fetchall()]
    
    transcript_row = c.execute("SELECT * FROM transcripts WHERE project_id = ?", (project_id,)).fetchone()
    transcript = None
    if transcript_row:
        transcript = {
            "id": transcript_row["id"],
            "language": transcript_row["language"],
            "full_text": transcript_row["full_text"],
            "segments": json.loads(transcript_row["segments_json"] or "[]"),
            "created_at": transcript_row["created_at"]
        }
        
    analysis_row = c.execute("SELECT * FROM ai_analyses WHERE project_id = ?", (project_id,)).fetchone()
    analysis = None
    if analysis_row:
        analysis = {
            "id": analysis_row["id"],
            "summary": analysis_row["summary"],
            "topics": json.loads(analysis_row["topics_json"] or "[]"),
            "moments": json.loads(analysis_row["moments_json"] or "[]"),
            "viral_hooks": json.loads(analysis_row["viral_hooks_json"] or "[]"),
            "created_at": analysis_row["created_at"]
        }
        
    scripts = []
    for s in c.execute("SELECT * FROM scripts WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall():
        scripts.append({
            "id": s["id"],
            "title": s["title"],
            "duration_target": s["duration_target"],
            "style": s["style"],
            "scenes": json.loads(s["scenes_json"] or "[]"),
            "created_at": s["created_at"]
        })
        
    exports = [dict(r) for r in c.execute("SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall()]
    conn.close()
    
    return {
        "id": row["id"],
        "name": row["name"],
        "folder": row["folder"],
        "video_id": row["video_id"],
        "video_name": row["video_name"],
        "video_duration": row["video_duration"],
        "thumbnail_url": row["thumbnail_url"],
        "status": row["status"],
        "settings": json.loads(row["settings_json"] or "{}"),
        "folders": folders,
        "clips": clips,
        "transcript": transcript,
        "analysis": analysis,
        "scripts": scripts,
        "exports": exports,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"]
    }

def update_project(project_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    allowed = ["name", "folder", "video_id", "video_name", "video_duration", "thumbnail_url", "status", "settings_json"]
    set_clauses = []
    params = []
    
    for k in allowed:
        if k in updates:
            set_clauses.append(f"{k} = ?")
            val = updates[k]
            if k == "settings_json" and not isinstance(val, str):
                val = json.dumps(val)
            params.append(val)
            
    if "settings" in updates and "settings_json" not in updates:
        set_clauses.append("settings_json = ?")
        params.append(json.dumps(updates["settings"]))
        
    set_clauses.append("updated_at = ?")
    params.append(time.time())
    params.append(project_id)
    
    c.execute(f"UPDATE projects SET {', '.join(set_clauses)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return get_project(project_id)

def delete_project(project_id: str) -> bool:
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def duplicate_project(project_id: str) -> Optional[Dict[str, Any]]:
    original = get_project(project_id)
    if not original:
        return None
    new_name = f"{original['name']} (Copy)"
    new_proj = create_project(new_name, original["folder"], original["video_id"])
    new_id = new_proj["id"]
    now = time.time()
    
    conn = db.get_connection()
    c = conn.cursor()
    
    # Map old folders to new folder ids
    folder_map = {}
    for f in original["folders"]:
        new_fid = uuid.uuid4().hex
        folder_map[f["id"]] = new_fid
        c.execute("""
            INSERT INTO project_folders (id, project_id, name, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (new_fid, new_id, f["name"], f["sort_order"], now))
        
    # Copy clips
    for clip in original["clips"]:
        new_cid = uuid.uuid4().hex
        new_fid = folder_map.get(clip["folder_id"])
        c.execute("""
            INSERT INTO clips (id, project_id, folder_id, name, start_time, end_time, sort_order, status, job_id, output_file, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (new_cid, new_id, new_fid, clip["name"], clip["start_time"], clip["end_time"], clip["sort_order"], clip["status"], clip["job_id"], clip["output_file"], now))
        
    # Copy transcript
    if original["transcript"]:
        t = original["transcript"]
        c.execute("""
            INSERT INTO transcripts (id, project_id, language, full_text, segments_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (uuid.uuid4().hex, new_id, t["language"], t["full_text"], json.dumps(t["segments"]), now))
        
    # Copy analysis
    if original["analysis"]:
        a = original["analysis"]
        c.execute("""
            INSERT INTO ai_analyses (id, project_id, summary, topics_json, moments_json, viral_hooks_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (uuid.uuid4().hex, new_id, a["summary"], json.dumps(a["topics"]), json.dumps(a["moments"]), json.dumps(a["viral_hooks"]), now))
        
    # Copy scripts
    for s in original["scripts"]:
        c.execute("""
            INSERT INTO scripts (id, project_id, title, duration_target, style, scenes_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (uuid.uuid4().hex, new_id, s["title"], s["duration_target"], s["style"], json.dumps(s["scenes"]), now))
        
    conn.commit()
    conn.close()
    return get_project(new_id)
