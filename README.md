# ClipTrim HD Studio

Transform long-form YouTube videos, Google Drive recordings, lectures, and podcasts into engaging short-form videos with AI speech-to-text, script generation, multi-clip timeline editing, background music synthesis, styled subtitles, and automatic short-video assembly.

**Stack:** React 18 · TypeScript · Tailwind CSS · FastAPI · SQLite · Faster-Whisper · FFmpeg · yt-dlp · Python-Docx

---

## Features

1. **Smart Video Project Management**
   - Create, rename, search, duplicate, auto-save, and delete projects.
   - Persistent SQLite storage keeps projects, clips, transcripts, and settings intact across reloads.
   - Organized project folders (e.g. Introduction, Main Story, Conclusion).

2. **Advanced Multi-Clip Video Editor**
   - Independent clip extraction from long recordings with custom names.
   - Folder organization, drag-and-drop / sequential ordering, and auto serial numbering (`Intro_01`, `Intro_02`).
   - Frame-level navigation, timeline thumbnails, playhead, and interactive selection.
   - Combine clips in sequence into one video or export individual clips.

3. **YouTube Video Import**
   - Direct link extraction using `yt-dlp` and Node.js runtime.
   - High-quality video and audio merging with instant timeline loading.

4. **Google Drive Integration & ZIP Handling**
   - Download authorized Google Drive files and shared links.
   - Inspect ZIP archives without extracting everything.
   - Secure extraction (Zip Slip protected) with selective import of videos, audios, and subtitles.
   - Automatic video technical assessment (duration, resolution, fps, codecs, bitrate, thumbnails).

5. **AI Video Transcription (Faster-Whisper)**
   - High-performance speech-to-text with INT8 CPU/GPU acceleration.
   - Supports English, Hindi, and auto language detection.
   - Interactive transcript feed with clickable timestamps that seek the video player.
   - In-place text editing and live search with keyword highlights.
   - Export transcripts as TXT, SRT, VTT, and DOCX (Word).

6. **AI Long-Video Content Analyzer & Short-Video Script Generator**
   - Thematic topic segmentation with timestamps and engagement scoring.
   - Viral hooks and high-retention moment identification.
   - Script generator supporting multiple styles (Educational, Motivational, Storytelling, Viral Shorts) and durations (30s, 45s, 60s, 90s, 2m).
   - **Script-to-Video Automatic Clip Mapping**: Connects script scenes directly to source video timestamps and creates project clips with one click.

7. **AI Instrumental Music Generator**
   - Real procedural multi-voice harmonic music synthesizer (no simulated results).
   - Mood-based composition (Emotional piano, Motivational build-up, Educational ambient, Dramatic strings, Energetic).
   - Volume ducking and audio preview.

8. **Subtitle & Caption Studio**
   - Viral Shorts subtitle presets (inspired by Alex Hormozi: bold yellow/green text with heavy black borders).
   - Cinematic minimal and boxed modern styles.
   - Live visual subtitle preview and burn-in rendering via FFmpeg.

9. **Video Assembly & Professional Export Center**
   - Automatic short-video assembly combining clips, transitions, ducked background music, and burned subtitles.
   - Aspect ratio conversion: 9:16 vertical shorts (with blurred background), 16:9 landscape, 1:1 square.
   - Audio enhancements: Noise reduction (`afftdn`), voice clarity EQ, and EBU R128 loudness normalization.
   - Export to MP4, MOV, WebM in 720p, 1080p, 1440p, or 4K.
   - Download complete project asset packages as ZIP archives.

---

## Running the Application

### 1-Click Launch (Recommended)
Double-click or run from PowerShell / Command Prompt:
```cmd
.\run.bat
```
This automatically launches the FastAPI backend and serves the production studio on **`http://localhost:8000`**.

### Development Mode (Hot-Reload)
```cmd
.\run-dev.bat
```
Runs backend on `:8000` and Vite dev server on **`http://localhost:5173`**.

### Deploying the frontend separately
The production frontend uses `VITE_API_BASE_URL` to call the backend. It is empty by default for same-origin deployments. If deploying to a separate frontend host, set `VITE_API_BASE_URL` to the backend origin (without a trailing slash) in the frontend build environment, then rebuild/redeploy.

The deployed Render frontend origin `https://trim-vid-34.onrender.com` is allowed by default. If you use a different frontend domain, set `CORS_ORIGINS` on the backend to include that exact origin (no path or trailing slash); separate multiple origins with commas.

The Render Docker service in `render.yaml` serves the frontend and API together, so leave `VITE_API_BASE_URL` empty for that deployment. If an upload reports HTTP 200 but returns a web page instead of JSON, the frontend is likely sending `/api/upload` to its own host rather than the backend; configure `VITE_API_BASE_URL` with the backend origin and rebuild. The editor accepts one video file at a time; use the Drive / ZIP importer for ZIP archives.

---

## Running Tests
Run the test suite:
```bash
cd backend
.venv\Scripts\pytest -v
```
All 13 test suites verify standard API endpoints, YouTube import, and the new studio features.
