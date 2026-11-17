import sys
import subprocess
from pathlib import Path

# Paths
root_dir = Path(__file__).resolve().parent.parent.parent
samples_dir = root_dir / "samples"
output_dir = samples_dir

rendered_video = samples_dir / "rendered_short_test.mp4"
sample_reference = samples_dir / "1_9.mp4"  # If exists

frame_time = "00:00:03.500"
rendered_frame = output_dir / "rendered_frame.png"
ref_frame = output_dir / "ref_frame.png"
comparison_image = output_dir / "comparison_side_by_side.png"

def extract_frame(video_path: Path, out_png: Path, timestamp: str):
    if not video_path.is_file():
        print(f"Warning: Video not found at {video_path}")
        return False
    cmd = [
        "ffmpeg", "-y",
        "-ss", timestamp,
        "-i", str(video_path),
        "-vframes", "1",
        "-update", "1",
        str(out_png)
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return res.returncode == 0 and out_png.is_file()

def create_side_by_side():
    print(f"Extracting frame from rendered short: {rendered_video}...")
    if not extract_frame(rendered_video, rendered_frame, frame_time):
        print("Failed to extract rendered frame.")
        return

    has_ref = extract_frame(sample_reference, ref_frame, frame_time)
    
    if has_ref:
        print("Creating side-by-side comparison with sample reference...")
        cmd = [
            "ffmpeg", "-y",
            "-i", str(ref_frame),
            "-i", str(rendered_frame),
            "-filter_complex", "[0:v][1:v]scale=540:960[l];[1:v]scale=540:960[r];[l][r]hstack=inputs=2[out]",
            "-map", "[out]",
            str(comparison_image)
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"Side-by-side comparison saved to: {comparison_image}")
    else:
        print(f"Rendered frame extracted to: {rendered_frame} (1080x1920)")

if __name__ == "__main__":
    create_side_by_side()
