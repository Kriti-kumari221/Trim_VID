<<<<<<< HEAD
# ClipTrim HD
Trim videos in the browser UI; FFmpeg does the real work on a FastAPI backend.

**Stack:** React + TypeScript + Tailwind + Lucide (Vite) · FastAPI · FFmpeg/FFprobe

## Requirements
Python 3.10+, Node 18+, and `ffmpeg` + `ffprobe` on your PATH (`brew install ffmpeg` / `apt install ffmpeg`).

## Local development
```bash
# terminal 1: API on :8000
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # optional; export vars or use your process manager
uvicorn app.main:app --reload --port 8000

# terminal 2: UI on :5173 (proxies /api to :8000)
cd frontend && npm install && npm run dev
```
Tests: `cd backend && pytest -v` (needs ffmpeg).

## Production
```bash
cd frontend && npm install && npm run build         # creates frontend/dist
cd ../backend && uvicorn app.main:app --host 0.0.0.0 --port 8000   # serves API + built UI
```
Run **one** process (jobs live in memory). Put nginx/Caddy in front for TLS and set
`client_max_body_size` to match `MAX_UPLOAD_MB`. Set `USE_HW_ACCEL=true` for NVENC
(falls back to software if the hardware encode fails). To scale out, move JOBS to Redis + a worker queue.

## Design notes
- **Fast** = `-c copy` (cuts snap to keyframes). **Precise** = re-encode (frame-accurate, A/V in sync).
- Output is never upscaled; portrait video is scaled on its short side; audio-less files are handled (`-map 0:a:0?`).
- Each upload gets its own random-ID directory; IDs are validated (no path traversal); old data is purged after `TTL_HOURS`.
- URL import supports YouTube links (and other video URLs) via `yt-dlp` as well as direct video-file links (private IPs blocked).
- Extension points: add clips/merge/audio-extract as new routes + builders in `ffmpeg_utils.py`.

## API
`POST /api/upload` · `POST /api/import-url` · `GET /api/video/{id}/metadata` · `POST /api/video/{id}/preview` ·
`POST /api/video/{id}/trim` · `GET /api/jobs/{id}` · `POST /api/jobs/{id}/cancel` · `GET /api/jobs/{id}/download` · `DELETE /api/video/{id}`
=======
# Trim_VID
>>>>>>> 3587804088336e2d8cfb4d602292c64e6286fd5f
