import ipaddress, json, re, shutil, socket, threading, time, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config
from . import ffmpeg_utils as fx

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


def _download_ytdlp(url: str, d: Path) -> tuple[Path, str]:
    import yt_dlp
    out_tmpl = str(d / "source.%(ext)s")
    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": out_tmpl,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": MAX_UPLOAD_BYTES,
        "js_runtimes": {"node": {}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title") or "remote-video"

    candidates = list(d.glob("source.*"))
    if not candidates:
        raise RuntimeError("Failed to locate downloaded video file.")
    return candidates[0], title


@app.post("/api/import-url")
def import_url(req: UrlReq):
    """Imports a YouTube link or direct video file URL."""
    p = urlparse(req.url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise HTTPException(400, "Enter a valid http(s) URL (e.g. YouTube or video link).")
    try:
        if not all(ipaddress.ip_address(i[4][0]).is_global for i in socket.getaddrinfo(p.hostname, None)):
            raise HTTPException(400, "Links to private networks are not allowed.")
    except socket.gaierror:
        raise HTTPException(400, "Could not resolve that host.")

    hostname = (p.hostname or "").lower()
    is_streaming = any(d in hostname for d in ("youtube.com", "youtu.be", "vimeo.com", "tiktok.com", "twitter.com", "x.com", "instagram.com"))
    ext = Path(p.path).suffix.lower()

    vid = uuid.uuid4().hex
    d = config.DATA_DIR / vid
    d.mkdir()

    if is_streaming or ext not in ALLOWED_EXT:
        try:
            src, title = _download_ytdlp(req.url, d)
            return _register(vid, d, src, title)
        except Exception as e:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(400, f"Could not download video from that URL: {e}")
    else:
        src = d / f"source{ext}"
        try:
            n = 0
            with urllib.request.build_opener(_NoRedirect).open(req.url, timeout=30) as r, open(src, "wb") as out:
                while chunk := r.read(1 << 20):
                    n += len(chunk)
                    if n > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, "Remote file exceeds the size limit.")
                    out.write(chunk)
            return _register(vid, d, src, Path(p.path).name or "remote-video")
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            try:
                src, title = _download_ytdlp(req.url, d)
                return _register(vid, d, src, title)
            except Exception as e:
                shutil.rmtree(d, ignore_errors=True)
                raise HTTPException(400, f"Could not download the link ({e}).")


# ---------- video ----------
@app.get("/api/video/{video_id}/metadata")
def metadata(video_id: str):
    return _load(video_id)[1]


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
            if j["proc"]:
                j["proc"].kill()
    shutil.rmtree(d, ignore_errors=True)
    return {"deleted": True}


# ---------- jobs ----------
def _public(j):
    return {k: j[k] for k in ("id", "video_id", "status", "progress", "error")}


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
def _janitor():
    while True:
        time.sleep(600)
        try:
            for d in config.DATA_DIR.iterdir():
                # Only purge transient directories, never studio databases, music, or exports
                is_transient = ID_RE.match(d.name) or d.name.startswith("assess_") or d.name.startswith("tmp_") or d.name.startswith("gdrive_")
                if d.is_dir() and is_transient and (time.time() - d.stat().st_mtime > config.TTL_HOURS * 3600):
                    shutil.rmtree(d, ignore_errors=True)
            for k in [k for k, j in JOBS.items() if not j["out"].parent.exists()]:
                JOBS.pop(k, None)
        except Exception:
            pass


threading.Thread(target=_janitor, daemon=True).start()

if config.FRONTEND_DIST.is_dir():      # production: serve the built SPA from the same process
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="spa")
