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

def group_words_into_chunks(
    word_segments: List[Dict[str, Any]],
    words_per_chunk: int = 3,
    max_words: Optional[int] = None,
    max_chunk_duration: float = 1.85,
    min_chunk_duration: float = 0.40
) -> List[Dict[str, Any]]:
    """
    Groups word-level timestamps (faster-whisper or speech cadence model) into
    punchy, natural spoken-rhythm chunks (2-4 words per cue, ~0.4s to 1.85s duration)
    matching viral YouTube Shorts & Reels cadence (e.g. Acharya Prashant subtitle style).
    """
    if max_words is not None:
        words_per_chunk = max_words
    if not word_segments:
        return []
    
    # Common speech boundary conjunctions & prepositions where natural breath pauses occur
    BREAK_BEFORE_WORDS = {
        "and", "but", "so", "because", "or", "if", "when", "while", "that", "which",
        "to", "for", "with", "from", "into", "about", "is", "are", "was", "were",
        "aur", "par", "lekin", "isliye", "kyunki", "ki", "toh", "jab", "tab", "ka", "ke", "ki"
    }

    chunks = []
    current_words = []
    
    for i, w in enumerate(word_segments):
        text = w.get("word", "").strip()
        if not text:
            continue
        start = float(w.get("start", 0.0))
        end = float(w.get("end", start + 0.35))
        if end <= start:
            end = start + 0.35

        # Check pause gap from preceding word (gap >= 0.28s indicates natural spoken pause)
        has_speech_gap = False
        if current_words:
            gap = start - current_words[-1]["end"]
            if gap >= 0.28:
                has_speech_gap = True

        # Check if next word initiates a fresh phrase
        clean_word_lower = text.strip(",.?!;:।|-—\"'“”").lower()
        starts_clause = (clean_word_lower in BREAK_BEFORE_WORDS) and (len(current_words) >= 2)

        cur_dur = (start - current_words[0]["start"]) if current_words else 0.0

        if current_words and (has_speech_gap or cur_dur >= max_chunk_duration or len(current_words) >= 4 or starts_clause):
            c_start = current_words[0]["start"]
            c_end = max(current_words[-1]["end"], c_start + min_chunk_duration)
            chunks.append({
                "start": c_start,
                "end": c_end,
                "text": " ".join(item["text"] for item in current_words)
            })
            current_words = []

        current_words.append({"text": text, "start": start, "end": end})

        # Punctuation check at the end of word (comma, period, question mark, dash)
        ends_punctuation = any(text.endswith(p) for p in (".", "?", "!", "|", "।", ",", ";", ":", "—", "-"))
        if ends_punctuation and len(current_words) >= 2:
            c_start = current_words[0]["start"]
            c_end = max(current_words[-1]["end"], c_start + min_chunk_duration)
            chunks.append({
                "start": c_start,
                "end": c_end,
                "text": " ".join(item["text"] for item in current_words)
            })
            current_words = []
            
    if current_words:
        c_start = current_words[0]["start"]
        c_end = max(current_words[-1]["end"], c_start + min_chunk_duration)
        chunks.append({
            "start": c_start,
            "end": c_end,
            "text": " ".join(item["text"] for item in current_words)
        })
        
    return chunks

