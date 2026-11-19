import json, subprocess, threading, time
from . import config

QUALITY = {"high": 18, "balanced": 23, "small": 28}   # CRF / CQ values
RES = {"720p": 720, "1080p": 1080, "1440p": 1440, "4k": 2160}


class Cancelled(Exception):
    pass


def probe(path) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format",
                        "-show_streams", str(path)], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=60)
    if r.returncode:
        raise ValueError("File is corrupted or not a supported video.")
    d = json.loads(r.stdout)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    if not v:
        raise ValueError("No video stream found in this file.")
    dur = float(d["format"].get("duration") or v.get("duration") or 0)
    if dur <= 0:
        raise ValueError("Could not determine the video duration.")
    n, den = (v.get("avg_frame_rate") or "0/1").split("/")
    fps = round(int(n) / int(den), 3) if int(den) else 0
    return {"duration": dur, "width": v["width"], "height": v["height"], "fps": fps,
            "video_codec": v["codec_name"], "audio_codec": a and a["codec_name"],
            "has_audio": a is not None, "audio_channels": a.get("channels") if a else None,
            "bitrate": int(d["format"].get("bit_rate") or 0)}


def _gen_rest_thumbs(src, out_dir, duration, n):
    for i in range(1, n):
        t = duration * (i + 0.5) / n
        try:
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", str(src), "-frames:v", "1",
                            "-vf", "scale=160:-2", "-q:v", "6", str(out_dir / f"{i:03d}.jpg")],
                           capture_output=True, timeout=20)
        except Exception:
            pass


def make_thumbs(src, out_dir, duration, n):
    """Fast thumbnail generation: extracts first poster thumbnail instantly (<0.3s) and generates rest in background."""
    out_dir.mkdir(exist_ok=True)
    if n <= 0:
        return
    t0 = duration * 0.5 / n
    try:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t0:.3f}", "-i", str(src), "-frames:v", "1",
                        "-vf", "scale=160:-2", "-q:v", "6", str(out_dir / "000.jpg")],
                       capture_output=True, timeout=15)
    except Exception:
        pass
    if n > 1:
        threading.Thread(target=_gen_rest_thumbs, args=(src, out_dir, duration, n), daemon=True).start()


def hw_encoders() -> list[str]:
    if not config.USE_HW:
        return []
    out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True,
                         text=True, encoding="utf-8", errors="replace").stdout
    return [e for e in ("h264_nvenc", "hevc_nvenc") if e in out]


def build_cmd(src, dst, start, end, mode, codec, resolution, quality, meta, hw=False, ass_file=None) -> list[str]:
    c = ["ffmpeg", "-y", "-hide_banner", "-nostdin", "-loglevel", "error", "-progress", "pipe:1",
         "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{end - start:.3f}"]
    if mode == "fast" and not ass_file:   # stream copy: starts at the keyframe at/before `start`
        c += ["-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-avoid_negative_ts", "make_zero"]
    else:                # re-encode: frame-accurate; -ss before -i is accurate when transcoding
        crf = str(QUALITY[quality])
        enc = {"h264": "h264_nvenc", "h265": "hevc_nvenc"}[codec]
        
        vf_filters = []
        target = RES.get(resolution)
        if target and target < min(meta["width"], meta["height"]):   # never upscale
            vf_filters.append(f"scale={target}:-2" if meta["width"] < meta["height"] else f"scale=-2:{target}")
        if ass_file and Path(ass_file).is_file():
            escaped_ass = str(Path(ass_file).resolve()).replace("\\", "/").replace(":", "\\:")
            vf_filters.append(f"subtitles='{escaped_ass}'")
            
        if vf_filters:
            c += ["-vf", ",".join(vf_filters)]
            
        c += ["-map", "0:v:0", "-map", "0:a:0?"]
        if hw and enc in hw_encoders() and not ass_file:
            c += ["-c:v", enc, "-rc", "vbr", "-cq", crf, "-b:v", "0"]
        else:
            c += ["-c:v", "libx265" if codec == "h265" else "libx264", "-crf", crf, "-preset", "medium"]
        if codec == "h265":
            c += ["-tag:v", "hvc1"]
        c += ["-pix_fmt", "yuv420p"]
        c += ["-c:a", "aac", "-b:a", "192k"]
    return c + ["-movflags", "+faststart", str(dst)]


def preview_cmd(src, dst, start, end) -> list[str]:
    return ["ffmpeg", "-y", "-hide_banner", "-nostdin", "-loglevel", "error", "-ss", f"{start:.3f}",
            "-i", str(src), "-t", f"{end - start:.3f}", "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "scale=-2:480", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dst)]


def run_simple(cmd, timeout):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-500:] or "ffmpeg failed")


def run(cmd, total, on_progress, job):
    """Run ffmpeg, report progress 0..1, honour cancel + timeout."""
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True, encoding="utf-8", errors="replace")
    job["proc"] = p
    err: list[str] = []
    t = threading.Thread(target=lambda: err.append(p.stderr.read()), daemon=True)
    t.start()
    deadline = time.time() + config.JOB_TIMEOUT_S
    for line in p.stdout:
        if job.get("cancel"):
            p.kill()
            break
        if time.time() > deadline:
            p.kill()
            raise TimeoutError("Processing timed out.")
        if line.startswith("out_time_us="):
            try:
                on_progress(min(int(line.split("=")[1]) / 1e6 / total, 0.99))
            except ValueError:
                pass
    p.wait()
    t.join(2)
    if job.get("cancel"):
        raise Cancelled()
    if p.returncode:
        raise RuntimeError((err[0] if err else "").strip()[-500:] or "ffmpeg failed")
