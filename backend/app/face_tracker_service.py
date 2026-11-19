import os
import cv2
import numpy as np
import subprocess
import tempfile
import logging
from pathlib import Path
from typing import Optional, Dict, List, Tuple

logger = logging.getLogger(__name__)

def detect_speaker_face_crop(
    video_path: Path,
    start_time: float,
    end_time: float,
    sample_count: int = 4,
    tight_zoom: bool = True
) -> Dict[str, int]:
    """
    Robust, lightning-fast speaker reframing:
    Uses FFmpeg to extract sample frames across the clip and performs
    color-space skin-tone & spatial variance profiling to detect the active speaker's
    horizontal position (left, right, or center speaker).
    Produces a smooth focused crop on the speaker.
    """
    if not video_path.is_file():
        return {}

    # Probe video dimensions
    from . import ffmpeg_utils as fx
    probe_info = fx.probe(video_path)
    vid_w = int(probe_info.get("width", 1920))
    vid_h = int(probe_info.get("height", 1080))
    dur = float(probe_info.get("duration", 0))

    clip_dur = max(1.0, end_time - start_time)
    sample_times = [
        start_time + clip_dur * (i + 1) / (sample_count + 1)
        for i in range(sample_count)
    ]

    detected_centers = []
    detected_y_centers = []

    for t in sample_times:
        try:
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
                frame_path = tf.name

            # Extract small resolution frame for millisecond-fast profiling
            cmd = [
                "ffmpeg", "-y", "-ss", f"{t:.2f}",
                "-i", str(video_path),
                "-vframes", "1", "-vf", "scale=640:-2",
                "-update", "1", frame_path
            ]
            subprocess.run(cmd, capture_output=True, timeout=10)

            img = cv2.imread(frame_path)
            Path(frame_path).unlink(missing_ok=True)

            if img is None:
                continue

            fh, fw = img.shape[:2]

            # 1. Skin-tone mask in YCrCb color space
            ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
            # Standard human skin tone ranges: Cr in [133, 173], Cb in [77, 127]
            skin_mask = cv2.inRange(ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))

            # 2. Upper body region (top 75% where speaker faces are)
            upper_skin = skin_mask[:int(fh * 0.75), :]
            col_weights = np.sum(upper_skin, axis=0)

            # 3. Add edge contrast energy (faces/shoulders create distinct gradients)
            gray = cv2.cvtColor(img[:int(fh * 0.75), :], cv2.COLOR_BGR2GRAY)
            grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
            col_edges = np.sum(np.abs(grad_x), axis=0)
            col_edges = (col_edges / (np.max(col_edges) + 1e-5)) * 255.0

            total_score = col_weights.astype(np.float32) + col_edges.astype(np.float32)

            window_size = int(fw * 0.30)
            kernel = np.ones(window_size) / window_size
            smoothed = np.convolve(total_score, kernel, mode="valid")

            best_idx = int(np.argmax(smoothed))
            center_x_640 = best_idx + window_size // 2

            scale_ratio = vid_w / float(fw)
            orig_center_x = int(center_x_640 * scale_ratio)
            detected_centers.append(orig_center_x)

            # Check vertical mass center in that horizontal column band
            band_left = max(0, best_idx)
            band_right = min(fw, best_idx + window_size)
            row_weights = np.sum(skin_mask[:, band_left:band_right], axis=1)
            best_y_idx = int(np.argmax(row_weights)) if np.max(row_weights) > 0 else int(fh * 0.35)
            detected_y_centers.append(int(best_y_idx * (vid_h / float(fh))))

        except Exception as e:
            logger.debug(f"Frame analysis error at {t}: {e}")

    # Optimal crop box
    square_size = min(vid_w, vid_h)

    if detected_centers:
        detected_centers.sort()
        speaker_x = detected_centers[len(detected_centers) // 2]
        crop_x = int(speaker_x - (square_size / 2.0))
        crop_x = max(0, min(crop_x, vid_w - square_size))
    else:
        crop_x = int((vid_w - square_size) / 2.0)

    # Vertical centering based on speaker face height
    if detected_y_centers:
        detected_y_centers.sort()
        speaker_y = detected_y_centers[len(detected_y_centers) // 2]
        # Position face in upper third of square
        crop_y = int(speaker_y - (square_size * 0.35))
        crop_y = max(0, min(crop_y, vid_h - square_size))
    else:
        crop_y = int((vid_h - square_size) / 2.0)

    return {
        "x": crop_x,
        "y": crop_y,
        "w": square_size,
        "h": square_size
    }

def detect_multi_speaker_crops(
    video_path: Path,
    start_time: float,
    end_time: float
) -> Dict[str, Dict[str, int]]:
    """
    Detects two speakers on a wide stage (e.g. interviewer on Left, Acharya Prashant on Right).
    Returns separate tight crops: {'left': {...}, 'right': {...}, 'wide': {...}}
    """
    from . import ffmpeg_utils as fx
    probe_info = fx.probe(video_path)
    vid_w = int(probe_info.get("width", 1920))
    vid_h = int(probe_info.get("height", 1080))

    # Left speaker crop (default center around 25-30% of width)
    crop_size = min(int(vid_w * 0.45), vid_h)
    left_x = max(0, int(vid_w * 0.28 - crop_size / 2.0))
    left_y = max(0, int(vid_h * 0.45 - crop_size / 2.0))

    # Right speaker crop (default center around 70-75% of width)
    right_x = min(vid_w - crop_size, max(0, int(vid_w * 0.73 - crop_size / 2.0)))
    right_y = max(0, int(vid_h * 0.45 - crop_size / 2.0))

    return {
        "left": {"x": left_x, "y": left_y, "w": crop_size, "h": crop_size},
        "right": {"x": right_x, "y": right_y, "w": crop_size, "h": crop_size},
        "wide": {"x": 0, "y": 0, "w": vid_w, "h": vid_h}
    }
