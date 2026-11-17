import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from . import config

def load_template(template_id: str = "acharya_prashant_classic") -> Dict[str, Any]:
    templates_dir = (config.BASE_DIR / "data" / "templates").resolve()
    t_file = templates_dir / f"{template_id}.json"
    if not t_file.is_file():
        t_file = templates_dir / "acharya_prashant_classic.json"
    if t_file.is_file():
        return json.loads(t_file.read_text(encoding="utf-8"))
    return {}

def list_templates() -> List[Dict[str, Any]]:
    templates_dir = (config.BASE_DIR / "data" / "templates").resolve()
    if not templates_dir.is_dir():
        return []
    res = []
    for f in templates_dir.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            res.append({
                "id": data.get("id", f.stem),
                "name": data.get("name", f.stem),
                "canvas": data.get("canvas", {}),
                "header": data.get("header", {})
            })
        except Exception:
            pass
    return res

def format_ass_time(seconds: float) -> str:
    """Formats float seconds into ASS timestamp H:MM:SS.cs"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def group_words_into_chunks(word_segments: List[Dict[str, Any]], words_per_chunk: int = 2, max_words: Optional[int] = None) -> List[Dict[str, Any]]:
    """Groups word-level timestamps (from faster-whisper) into 1-3 word animated subtitle chunks."""
    if max_words is not None:
        words_per_chunk = max_words
    if not word_segments:
        return []
    
    chunks = []
    current_words = []
    
    for w in word_segments:
        text = w.get("word", "").strip()
        if not text:
            continue
        start = float(w.get("start", 0.0))
        end = float(w.get("end", start + 0.5))
        current_words.append({"text": text, "start": start, "end": end})
        
        # Check boundary or chunk size
        if len(current_words) >= words_per_chunk or text.endswith((".", "?", "!", "|", "।")):
            chunk_start = current_words[0]["start"]
            chunk_end = max(current_words[-1]["end"], chunk_start + 0.35)
            chunk_text = " ".join(item["text"] for item in current_words)
            chunks.append({
                "start": chunk_start,
                "end": chunk_end,
                "text": chunk_text
            })
            current_words = []
            
    if current_words:
        chunk_start = current_words[0]["start"]
        chunk_end = max(current_words[-1]["end"], chunk_start + 0.35)
        chunk_text = " ".join(item["text"] for item in current_words)
        chunks.append({
            "start": chunk_start,
            "end": chunk_end,
            "text": chunk_text
        })
        
    return chunks

def generate_ass_subtitles(
    chunks: List[Dict[str, Any]],
    template: Dict[str, Any],
    output_path: Path,
    casing: str = "default",  # "default", "uppercase", "lowercase"
    animation_effect: str = "glow_punch"  # "glow_punch", "scale_pop", "clean"
) -> Path:
    """
    Generates a professional ASS subtitle script:
    - Text casing support (UPPERCASE like YouTube Shorts / Acharya Prashant samples)
    - Animated subtitle punch-in effects (\t(0, 100, \fscx112\fscy112) -> \t(100, 200, \fscx100\fscy100))
    - Dual layer: Layer 0 warm diffuse glow, Layer 1 ultra-sharp text with bold dark outline.
    """
    sub_cfg = template.get("subtitles", {})
    canvas = template.get("canvas", {"width": 1080, "height": 1920})
    cw = canvas.get("width", 1080)
    ch = canvas.get("height", 1920)
    
    font_name = Path(sub_cfg.get("font_file", "Khand-Bold.ttf")).stem
    font_size = sub_cfg.get("font_size", 66)
    primary_color = sub_cfg.get("primary_color", "&H00C8FAF5&")  # Cream yellow in BGR
    outline_color = sub_cfg.get("outline_color", "&H00101010&")
    outline_width = sub_cfg.get("outline_width", 5.0)
    shadow_color = sub_cfg.get("shadow_color", "&H80000000&")
    shadow_depth = sub_cfg.get("shadow_depth", 2)
    glow_color = sub_cfg.get("glow_color", "&H401490D4&")
    margin_v = sub_cfg.get("margin_v", 240)
    alignment = sub_cfg.get("alignment", 2)  # Bottom-center
    
    # Check template override for uppercase
    if sub_cfg.get("uppercase", False):
        casing = "uppercase"

    ass_content = f"""[Script Info]
Title: Acharya Prashant Vertical Shorts
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: {cw}
PlayResY: {ch}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_color},&H000000FF&,{outline_color},{shadow_color},-1,0,0,0,100,100,1,0,1,{outline_width},{shadow_depth},{alignment},60,60,{margin_v},1
Style: Glow,{font_name},{font_size},{glow_color},&H000000FF&,{glow_color},{glow_color},-1,0,0,0,100,100,1,0,1,{outline_width + 4.5},0,{alignment},60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for c in chunks:
        t_start = format_ass_time(c["start"])
        t_end = format_ass_time(c["end"])
        raw_text = c["text"].replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        
        if casing == "uppercase":
            raw_text = raw_text.upper()
        elif casing == "lowercase":
            raw_text = raw_text.lower()
            
        # Dynamic animated punch-in effect (pop in on entrance, then settle)
        if animation_effect == "scale_pop":
            anim_tag = r"{\t(0,90,\fscx118\fscy118)\t(90,180,\fscx100\fscy100)}"
            glow_anim = r"{\blur6\t(0,90,\fscx118\fscy118)\t(90,180,\fscx100\fscy100)}"
        elif animation_effect == "glow_punch":
            anim_tag = r"{\t(0,80,\fscx108\fscy108)\t(80,160,\fscx100\fscy100)}"
            glow_anim = r"{\blur7\t(0,80,\fscx108\fscy108)\t(80,160,\fscx100\fscy100)}"
        else:
            anim_tag = ""
            glow_anim = r"{\blur6}"

        # Layer 0: Diffuse warm glow
        ass_content += f"Dialogue: 0,{t_start},{t_end},Glow,,0,0,0,,{glow_anim}{raw_text}\n"
        # Layer 1: Sharp crisp primary text
        ass_content += f"Dialogue: 1,{t_start},{t_end},Default,,0,0,0,,{anim_tag}{raw_text}\n"
        
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(ass_content)
        
    return output_path