def generate_ass_subtitles(
    chunks: List[Dict[str, Any]],
    template: Dict[str, Any],
    output_path: Path,
    casing: str = "default",  # "default", "uppercase", "lowercase"
    animation_effect: str = "glow_punch"  # "glow_punch", "scale_pop", "word_highlight", "clean"
) -> Path:
    """
    Generates a professional ASS subtitle script:
    - Text casing support (UPPERCASE like YouTube Shorts / Acharya Prashant samples)
    - Animated subtitle punch-in effects (\t(0, 100, \fscx112\fscy112) -> \t(100, 200, \fscx100\fscy100))
    - Dual layer: Layer 0 warm diffuse glow, Layer 1 ultra-sharp text with bold dark outline.
    - Word emphasis support: 'word_highlight' enlarges keyword (e.g. {\fscx120\fscy120}KEYWORD{\fscx100\fscy100}).
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
        elif animation_effect == "word_highlight":
            # Highlight key word large and accented
            w_list = raw_text.split()
            if len(w_list) > 1:
                # Make the longest or first punchy word 120% size and bold
                longest_idx = max(range(len(w_list)), key=lambda idx: len(w_list[idx]))
                w_list[longest_idx] = r"{\fscx120\fscy120\c&H0000FFFF&}" + w_list[longest_idx] + r"{\fscx100\fscy100\c" + primary_color + r"}"
                raw_text = " ".join(w_list)
            anim_tag = r"{\t(0,90,\fscx112\fscy112)\t(90,180,\fscx100\fscy100)}"
            glow_anim = r"{\blur6}"
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
    Supports:
    1. Classic layout: Single focused speaker crop (1080x1080) with authentic AP banner & soft glowing captions.
    2. Dual Split layout: Upper active speaker (1080x980) + metallic gold divider + lower side-by-side dual speaker cards (each ~525x520) showing both speakers without weird dividers cutting through faces!
    """
    cw = template.get("canvas", {}).get("width", 1080)
    ch = template.get("canvas", {}).get("height", 1920)
    bg_color = template.get("canvas", {}).get("background_color", "#000000")
    layout_type = template.get("layout_type", "classic")
    
    fonts_dir = (config.BASE_DIR / "data" / "fonts").resolve()
    fonts_dir_escaped = str(fonts_dir).replace("\\", "/").replace(":", "\\:")
    
    default_banner = (config.BASE_DIR / "data" / "templates" / "ap_header_logo.png").resolve()
    banner_to_use = header_banner_path or (default_banner if default_banner.is_file() else None)
    
    parts = []
    current_out = "v_base"

    if layout_type == "dual_split":
        # Professional 2-Speaker Dual Split Layout (from user reference):
        # Top panel: Active speaker close-up scaled to 1080x980
        # Bottom panels: Left speaker card (525x530) and Right speaker card (525x530) side by side!
        parts.append(f"color=c={bg_color}:s={cw}x{ch}:r=30[bg]")
        
        # Upper speaker crop
        if crop_w and crop_h and crop_x is not None and crop_y is not None:
            top_crop = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
        else:
            top_crop = "crop=ih:ih:(iw-ih)/2:0"
        parts.append(f"[0:v]{top_crop},scale=1080:980:flags=lanczos[top_vid]")
        
        # Lower dual speaker crops (left ~28% width, right ~73% width)
        parts.append("[0:v]crop=iw*0.45:ih:0:(ih-ih)/2,scale=525:520:flags=lanczos,drawbox=x=0:y=0:w=525:h=520:color=white@0.6:t=2[bot_left]")
        parts.append("[0:v]crop=iw*0.45:ih:iw*0.55:(ih-ih)/2,scale=525:520:flags=lanczos,drawbox=x=0:y=0:w=525:h=520:color=white@0.6:t=2[bot_right]")
        
        # Overlay top video at y=200
        parts.append("[bg][top_vid]overlay=0:200[v_top]")
        # Divider line between top and bottom
        parts.append("[v_top]drawbox=x=0:y=1190:w=1080:h=4:color=#E5B83B:t=fill[v_div]")
        # Overlay bottom left card at x=10, y=1210
        parts.append("[v_div][bot_left]overlay=10:1210[v_bl]")
        # Overlay bottom right card at x=545, y=1210
        parts.append("[v_bl][bot_right]overlay=545:1210[v_base]")
    else:
        # Standard Classic Layout: Auto-centered speaker crop
        vf = template.get("video_frame", {})
        tw = vf.get("target_width", 1080)
        th = vf.get("target_height", 1080)
        v_pos_y = vf.get("position_y", 420)
        
        if crop_w and crop_h and crop_x is not None and crop_y is not None:
            crop_filter = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
        else:
            crop_filter = "crop=ih:ih:(iw-ih)/2:0"
            
        parts.append(f"[0:v]{crop_filter},scale={tw}:{th}:flags=lanczos[scaled_vid]")
        parts.append(f"[scaled_vid]pad={cw}:{ch}:(ow-iw)/2:{v_pos_y}:color={bg_color}[v_base]")

    # Header Overlay
    if banner_to_use and banner_to_use.is_file():
        banner_escaped = str(banner_to_use).replace("\\", "/").replace(":", "\\:")
        parts.append(f"movie='{banner_escaped}',scale={cw}:-1[banner]")
        parts.append(f"[{current_out}][banner]overlay=(W-w)/2:90[v_hdr]")
        current_out = "v_hdr"
    else:
        hdr = template.get("header", {})
        hdr_text = hdr.get("text", "A C H A R Y A   P R A S H A N T")
        hdr_font = fonts_dir / hdr.get("font_file", "Khand-Bold.ttf")
        hdr_font_escaped = str(hdr_font).replace("\\", "/").replace(":", "\\:")
        gold_color = "#E5B83B"
        draw_top_line = f"drawbox=x=0:y=100:w={cw}:h=4:color={gold_color}:t=fill"
        draw_hdr = (
            f"drawtext=fontfile='{hdr_font_escaped}':text='{hdr_text}':"
            f"fontsize=46:fontcolor=white:x=(w-text_w)/2:y=125"
        )
        draw_bot_line = f"drawbox=x=0:y=188:w={cw}:h=4:color={gold_color}:t=fill"
        parts.append(f"[{current_out}]{draw_top_line},{draw_hdr},{draw_bot_line}[v_hdr]")
        current_out = "v_hdr"

    # Burn-in ASS Subtitles
    ass_path_obj = Path(ass_subtitles_path) if ass_subtitles_path else None
    if ass_path_obj and ass_path_obj.is_file():
        ass_escaped = str(ass_path_obj.resolve()).replace("\\", "/").replace(":", "\\:")
        parts.append(f"[{current_out}]subtitles='{ass_escaped}':fontsdir='{fonts_dir_escaped}'[v_out]")
        current_out = "v_out"

    filter_complex = ";".join(parts)
    return filter_complex, current_out
