import ipaddress, json, os, re, shutil, socket, threading, time, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config
from . import ffmpeg_utils as fx

try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass

ALLOWED_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mts", ".flv", ".wmv"}
MAX_UPLOAD_BYTES = config.MAX_UPLOAD_MB * 1024 * 1024
THUMBS = 16
ID_RE = re.compile(r"^[a-f0-9]{32}$")

app = FastAPI(title="ClipTrim HD Studio")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
from . import studio_routes
app.include_router(studio_routes.router)
JOBS: dict[str, dict] = {}
pool = ThreadPoolExecutor(config.WORKERS)


class TrimReq(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    mode: Literal["fast", "precise"] = "precise"
    codec: Literal["h264", "h265"] = "h264"
    resolution: Literal["original", "720p", "1080p", "1440p", "4k"] = "original"
    quality: Literal["high", "balanced", "small"] = "high"


class UrlReq(BaseModel):
    url: str


class LocalFileReq(BaseModel):
    file_path: str
    name: str = ""


# ---------- helpers ----------
def _safe_unlink(p: Path):
    try:
        p.unlink(missing_ok=True)
    except OSError:
        pass


def _dir(video_id: str) -> Path:
    if not ID_RE.match(video_id) or not (config.DATA_DIR / video_id).is_dir():
        raise HTTPException(404, "Video not found")
    return config.DATA_DIR / video_id


def _load(video_id: str):
    d = _dir(video_id)
    meta_file = d / "meta.json"
    if not meta_file.is_file():
        raise HTTPException(404, "Video metadata not found")
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    return d, meta


def _validate(req: TrimReq, meta: dict):
    if req.start >= req.end:
        raise HTTPException(400, "Start time must be before end time.")
    if req.end > meta["duration"] + 0.001:
        raise HTTPException(400, f"End time exceeds the video duration ({meta['duration']:.3f}s).")


def _new_video(filename: str):
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, f"Unsupported format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXT))}")
    vid = uuid.uuid4().hex
    d = config.DATA_DIR / vid
    d.mkdir()
    return vid, d, d / f"source{ext}"


