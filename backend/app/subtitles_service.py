import json
import uuid
from pathlib import Path
from typing import Optional, List, Dict, Any
from . import db, config

SUBTITLE_PRESETS = [
    {
        "id": "viral_yellow",
        "name": "Viral Shorts (Yellow)",
        "font_name": "Arial",
        "font_size": 24,
        "primary_color": "&H0000FFFF",  # Yellow in ASS (AABBGGRR)
        "outline_color": "&H00000000",  # Black
        "outline_width": 3,
        "alignment": 2,                 # Bottom center
        "margin_v": 60,
        "bold": True,
        "uppercase": True
    },
    {
        "id": "viral_green",
        "name": "Viral Shorts (Neon Green)",
        "font_name": "Arial",
        "font_size": 24,
        "primary_color": "&H0000FF00",  # Neon Green
        "outline_color": "&H00000000",
        "outline_width": 3,
        "alignment": 2,
        "margin_v": 60,
        "bold": True,
        "uppercase": True
    },
    {
        "id": "cinematic_white",
        "name": "Cinematic Minimal",
        "font_name": "Georgia",
        "font_size": 18,
        "primary_color": "&H00FFFFFF",  # Pure White
        "outline_color": "&H80000000",  # Subtle shadow
        "outline_width": 1,
        "alignment": 2,
        "margin_v": 40,
        "bold": False,
        "uppercase": False
    },
    {
        "id": "boxed_modern",
        "name": "Boxed Pill (Black BG)",
        "font_name": "Arial",
        "font_size": 20,
        "primary_color": "&H00FFFFFF",
        "back_color": "&H80000000",     # Semi-transparent box
        "border_style": 3,              # Opaque box
        "alignment": 2,
        "margin_v": 50,
        "bold": True,
        "uppercase": False
    }
]

def format_ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def generate_ass_subtitles(segments: List[Dict[str, Any]], preset_id: str = "viral_yellow", output_path: Optional[Path] = None) -> Path:
    """Generates Advanced SubStation Alpha (.ass) file with professional formatting & styling."""
    preset = next((p for p in SUBTITLE_PRESETS if p["id"] == preset_id), SUBTITLE_PRESETS[0])
    
    font_name = preset.get("font_name", "Arial")
    font_size = preset.get("font_size", 22)
    primary_color = preset.get("primary_color", "&H0000FFFF")
    outline_color = preset.get("outline_color", "&H00000000")
    back_color = preset.get("back_color", "&H00000000")
    border_style = preset.get("border_style", 1)
    outline = preset.get("outline_width", 2)
    shadow = preset.get("shadow", 1)
    alignment = preset.get("alignment", 2)
    margin_v = preset.get("margin_v", 50)
    bold = -1 if preset.get("bold") else 0
    uppercase = preset.get("uppercase", False)

    ass_content = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size * 2},{primary_color},&H000000FF,{outline_color},{back_color},{bold},0,0,0,100,100,0,0,{border_style},{outline * 2},{shadow},{alignment},40,40,{margin_v * 2},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for s in segments:
        text = s.get("text", "").strip()
        if uppercase:
            text = text.upper()
        # Highlight first keyword with accent color
        words = text.split()
        if len(words) > 3 and preset_id.startswith("viral"):
            # Highlight first word in green or cyan
            accent_color = "\\c&H00FF00&" if preset_id == "viral_yellow" else "\\c&H0000FF&"
            words[0] = f"{{{accent_color}}}{words[0]}{{\\r}}"
            text = " ".join(words)

        start_str = format_ass_time(s["start"])
        end_str = format_ass_time(s["end"])
        ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{text}\n"

    if output_path is None:
        output_path = config.DATA_DIR / f"subs_{uuid.uuid4().hex}.ass"
        
    output_path.write_text(ass_content, encoding="utf-8")
    return output_path
