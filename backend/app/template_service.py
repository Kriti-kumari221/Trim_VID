import json
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from . import config

def load_template(template_id_or_path: str) -> Dict[str, Any]:
    """Loads a template JSON by id (from backend/data/templates) or absolute path."""
    p = Path(template_id_or_path)
    if not p.is_file():
        if not template_id_or_path.endswith(".json"):
            template_id_or_path = f"{template_id_or_path}.json"
        p = config.BASE_DIR / "data" / "templates" / template_id_or_path
    
    if not p.is_file():
        # Fallback to default Acharya Prashant Classic
        p = config.BASE_DIR / "data" / "templates" / "acharya_prashant_classic.json"
    
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def list_templates() -> List[Dict[str, Any]]:
    """Returns list of all available templates."""
    templates_dir = config.BASE_DIR / "data" / "templates"
    templates_dir.mkdir(parents=True, exist_ok=True)
    res = []
    for f in templates_dir.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
                res.append({
                    "id": f.stem,
                    "name": data.get("name", f.stem),
                    "version": data.get("version", "1.0"),
                    "canvas": data.get("canvas", {"width": 1080, "height": 1920}),
                    "file_path": str(f)
                })
        except Exception:
            continue
    return res

def format_ass_time(seconds: float) -> str:
    """Formats seconds to ASS timestamp: H:MM:SS.cc"""
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
    output_path: Path
) -> Path:
    """
    Generates an Advanced SubStation Alpha (.ass) file with:
    - Khand-Bold font with Noto Sans Devanagari fallback
    - Cream-yellow fill (&H00C8FAF5& in ASS BGR hex)
    - Dark bold outline
    - Secondary soft glow layer for glowing aesthetic
    """
    sub_cfg = template.get("subtitles", {})
    canvas = template.get("canvas", {"width": 1080, "height": 1920})
    cw = canvas.get("width", 1080)
    ch = canvas.get("height", 1920)
    
    font_name = Path(sub_cfg.get("font_file", "Khand-Bold.ttf")).stem
    font_size = sub_cfg.get("font_size", 64)
    primary_color = sub_cfg.get("primary_color", "&H00C8FAF5&")
    outline_color = sub_cfg.get("outline_color", "&H00101010&")
    outline_width = sub_cfg.get("outline_width", 4.5)
    shadow_color = sub_cfg.get("shadow_color", "&H80000000&")
    shadow_depth = sub_cfg.get("shadow_depth", 2)
    glow_color = sub_cfg.get("glow_color", "&H401490D4&")
    margin_v = sub_cfg.get("margin_v", 240)
    alignment = sub_cfg.get("alignment", 2)  # Bottom-center
    
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
Style: Glow,{font_name},{font_size},{glow_color},&H000000FF&,{glow_color},{glow_color},-1,0,0,0,100,100,1,0,1,{outline_width + 4.0},0,{alignment},60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for c in chunks:
        t_start = format_ass_time(c["start"])
        t_end = format_ass_time(c["end"])
        raw_text = c["text"].replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        # Layer 0: Glow outline under layer
        ass_content += f"Dialogue: 0,{t_start},{t_end},Glow,,0,0,0,,{{\\blur6}}{raw_text}\n"
        # Layer 1: Sharp text with crisp border on top
        ass_content += f"Dialogue: 1,{t_start},{t_end},Default,,0,0,0,,{raw_text}\n"
        
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
) -> str:
    """
    Constructs the exact FFmpeg filter_complex graph to build 1080x1920 vertical Shorts:
    1. Base 1080x1920 black canvas.
    2. Header text "ACHARYA PRASHANT" in bold uppercase + gold divider line below.
    3. Main video centered square/rectangle crop zoomed on speaker.
    4. Burned-in ASS subtitles with fontsdir path escaping.
    """
    cw = template.get("canvas", {}).get("width", 1080)
    ch = template.get("canvas", {}).get("height", 1920)
    bg_color = template.get("canvas", {}).get("background_color", "#000000")
    
    vf = template.get("video_frame", {})
    tw = vf.get("target_width", 1080)
    th = vf.get("target_height", 1080)
    v_pos_y = vf.get("position_y", 420)
    
    hdr = template.get("header", {})
    hdr_enabled = hdr.get("enabled", True)
    hdr_text = hdr.get("text", "ACHARYA PRASHANT")
    hdr_size = hdr.get("font_size", 48)
    hdr_y = hdr.get("position_y", 140)
    hdr_color = hdr.get("font_color", "#FFFFFF")
    
    div = hdr.get("divider_line", {})
    div_enabled = div.get("enabled", True)
    div_w = div.get("width", 780)
    div_h = div.get("thickness", 3)
    div_color = div.get("color", "#D4AF37")
    div_y = hdr_y + div.get("margin_top", 24)
    div_x = int((cw - div_w) / 2)
    
    fonts_dir = (config.BASE_DIR / "data" / "fonts").resolve()
    fonts_dir_escaped = str(fonts_dir).replace("\\", "/").replace(":", "\\:")
    
    # 1. Video Crop & Scale chain
    if crop_w and crop_h and crop_x is not None and crop_y is not None:
        crop_filter = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
    else:
        # Auto-center square crop based on minimum dimension
        crop_filter = "crop=ih:ih:(iw-ih)/2:0"
        
    scale_video = f"[0:v]{crop_filter},scale={tw}:{th}:flags=lanczos[scaled_vid]"
    
    # 2. Pad to 1080x1920 (centered with black borders top and bottom)
    # y=(1920-1080)/2 = 420 exactly!
    pad_canvas = f"[scaled_vid]pad={cw}:{ch}:(ow-iw)/2:{v_pos_y}:color={bg_color}[v1]"
    
    current_out = "v1"
    
    # 4. Header text and gold divider line
    if hdr_enabled:
        hdr_font = fonts_dir / hdr.get("font_file", "Khand-Bold.ttf")
        hdr_font_escaped = str(hdr_font).replace("\\", "/").replace(":", "\\:")
        
        # drawtext for header
        draw_hdr = (
            f"drawtext=fontfile='{hdr_font_escaped}':text='{hdr_text}':"
            f"fontsize={hdr_size}:fontcolor={hdr_color}:x=(w-text_w)/2:y={hdr_y}"
        )
        
        if div_enabled:
            # drawbox for gold line
            draw_line = f"drawbox=x={div_x}:y={div_y}:w={div_w}:h={div_h}:color={div_color}:t=fill"
            header_filter = f"[{current_out}]{draw_hdr},{draw_line}[v2]"
        else:
            header_filter = f"[{current_out}]{draw_hdr}[v2]"
            
        current_out = "v2"
    else:
        header_filter = ""
        
    # 5. Burn-in ASS Subtitles if provided
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
