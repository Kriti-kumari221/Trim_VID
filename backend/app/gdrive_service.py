import re
import os
import urllib.request
import zipfile
import shutil
import uuid
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urlparse, parse_qs
from . import config, ffmpeg_utils as fx, db

# Regex for extracting Google Drive file ID
GDRIVE_ID_PATTERNS = [
    re.compile(r"/file/d/([a-zA-Z0-9_-]+)"),
    re.compile(r"id=([a-zA-Z0-9_-]+)"),
    re.compile(r"/folders/([a-zA-Z0-9_-]+)"),
    re.compile(r"/open\?id=([a-zA-Z0-9_-]+)")
]

def extract_drive_file_id(url: str) -> Optional[str]:
    for pat in GDRIVE_ID_PATTERNS:
        match = pat.search(url)
        if match:
            return match.group(1)
    return None

def get_drive_settings() -> Dict[str, str]:
    conn = db.get_connection()
    c = conn.cursor()
    rows = c.execute("SELECT key, value FROM gdrive_settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

def save_drive_settings(settings: Dict[str, str]):
    conn = db.get_connection()
    c = conn.cursor()
    for k, v in settings.items():
        c.execute("INSERT OR REPLACE INTO gdrive_settings (key, value) VALUES (?, ?)", (k, v))
    conn.commit()
    conn.close()

def download_drive_file(file_id: str, dest_path: Path, on_progress=None) -> Path:
    """Downloads a public or shared Google Drive file using Google's direct export endpoint."""
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    
    with urllib.request.urlopen(req, timeout=60) as resp:
        # Check for Google's large file virus scan confirm token
        content = resp.read()
        # If it returns an HTML confirmation page for large files
        if b"confirm=" in content or b"download_warning" in content:
            token_match = re.search(r"confirm=([a-zA-Z0-9_-]+)", content.decode("utf-8", errors="ignore"))
            token = token_match.group(1) if token_match else "t"
            confirm_url = f"https://drive.google.com/uc?export=download&confirm={token}&id={file_id}"
            req2 = urllib.request.Request(confirm_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req2, timeout=120) as resp2, open(dest_path, "wb") as f:
                total = int(resp2.headers.get("Content-Length") or 0)
                downloaded = 0
                while chunk := resp2.read(1 << 20):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if on_progress and total > 0:
                        on_progress(min(downloaded / total, 1.0))
        else:
            with open(dest_path, "wb") as f:
                f.write(content)
                if on_progress:
                    on_progress(1.0)
                    
    return dest_path

def inspect_zip_contents(zip_path: Path) -> List[Dict[str, Any]]:
    """Inspects files in a ZIP archive without extracting them."""
    items = []
    video_exts = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mts"}
    audio_exts = {".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"}
    sub_exts = {".srt", ".vtt", ".ass", ".sub"}
    img_exts = {".jpg", ".jpeg", ".png", ".webp"}
    
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            p = Path(info.filename)
            ext = p.suffix.lower()
            category = "document"
            if ext in video_exts:
                category = "video"
            elif ext in audio_exts:
                category = "audio"
            elif ext in sub_exts:
                category = "subtitle"
            elif ext in img_exts:
                category = "image"
                
            items.append({
                "filename": info.filename,
                "name": p.name,
                "size": info.file_size,
                "category": category,
                "ext": ext
            })
    return items

def extract_selected_from_zip(zip_path: Path, target_dir: Path, selected_filenames: Optional[List[str]] = None) -> List[Path]:
    """Securely extracts selected files from ZIP preventing Zip Slip."""
    extracted = []
    target_dir.mkdir(parents=True, exist_ok=True)
    target_dir_resolved = target_dir.resolve()
    
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for member in zf.namelist():
            if selected_filenames and member not in selected_filenames:
                continue
            # Security check: prevent Zip Slip path traversal
            dest = (target_dir / member).resolve()
            if not str(dest).startswith(str(target_dir_resolved)):
                continue
            
            info = zf.getinfo(member)
            if info.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
                continue
                
            dest.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as source, open(dest, "wb") as target:
                shutil.copyfileobj(source, target)
            extracted.append(dest)
            
    return extracted

def assess_video_file(file_path: Path) -> Dict[str, Any]:
    """Generates detailed video assessment: duration, resolution, fps, codecs, bitrate, thumbs."""
    try:
        meta = fx.probe(file_path)
    except Exception as e:
        return {"error": str(e), "filename": file_path.name, "path": str(file_path)}
        
    vid = uuid.uuid4().hex
    preview_dir = config.DATA_DIR / f"assess_{vid}"
    preview_dir.mkdir(parents=True, exist_ok=True)
    
    thumb_path = preview_dir / "thumb.jpg"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-ss", f"{min(1.0, meta['duration'] / 2):.3f}",
        "-i", str(file_path), "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "5",
        str(thumb_path)
    ], capture_output=True, timeout=30)
    
    thumb_url = f"/api/assessments/{vid}/thumb.jpg" if thumb_path.is_file() else None
    
    return {
        "assessment_id": vid,
        "name": file_path.name,
        "size": file_path.stat().st_size,
        "duration": meta["duration"],
        "width": meta["width"],
        "height": meta["height"],
        "fps": meta["fps"],
        "video_codec": meta["video_codec"],
        "audio_codec": meta["audio_codec"],
        "has_audio": meta["has_audio"],
        "bitrate": meta["bitrate"],
        "thumbnail_url": thumb_url,
        "path": str(file_path)
    }