def build_template_filter_complex(
    template: Dict[str, Any],
    ass_subtitles_path: Optional[Path] = None,
    crop_x: Optional[int] = None,
    crop_y: Optional[int] = None,
    crop_w: Optional[int] = None,
    crop_h: Optional[int] = None,
    header_banner_path: Optional[Path] = None
) -> Tuple[str, str]:
    """
    Constructs the exact FFmpeg filter_complex graph to build 1080x1920 vertical Shorts:
    1. Base 1080x1920 black canvas.
    2. Header: uses authentic AP logo banner PNG if available, or crisp text with top/bottom gold borders.
    3. Speaker crop: auto-centered on detected speaker face with smooth square framing.
    4. Subtitles: burned-in ASS subtitles with fontsdir path escaping.
    """
    cw = template.get("canvas", {}).get("width", 1080)
    ch = template.get("canvas", {}).get("height", 1920)
    bg_color = template.get("canvas", {}).get("background_color", "#000000")
    
    vf = template.get("video_frame", {})
    tw = vf.get("target_width", 1080)
    th = vf.get("target_height", 1080)
    v_pos_y = vf.get("position_y", 420)
    
    fonts_dir = (config.BASE_DIR / "data" / "fonts").resolve()
    fonts_dir_escaped = str(fonts_dir).replace("\\", "/").replace(":", "\\:")
    
    # Check for authentic user header banner logo PNG
    default_banner = (config.BASE_DIR / "data" / "templates" / "ap_header_logo.png").resolve()
    banner_to_use = header_banner_path or (default_banner if default_banner.is_file() else None)
    
    # 1. Video Crop & Scale chain
    if crop_w and crop_h and crop_x is not None and crop_y is not None:
        crop_filter = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
    else:
        # Auto-center square crop based on minimum dimension
        crop_filter = "crop=ih:ih:(iw-ih)/2:0"
        
    scale_video = f"[0:v]{crop_filter},scale={tw}:{th}:flags=lanczos[scaled_vid]"
    
    # 2. Pad to 1080x1920 centered canvas
    pad_canvas = f"[scaled_vid]pad={cw}:{ch}:(ow-iw)/2:{v_pos_y}:color={bg_color}[v1]"
    current_out = "v1"
    
    # 3. Header
    header_filter = ""
    if banner_to_use and banner_to_use.is_file():
        # Overlay the exact authentic Acharya Prashant header banner PNG scaled across width
        banner_escaped = str(banner_to_use).replace("\\", "/").replace(":", "\\:")
        # Scale banner to width 1080, maintaining aspect ratio (~1080x92)
        # Position at Y=100
        hdr_overlay = (
            f"movie='{banner_escaped}',scale={cw}:-1[banner];"
            f"[{current_out}][banner]overlay=(W-w)/2:90[v2]"
        )
        header_filter = hdr_overlay
        current_out = "v2"
    else:
        hdr = template.get("header", {})
        hdr_text = hdr.get("text", "A C H A R Y A   P R A S H A N T")
        hdr_font = fonts_dir / hdr.get("font_file", "Khand-Bold.ttf")
        hdr_font_escaped = str(hdr_font).replace("\\", "/").replace(":", "\\:")
        
        # Dual gold lines (top & bottom like official YouTube shorts sample)
        gold_color = "#E5B83B"
        draw_top_line = f"drawbox=x=0:y=100:w={cw}:h=4:color={gold_color}:t=fill"
        draw_hdr = (
            f"drawtext=fontfile='{hdr_font_escaped}':text='{hdr_text}':"
            f"fontsize=46:fontcolor=white:x=(w-text_w)/2:y=125"
        )
        draw_bot_line = f"drawbox=x=0:y=188:w={cw}:h=4:color={gold_color}:t=fill"
        header_filter = f"[{current_out}]{draw_top_line},{draw_hdr},{draw_bot_line}[v2]"
        current_out = "v2"
        
    # 4. Burn-in ASS Subtitles
    ass_path_obj = Path(ass_subtitles_path) if ass_subtitles_path else None
    if ass_path_obj and ass_path_obj.is_file():
        ass_escaped = str(ass_path_obj.resolve()).replace("\\", "/").replace(":", "\\:")
        sub_filter = f"[{current_out}]subtitles='{ass_escaped}':fontsdir='{fonts_dir_escaped}'[v_out]"
        current_out = "v_out"
    else:
        sub_filter = ""
        
    parts = [scale_video, pad_canvas]
    if header_filter:
        parts.append(header_filter)
    if sub_filter:
        parts.append(sub_filter)
        
    filter_complex = ";".join(parts)
    return filter_complex, current_out
