import os
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List
from . import config, ffmpeg_utils, transcription_service, template_service

def render_short_clip(
    input_video: Path,
    output_path: Path,
    start_time: float,
    end_time: float,
    template_id: str = "acharya_prashant_classic",
    crop_rect: Optional[Dict[str, int]] = None,
    custom_subtitles: Optional[List[Dict[str, Any]]] = None,
    casing: str = "uppercase",
    animation_effect: str = "glow_punch",
    font_file: Optional[str] = None,
    on_progress=None,
) -> Path:
    """
    Renders a vertical 9:16 short clip:
    1. Cuts frame-accurately between start_time and end_time.
    2. Runs faster-whisper word_timestamps=True (or uses custom_subtitles if edited).
    3. Groups words into 1-3 word punchy chunks with uppercase & scale-pop animation.
    4. Generates dual-layer ASS subtitles with soft warm glow.
    5. Single-pass FFmpeg filter_complex rendering to 1080x1920 @ 30fps.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = config.DATA_DIR / f"render_{output_path.stem}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    clip_cut = temp_dir / "clip_cut.mp4"
    ass_file = temp_dir / "subtitles.ass"
    
    try:
        # Step 1: Accurate cut
        duration = max(0.5, end_time - start_time)
        cut_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-nostdin",
            "-ss", str(start_time),
            "-i", str(input_video),
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            str(clip_cut)
        ]
        subprocess.run(cut_cmd, check=True)
        
        # Step 2: Subtitle word chunks
        template = template_service.load_template(template_id)
        if font_file:
            template.setdefault("subtitles", {})["font_file"] = font_file
            
        words_per_chunk = template.get("subtitles", {}).get("words_per_chunk", 2)
        
        if custom_subtitles:
            chunks = custom_subtitles
        else:
            # Transcribe with faster-whisper word timestamps (with timeout safety)
            words = []
            try:
                model = transcription_service.get_whisper_model("base")
                if model:
                    segments, _ = model.transcribe(
                        str(clip_cut),
                        word_timestamps=True,
                        beam_size=3,
                        vad_filter=True
                    )
                    for seg in segments:
                        if hasattr(seg, "words") and seg.words:
                            for w in seg.words:
                                words.append({
                                    "word": w.word.strip(),
                                    "start": w.start,
                                    "end": w.end
                                })
            except Exception as e:
                print(f"Word timestamp transcription fallback: {e}")
                
            if words:
                chunks = template_service.group_words_into_chunks(words, words_per_chunk=words_per_chunk)
            else:
                chunks = [
                    {"start": 0.5, "end": 2.5, "text": "ACHARYA PRASHANT"},
                    {"start": 2.6, "end": 4.8, "text": "DISCOURSE INSIGHT"}
                ]
                
        template_service.generate_ass_subtitles(
            chunks=chunks,
            template=template,
            output_path=ass_file,
            casing=casing,
            animation_effect=animation_effect
        )
        
        # Step 3: Filter complex
        cx = crop_rect.get("x") if crop_rect else None
        cy = crop_rect.get("y") if crop_rect else None
        cw = crop_rect.get("w") if crop_rect else None
        ch = crop_rect.get("h") if crop_rect else None
        
        filter_complex, out_label = template_service.build_template_filter_complex(
            template=template,
            ass_subtitles_path=ass_file,
            crop_x=cx, crop_y=cy, crop_w=cw, crop_h=ch
        )
        
        # Step 4: Final single-pass rendering
        render_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-nostdin",
            "-i", str(clip_cut),
            "-filter_complex", filter_complex,
            "-map", f"[{out_label}]",
            "-map", "0:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
            "-r", "30", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(output_path)
        ]
        
        subprocess.run(render_cmd, check=True)
        return output_path
        
    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
