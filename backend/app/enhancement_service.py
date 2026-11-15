import json
import re
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from . import config, ffmpeg_utils as fx

def detect_silence(video_path: Path, noise_threshold: str = "-30dB", min_duration: float = 0.6) -> List[Dict[str, float]]:
    """Detects silences in the video audio using FFmpeg silencedetect filter."""
    cmd = [
        "ffmpeg", "-hide_banner", "-i", str(video_path),
        "-af", f"silencedetect=noise={noise_threshold}:d={min_duration}",
        "-f", "null", "-"
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    
    silences = []
    start = None
    for line in r.stderr.splitlines():
        if "silence_start:" in line:
            m = re.search(r"silence_start:\s*([\d.]+)", line)
            if m:
                start = float(m.group(1))
        elif "silence_end:" in line and start is not None:
            m = re.search(r"silence_end:\s*([\d.]+)", line)
            if m:
                end = float(m.group(1))
                silences.append({"start": start, "end": end, "duration": round(end - start, 2)})
                start = None
    return silences

def build_enhancement_filter(options: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """Constructs video and audio FFmpeg filter strings for enhancements."""
    vf_filters = []
    af_filters = []
    
    # 1. Video aspect ratio
    aspect = options.get("aspect_ratio", "original")
    if aspect == "9:16":
        # Professional vertical shorts with blurred background
        vf_filters.append("split[v1][v2];[v1]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg];[v2]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2")
    elif aspect == "1:1":
        vf_filters.append("split[v1][v2];[v1]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,boxblur=20:20[bg];[v2]scale=1080:1080:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2")
    elif aspect == "16:9":
        vf_filters.append("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2")

    # 2. Color & Brightness/Contrast
    contrast = float(options.get("contrast", 1.0))
    brightness = float(options.get("brightness", 0.0))
    saturation = float(options.get("saturation", 1.0))
    if contrast != 1.0 or brightness != 0.0 or saturation != 1.0:
        vf_filters.append(f"eq=contrast={contrast:.2f}:brightness={brightness:.2f}:saturation={saturation:.2f}")

    # 3. Audio Noise Reduction
    if options.get("noise_reduction"):
        af_filters.append("afftdn=nf=-25")

    # 4. Voice Enhancement
    if options.get("voice_enhancement"):
        af_filters.append("highpass=f=80,lowpass=f=8000,treble=g=3,bass=g=2")

    # 5. Audio Normalization (EBU R128 standard)
    if options.get("audio_normalization"):
        af_filters.append("loudnorm=I=-16:TP=-1.5:LRA=11")

    return vf_filters, af_filters