def _register(vid, d: Path, src: Path, name: str):
    try:
        meta = fx.probe(src)
    except Exception as e:
        shutil.rmtree(d, ignore_errors=True)
        raise HTTPException(400, str(e))
    meta.update(name=re.sub(r"[^\w.\- ]", "_", name), size=src.stat().st_size, source=src.name, thumbs=THUMBS)
    fx.make_thumbs(src, d / "thumbs", meta["duration"], THUMBS)
    (d / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return {"video_id": vid, "metadata": meta}


# ---------- import ----------
@app.get("/api/config")
def get_config():
    return {"max_upload_mb": config.MAX_UPLOAD_MB, "hw_encoders": fx.hw_encoders(),
            "formats": sorted(e[1:] for e in ALLOWED_EXT)}


@app.post("/api/upload")
def upload(file: UploadFile = File(...)):
    vid, d, src = _new_video(file.filename)
    try:
        n = 0
        with open(src, "wb") as out:
            while chunk := file.file.read(1 << 20):
                n += len(chunk)
                if n > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File exceeds the {MAX_UPLOAD_BYTES // 2**20} MB limit.")
                out.write(chunk)
    except HTTPException:
        shutil.rmtree(d, ignore_errors=True)
        raise
    return _register(vid, d, src, Path(file.filename).name)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def _get_cookie_file() -> Optional[Path]:
    """Checks for cookie file from environment variable YTDLP_COOKIES or local cookies.txt."""
    cookie_content = os.getenv("YTDLP_COOKIES", "").strip()
    if cookie_content:
        cookie_path = config.DATA_DIR / "cookies.txt"
        cookie_path.write_text(cookie_content, encoding="utf-8")
        return cookie_path
    local_cookie = config.DATA_DIR / "cookies.txt"
    if local_cookie.is_file():
        return local_cookie
    base_cookie = config.BASE_DIR / "cookies.txt"
    if base_cookie.is_file():
        return base_cookie
    return None


def _yt_opts_for_client(clients: list[str], out_tmpl: str, hook, max_bytes: int) -> dict:
    """Build yt-dlp options targeting specific YouTube player clients."""
    opts = {
        "format": "18/best[ext=mp4]/b/22/best",
        "outtmpl": out_tmpl,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "geo_bypass": True,
        "max_filesize": max_bytes,
        "progress_hooks": [hook] if hook else [],
        "extractor_args": {"youtube": {"player_client": clients}},
    }
    cookie_file = _get_cookie_file()
    if cookie_file:
        opts["cookiefile"] = str(cookie_file)
    proxy = os.getenv("YTDLP_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")
    if proxy:
        opts["proxy"] = proxy
    return opts


def _download_ytdlp(url: str, d: Path, progress_cb=None) -> tuple[Path, str]:
    """Downloads a streaming URL using android/mobile clients to reliably bypass bot detection."""
    import yt_dlp
    out_tmpl = str(d / "source.%(ext)s")

    def _hook(h):
        if progress_cb and h.get("status") == "downloading":
            total = h.get("total_bytes") or h.get("total_bytes_estimate") or 0
            downloaded = h.get("downloaded_bytes") or 0
            if total > 0:
                progress_cb(min(0.95, downloaded / total))

    # Priority order of clients resilient against datacenter bot checks
    client_configs = [
        ["android"],
        ["android_vr"],
        ["ios"],
        ["mweb"],
        ["tv_embedded"],
        ["web"],
    ]

    last_exc: Exception | None = None
    for clients in client_configs:
        opts = _yt_opts_for_client(clients, out_tmpl, _hook, MAX_UPLOAD_BYTES)
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get("title") or "remote-video"
            candidates = [f for f in d.iterdir() if f.is_file() and not f.name.endswith(".part") and f.stat().st_size > 1000]
            if candidates:
                return candidates[0], title
            else:
                last_exc = RuntimeError(f"Client {clients} finished without downloading output file.")
        except Exception as e:
            last_exc = e
            # Clean up partial download before retrying with next client
            for f in d.glob("*"):
                if f.is_file() and not f.name.startswith("meta"):
                    try: f.unlink()
                    except OSError: pass
            continue

    raise RuntimeError(
        f"Could not download video from YouTube on this server IP. "
        f"If deployed on a cloud host (like Render/AWS), YouTube may require cookies. "
        f"Set YTDLP_COOKIES environment variable in Render, or upload the video directly. "
        f"Details: {last_exc}"
    )


def _run_import_job(j: dict):
    """Background worker: downloads a URL (YouTube, direct video, etc.) and registers the video."""
    if j["cancel"]:
        j["status"] = "cancelled"
        return
    j["status"] = "running"
    url: str = j["url"]
    p = urlparse(url)
    hostname = (p.hostname or "").lower()
    is_streaming = any(h in hostname for h in ("youtube.com", "youtu.be", "vimeo.com", "tiktok.com", "twitter.com", "x.com", "instagram.com"))
    ext = Path(p.path).suffix.lower()
    vid: str = j["video_id"]
    d: Path = j["dir"]
    try:
        if is_streaming or ext not in ALLOWED_EXT:
            src, title = _download_ytdlp(url, d, progress_cb=lambda p: j.__setitem__("progress", p))
        else:
            src = d / f"source{ext}"
            n = 0
            with urllib.request.build_opener(_NoRedirect).open(url, timeout=60) as r, open(src, "wb") as out:
                total = int(r.headers.get("Content-Length") or 0)
                while chunk := r.read(1 << 20):
                    n += len(chunk)
                    if n > MAX_UPLOAD_BYTES:
                        raise RuntimeError("Remote file exceeds the size limit.")
                    out.write(chunk)
                    if total:
                        j["progress"] = min(0.95, n / total)
            title = Path(p.path).name or "remote-video"
        result = _register(vid, d, src, title)
        # Fast YouTube caption extraction if applicable
        if "youtube.com" in hostname or "youtu.be" in hostname:
            result["youtube_url"] = url
            from . import transcription_service
            try:
                fast_transcript = transcription_service.extract_youtube_transcript_fast(url)
                if fast_transcript:
                    result["initial_transcript"] = fast_transcript
            except Exception:
                pass
        j.update(status="done", progress=1.0, result=result)
    except Exception as e:
        j.update(status="failed", error=str(e))
        shutil.rmtree(d, ignore_errors=True)


@app.post("/api/import-url")
def import_url(req: UrlReq):
    """Starts an async import job for a YouTube link or direct video URL and returns a job id."""
    p = urlparse(req.url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise HTTPException(400, "Enter a valid http(s) URL (e.g. YouTube or video link).")
    try:
        if not all(ipaddress.ip_address(i[4][0]).is_global for i in socket.getaddrinfo(p.hostname, None)):
            raise HTTPException(400, "Links to private networks are not allowed.")
    except socket.gaierror:
        raise HTTPException(400, "Could not resolve that host.")

    vid = uuid.uuid4().hex
    d = config.DATA_DIR / vid
    d.mkdir()

    jid = uuid.uuid4().hex
    j = dict(id=jid, video_id=vid, dir=d, url=req.url, type="import",
             status="queued", progress=0.0, error=None, cancel=False, proc=None, result=None)
    JOBS[jid] = j
    pool.submit(_run_import_job, j)
    return _public(j)


@app.get("/api/jobs/{job_id}/result")
def job_result(job_id: str):
    """Returns the imported video metadata once an import job is done."""
    j = _job(job_id)
    if j.get("type") != "import":
        raise HTTPException(400, "Not an import job")
    if j["status"] != "done":
        raise HTTPException(409, "Import not finished yet")
    return j["result"]


@app.post("/api/import-local-path")
def import_local_path(req: LocalFileReq):
    """Imports an already downloaded/extracted local video file (e.g. from Google Drive / ZIP)."""
    p = Path(req.file_path)
    if not p.is_file():
        raise HTTPException(404, "File not found on server")
    ext = p.suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, f"Unsupported format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXT))}")
    vid = uuid.uuid4().hex
    d = config.DATA_DIR / vid
    d.mkdir()
    src = d / f"source{ext}"
    try:
        shutil.copy2(p, src)
        return _register(vid, d, src, req.name or p.name)
    except Exception as e:
        shutil.rmtree(d, ignore_errors=True)
        raise HTTPException(400, f"Could not import file: {e}")


# ---------- video ----------
@app.get("/api/video/{video_id}/metadata")
def metadata(video_id: str):
    d, meta = _load(video_id)
    # Touch directory mtime so the janitor knows this video is still in use
    try:
        import os as _os; _os.utime(d, None)
    except OSError:
        pass
    return meta


@app.get("/api/video/{video_id}/source")
def source(video_id: str):
    d, meta = _load(video_id)
    src_path = d / meta["source"]
    import mimetypes
    media_type = mimetypes.guess_type(src_path.name)[0] or "video/mp4"
    return FileResponse(src_path, media_type=media_type)      # supports HTTP Range for seeking


@app.get("/api/video/{video_id}/thumbs/{i}")
def thumb(video_id: str, i: int):
    f = _dir(video_id) / "thumbs" / f"{i:03d}.jpg"
    if not f.is_file():
        raise HTTPException(404)
    return FileResponse(f, media_type="image/jpeg")


@app.post("/api/video/{video_id}/preview")
def preview(video_id: str, req: TrimReq):
    d, meta = _load(video_id)
    _validate(req, meta)
    try:
        fx.run_simple(fx.preview_cmd(d / meta["source"], d / "preview.mp4", req.start, min(req.end, req.start + 30)), 180)
    except Exception as e:
        raise HTTPException(500, f"Preview failed: {e}")
    return {"preview_url": f"/api/video/{video_id}/preview.mp4?t={int(time.time())}"}


@app.get("/api/video/{video_id}/preview.mp4")
def preview_file(video_id: str):
    f = _dir(video_id) / "preview.mp4"
    if not f.is_file():
        raise HTTPException(404)
    return FileResponse(f, media_type="video/mp4")


@app.delete("/api/video/{video_id}")
def delete_video(video_id: str):
    d = _dir(video_id)
    for j in JOBS.values():
        if j["video_id"] == video_id:
            j["cancel"] = True
            if j.get("proc"):
                j["proc"].kill()
    shutil.rmtree(d, ignore_errors=True)
    return {"deleted": True}


# ---------- jobs ----------
def _public(j):
    out = {k: j[k] for k in ("id", "video_id", "status", "progress", "error")}
    out["type"] = j.get("type", "trim")
    return out


def _run_job(j):
    if j["cancel"]:
        j["status"] = "cancelled"
        return
    j["status"] = "running"
    r, meta = j["req"], j["meta"]
    try:
        for hw in ([True, False] if config.USE_HW and r.mode == "precise" else [False]):
            cmd = fx.build_cmd(j["src"], j["out"], r.start, r.end, r.mode, r.codec, r.resolution, r.quality, meta, hw)
            try:
                fx.run(cmd, r.end - r.start, lambda p: j.__setitem__("progress", p), j)
                break
            except RuntimeError:
                if not hw:
                    raise          # hardware encode failed -> retry in software
        j.update(status="done", progress=1.0)
    except fx.Cancelled:
        j["status"] = "cancelled"
        _safe_unlink(j["out"])
    except Exception as e:
        j.update(status="failed", error=str(e))
        _safe_unlink(j["out"])


@app.post("/api/video/{video_id}/trim")
def trim(video_id: str, req: TrimReq):
    d, meta = _load(video_id)
    _validate(req, meta)
    jid = uuid.uuid4().hex
    j = dict(id=jid, video_id=video_id, status="queued", progress=0.0, error=None, cancel=False, proc=None,
             req=req, meta=meta, src=d / meta["source"], out=d / f"out_{jid}.mp4")
    JOBS[jid] = j
    pool.submit(_run_job, j)
    return _public(j)


def _job(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Job not found")
    return JOBS[job_id]


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    return _public(_job(job_id))


@app.post("/api/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    j = _job(job_id)
    if j["status"] in ("queued", "running"):
        j["cancel"] = True
        if j["proc"]:
            j["proc"].kill()
        if j["status"] == "queued":
            j["status"] = "cancelled"
    return _public(j)


@app.get("/api/jobs/{job_id}/download")
def job_download(job_id: str):
    j = _job(job_id)
    if j["status"] != "done" or not j["out"].is_file():
        raise HTTPException(409, "The clip is not ready.")
    r = j["req"]
    stem = Path(j["meta"]["name"]).stem
    return FileResponse(j["out"], media_type="video/mp4", filename=f"{stem}_clip_{r.start:.2f}-{r.end:.2f}.mp4")


# ---------- cleanup ----------
def _get_protected_video_ids() -> set:
    """Return the set of video_ids that are referenced by at least one project — never delete these."""
    try:
        import sqlite3
        db_path = config.DATA_DIR / "studio.db"
        if not db_path.is_file():
            return set()
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        rows = conn.execute("SELECT DISTINCT video_id FROM projects WHERE video_id IS NOT NULL AND video_id != ''").fetchall()
        conn.close()
        return {r[0] for r in rows}
    except Exception:
        return set()


def _janitor():
    while True:
        time.sleep(600)
        try:
            protected = _get_protected_video_ids()
            for d in config.DATA_DIR.iterdir():
                # Protect: explicitly referenced by a project OR recently touched (< TTL_HOURS)
                is_transient = (ID_RE.match(d.name) or d.name.startswith("assess_")
                                or d.name.startswith("tmp_") or d.name.startswith("gdrive_"))
                is_protected = d.name in protected
                is_old = (time.time() - d.stat().st_mtime) > config.TTL_HOURS * 3600
                if d.is_dir() and is_transient and not is_protected and is_old:
                    shutil.rmtree(d, ignore_errors=True)
            # Clean up completed jobs whose output dir is gone
            for k in [k for k, j in JOBS.items()
                      if j.get("out") and not Path(j["out"]).parent.exists()]:
                JOBS.pop(k, None)
        except Exception:
            pass


threading.Thread(target=_janitor, daemon=True).start()

if config.FRONTEND_DIST.is_dir():      # production: serve the built SPA from the same process
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="spa")

if __name__ == "__main__":
    import os, uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
