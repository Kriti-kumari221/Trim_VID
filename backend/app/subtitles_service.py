import json
import uuid
import re
from pathlib import Path
from typing import Optional, List, Dict, Any, Union
from . import db, config

# Professional Subtitle Presets organized across 10 VEED-inspired Categories
# Colors formatted for ASS (Alpha-Blue-Green-Red: &HAABBGGRR) and web preview
SUBTITLE_PRESETS: List[Dict[str, Any]] = [
    # 1. Popular
    {
        "id": "pop_ap_yellow",
        "name": "Khand Viral Yellow",
        "category": "Popular",
        "font_family": "Khand",
        "font_size": 28,
        "font_weight": "bold",
        "primary_color": "#F8F0AE",
        "ass_primary": "&H00AEF0F8",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#000000",
        "ass_shadow": "&H80000000",
        "shadow_depth": 2,
        "shadow_blur": 4,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 70,
        "casing": "uppercase",
        "animation": "popup",
        "highlight_color": "#FFFF00",
        "ass_highlight": "&H0000FFFF",
        "description": "High-retention creator style with punchy uppercase yellow"
    },
    {
        "id": "pop_mr_beast",
        "name": "Hormozi Impact Pop",
        "category": "Popular",
        "font_family": "Impact",
        "font_size": 32,
        "font_weight": "bold",
        "primary_color": "#FFFF00",
        "ass_primary": "&H0000FFFF",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 5,
        "shadow_color": "#000000",
        "ass_shadow": "&HA0000000",
        "shadow_depth": 3,
        "shadow_blur": 6,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 75,
        "casing": "uppercase",
        "animation": "pop_keyword",
        "highlight_color": "#00FF66",
        "ass_highlight": "&H0066FF00",
        "description": "Boldest impact font with magnified green/yellow keywords"
    },
    {
        "id": "pop_clean_boxed",
        "name": "Modern Boxed Pill",
        "category": "Popular",
        "font_family": "Arial",
        "font_size": 22,
        "font_weight": "bold",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 1,
        "shadow_color": "#000000",
        "ass_shadow": "&H00000000",
        "shadow_depth": 0,
        "shadow_blur": 0,
        "bg_color": "#000000",
        "ass_bg": "&HB0000000",
        "bg_opacity": 0.85,
        "bg_padding": 8,
        "bg_radius": 8,
        "border_style": 3,
        "alignment": 2,
        "margin_v": 55,
        "casing": "normal",
        "animation": "slide_up",
        "highlight_color": "#FBBF24",
        "ass_highlight": "&H0024BFFB",
        "description": "High contrast black pill background for universal readability"
    },

    # 2. Dynamic AI
    {
        "id": "ai_word_karaoke",
        "name": "AI Dynamic Karaoke",
        "category": "Dynamic AI",
        "font_family": "Khand",
        "font_size": 30,
        "font_weight": "bold",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#000000",
        "ass_shadow": "&H80000000",
        "shadow_depth": 2,
        "shadow_blur": 4,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 70,
        "casing": "uppercase",
        "animation": "karaoke",
        "highlight_color": "#00E5FF",
        "ass_highlight": "&H00FFE500",
        "description": "AI spoken rhythm highlights word-by-word with electric cyan"
    },
    {
        "id": "ai_emphasis_pulse",
        "name": "AI Keyword Focus",
        "category": "Dynamic AI",
        "font_family": "Impact",
        "font_size": 28,
        "font_weight": "bold",
        "primary_color": "#F3F4F6",
        "ass_primary": "&H00F6F4F3",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#000000",
        "ass_shadow": "&H80000000",
        "shadow_depth": 2,
        "shadow_blur": 5,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 65,
        "casing": "uppercase",
        "animation": "pulse",
        "highlight_color": "#FF3366",
        "ass_highlight": "&H006633FF",
        "description": "Automatically scales up important philosophical words with punch"
    },
    {
        "id": "ai_spring_reveal",
        "name": "AI Spring Bounce",
        "category": "Dynamic AI",
        "font_family": "Khand",
        "font_size": 28,
        "font_weight": "bold",
        "primary_color": "#FDE047",
        "ass_primary": "&H0047E0FD",
        "outline_color": "#111827",
        "ass_outline": "&H00271811",
        "outline_width": 4,
        "shadow_color": "#000000",
        "ass_shadow": "&H60000000",
        "shadow_depth": 2,
        "shadow_blur": 4,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 68,
        "casing": "uppercase",
        "animation": "spring",
        "highlight_color": "#38BDF8",
        "ass_highlight": "&H00F8BD38",
        "description": "Elastic dynamic entrance for high retention shorts"
    },

    # 3. Social (Reels, TikTok, Shorts)
    {
        "id": "soc_tiktok_bold",
        "name": "TikTok Heavy Pro",
        "category": "Social",
        "font_family": "Arial",
        "font_size": 26,
        "font_weight": "900",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#000000",
        "ass_shadow": "&HA0000000",
        "shadow_depth": 2,
        "shadow_blur": 6,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 60,
        "casing": "normal",
        "animation": "scale_in",
        "highlight_color": "#FE2C55",
        "ass_highlight": "&H00552CFE",
        "description": "Classic TikTok white with signature red accent"
    },
    {
        "id": "soc_reels_neon",
        "name": "Instagram Reels Neon",
        "category": "Social",
        "font_family": "Khand",
        "font_size": 28,
        "font_weight": "bold",
        "primary_color": "#00FFCC",
        "ass_primary": "&H00CCFF00",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#003322",
        "ass_shadow": "&H00223300",
        "shadow_depth": 0,
        "shadow_blur": 8,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 65,
        "casing": "uppercase",
        "animation": "neon",
        "highlight_color": "#FF007F",
        "ass_highlight": "&H007F00FF",
        "description": "Vibrant cyberpunk neon gradient for viral engagement"
    },
    {
        "id": "soc_devanagari",
        "name": "Hindi / Devanagari Punch",
        "category": "Social",
        "font_family": "NotoSansDevanagari",
        "font_size": 26,
        "font_weight": "bold",
        "primary_color": "#FEF08A",
        "ass_primary": "&H008AF0FE",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#000000",
        "ass_shadow": "&H90000000",
        "shadow_depth": 2,
        "shadow_blur": 4,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 62,
        "casing": "normal",
        "animation": "popup",
        "highlight_color": "#F97316",
        "ass_highlight": "&H001673F9",
        "description": "Native Hindi font rendering with pristine matras & contrast"
    },

    # 4. Minimal
    {
        "id": "min_clean_white",
        "name": "Clean Sans Minimal",
        "category": "Minimal",
        "font_family": "Arial",
        "font_size": 20,
        "font_weight": "600",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#000000",
        "ass_outline": "&H40000000",
        "outline_width": 1.5,
        "shadow_color": "#000000",
        "ass_shadow": "&H40000000",
        "shadow_depth": 1,
        "shadow_blur": 2,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 45,
        "casing": "normal",
        "animation": "fade_in",
        "highlight_color": "#38BDF8",
        "ass_highlight": "&H00F8BD38",
        "description": "Subtle, non-distracting minimalist captions"
    },
    {
        "id": "min_charcoal_pill",
        "name": "Frosted Gray Tag",
        "category": "Minimal",
        "font_family": "Arial",
        "font_size": 18,
        "font_weight": "bold",
        "primary_color": "#F3F4F6",
        "ass_primary": "&H00F6F4F3",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 0,
        "shadow_color": "#000000",
        "ass_shadow": "&H00000000",
        "shadow_depth": 0,
        "shadow_blur": 0,
        "bg_color": "#1F2937",
        "ass_bg": "&H9037291F",
        "bg_opacity": 0.75,
        "bg_padding": 6,
        "bg_radius": 6,
        "border_style": 3,
        "alignment": 2,
        "margin_v": 45,
        "casing": "normal",
        "animation": "smooth_reveal",
        "highlight_color": "#FBBF24",
        "ass_highlight": "&H0024BFFB",
        "description": "Refined charcoal glass container for documentaries"
    },

    # 5. Classic
    {
        "id": "cls_cinema_serif",
        "name": "Classic Movie Serif",
        "category": "Classic",
        "font_family": "Georgia",
        "font_size": 22,
        "font_weight": "normal",
        "primary_color": "#FFFBEB",
        "ass_primary": "&H00EBFBFF",
        "outline_color": "#000000",
        "ass_outline": "&H60000000",
        "outline_width": 1.5,
        "shadow_color": "#000000",
        "ass_shadow": "&H80000000",
        "shadow_depth": 2,
        "shadow_blur": 3,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 48,
        "casing": "normal",
        "animation": "fade_in",
        "highlight_color": "#FDE68A",
        "ass_highlight": "&H008AE6FD",
        "description": "Timeless theatrical aesthetic with elegant serif letterforms"
    },
    {
        "id": "cls_broadcast_yellow",
        "name": "Broadcast Teletext",
        "category": "Classic",
        "font_family": "Arial",
        "font_size": 22,
        "font_weight": "bold",
        "primary_color": "#FACC15",
        "ass_primary": "&H0015CCFA",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 0,
        "shadow_color": "#000000",
        "ass_shadow": "&H00000000",
        "shadow_depth": 0,
        "shadow_blur": 0,
        "bg_color": "#000000",
        "ass_bg": "&H00000000",
        "bg_opacity": 1.0,
        "bg_padding": 4,
        "bg_radius": 0,
        "border_style": 3,
        "alignment": 2,
        "margin_v": 40,
        "casing": "normal",
        "animation": "none",
        "highlight_color": "#FFFFFF",
        "ass_highlight": "&H00FFFFFF",
        "description": "Standard high-accessibility TV closed captioning"
    },

    # 6. Karaoke
    {
        "id": "kar_bounce_ball",
        "name": "Bouncing Ball Karaoke",
        "category": "Karaoke",
        "font_family": "Khand",
        "font_size": 30,
        "font_weight": "bold",
        "primary_color": "#9CA3AF",
        "ass_primary": "&H00AFA39C",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#000000",
        "ass_shadow": "&H80000000",
        "shadow_depth": 2,
        "shadow_blur": 4,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 70,
        "casing": "uppercase",
        "animation": "karaoke",
        "highlight_color": "#22C55E",
        "ass_highlight": "&H005EC522",
        "description": "Vibrant green highlight tracking each spoken word rhythmically"
    },
    {
        "id": "kar_golden_wave",
        "name": "Golden Glow Karaoke",
        "category": "Karaoke",
        "font_family": "Impact",
        "font_size": 28,
        "font_weight": "bold",
        "primary_color": "#4B5563",
        "ass_primary": "&H0063554B",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 3.5,
        "shadow_color": "#D97706",
        "ass_shadow": "&H000677D9",
        "shadow_depth": 0,
        "shadow_blur": 10,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 65,
        "casing": "uppercase",
        "animation": "karaoke",
        "highlight_color": "#F59E0B",
        "ass_highlight": "&H000B9EF5",
        "description": "Dim unvoiced text lights up into radiant warm gold as spoken"
    },

    # 7. Highlight
    {
        "id": "hl_marker_yellow",
        "name": "Highlighter Marker Box",
        "category": "Highlight",
        "font_family": "Arial",
        "font_size": 24,
        "font_weight": "bold",
        "primary_color": "#000000",
        "ass_primary": "&H00000000",
        "outline_color": "transparent",
        "ass_outline": "&H00000000",
        "outline_width": 0,
        "shadow_color": "transparent",
        "ass_shadow": "&H00000000",
        "shadow_depth": 0,
        "shadow_blur": 0,
        "bg_color": "#FACC15",
        "ass_bg": "&H0015CCFA",
        "bg_opacity": 0.95,
        "bg_padding": 6,
        "bg_radius": 4,
        "border_style": 3,
        "alignment": 2,
        "margin_v": 60,
        "casing": "normal",
        "animation": "scale_in",
        "highlight_color": "#FFFFFF",
        "ass_highlight": "&H00FFFFFF",
        "description": "Marker highlighter tape background with crisp black ink"
    },
    {
        "id": "hl_cyber_cyan",
        "name": "Cyan Outline Focus",
        "category": "Highlight",
        "font_family": "Khand",
        "font_size": 28,
        "font_weight": "bold",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#06B6D4",
        "ass_outline": "&H00D4B606",
        "outline_width": 4.5,
        "shadow_color": "#0891B2",
        "ass_shadow": "&H00B29108",
        "shadow_depth": 2,
        "shadow_blur": 6,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 68,
        "casing": "uppercase",
        "animation": "popup",
        "highlight_color": "#A5F3FC",
        "ass_highlight": "&H00FCF3A5",
        "description": "Cyan aura outline highlighting important spoken discourse"
    },

    # 8. Animated
    {
        "id": "anim_typewriter",
        "name": "Typewriter Staccato",
        "category": "Animated",
        "font_family": "Arial",
        "font_size": 22,
        "font_weight": "bold",
        "primary_color": "#E5E7EB",
        "ass_primary": "&H00EBE7E5",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 3,
        "shadow_color": "#000000",
        "ass_shadow": "&H70000000",
        "shadow_depth": 2,
        "shadow_blur": 4,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 60,
        "casing": "normal",
        "animation": "typewriter",
        "highlight_color": "#F43F5E",
        "ass_highlight": "&H005E3FF4",
        "description": "Characters punch sequentially into screen like a terminal"
    },
    {
        "id": "anim_glitch_pop",
        "name": "Cyberpunk RGB Glitch",
        "category": "Animated",
        "font_family": "Impact",
        "font_size": 30,
        "font_weight": "bold",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 4,
        "shadow_color": "#FF0055",
        "ass_shadow": "&H005500FF",
        "shadow_depth": 3,
        "shadow_blur": 6,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 72,
        "casing": "uppercase",
        "animation": "glitch",
        "highlight_color": "#00FFFF",
        "ass_highlight": "&H00FFFF00",
        "description": "Chromatic aberration with RGB split twitch on punchlines"
    },
    {
        "id": "anim_3d_flip",
        "name": "3D Perspective Flip",
        "category": "Animated",
        "font_family": "Khand",
        "font_size": 28,
        "font_weight": "bold",
        "primary_color": "#FBBF24",
        "ass_primary": "&H0024BFFB",
        "outline_color": "#78350F",
        "ass_outline": "&H000F3578",
        "outline_width": 4,
        "shadow_color": "#451A03",
        "ass_shadow": "&H00031A45",
        "shadow_depth": 3,
        "shadow_blur": 4,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 65,
        "casing": "uppercase",
        "animation": "flip",
        "highlight_color": "#FFFFFF",
        "ass_highlight": "&H00FFFFFF",
        "description": "Dramatic 3D tilt flip on word transitions"
    },

    # 9. Professional
    {
        "id": "pro_editorial_dark",
        "name": "Vox / Vice Editorial Pill",
        "category": "Professional",
        "font_family": "Arial",
        "font_size": 22,
        "font_weight": "bold",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#000000",
        "ass_outline": "&H00000000",
        "outline_width": 0,
        "shadow_color": "#000000",
        "ass_shadow": "&H00000000",
        "shadow_depth": 0,
        "shadow_blur": 0,
        "bg_color": "#111827",
        "ass_bg": "&HE0271811",
        "bg_opacity": 0.9,
        "bg_padding": 8,
        "bg_radius": 6,
        "border_style": 3,
        "alignment": 2,
        "margin_v": 52,
        "casing": "normal",
        "animation": "slide_up",
        "highlight_color": "#F59E0B",
        "ass_highlight": "&H000B9EF5",
        "description": "Prestigious journalism aesthetic with rounded background cards"
    },
    {
        "id": "pro_keynote_clean",
        "name": "Apple Keynote Crisp",
        "category": "Professional",
        "font_family": "Arial",
        "font_size": 24,
        "font_weight": "600",
        "primary_color": "#FFFFFF",
        "ass_primary": "&H00FFFFFF",
        "outline_color": "#000000",
        "ass_outline": "&H40000000",
        "outline_width": 2,
        "shadow_color": "#000000",
        "ass_shadow": "&HA0000000",
        "shadow_depth": 2,
        "shadow_blur": 6,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 55,
        "casing": "normal",
        "animation": "smooth_reveal",
        "highlight_color": "#60A5FA",
        "ass_highlight": "&H00FAA560",
        "description": "Ultra high resolution presentation typography"
    },

    # 10. Cinematic
    {
        "id": "cin_warm_letterbox",
        "name": "Interstellar Warm Serif",
        "category": "Cinematic",
        "font_family": "Georgia",
        "font_size": 20,
        "font_weight": "normal",
        "primary_color": "#FEF3C7",
        "ass_primary": "&H00C7F3FE",
        "outline_color": "#000000",
        "ass_outline": "&H50000000",
        "outline_width": 1.5,
        "shadow_color": "#000000",
        "ass_shadow": "&H80000000",
        "shadow_depth": 2,
        "shadow_blur": 3,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 45,
        "casing": "normal",
        "animation": "fade_in",
        "highlight_color": "#FDE68A",
        "ass_highlight": "&H008AE6FD",
        "description": "Warm golden hour serif subtitles for dramatic discourses"
    },
    {
        "id": "cin_dune_spaced",
        "name": "Dune Wide Spaced",
        "category": "Cinematic",
        "font_family": "Arial",
        "font_size": 19,
        "font_weight": "bold",
        "letter_spacing": 4,
        "primary_color": "#E0E7FF",
        "ass_primary": "&H00FFE7E0",
        "outline_color": "#000000",
        "ass_outline": "&H70000000",
        "outline_width": 2,
        "shadow_color": "#000000",
        "ass_shadow": "&H90000000",
        "shadow_depth": 2,
        "shadow_blur": 5,
        "bg_color": "transparent",
        "ass_bg": "&H00000000",
        "border_style": 1,
        "alignment": 2,
        "margin_v": 48,
        "casing": "uppercase",
        "animation": "smooth_reveal",
        "highlight_color": "#818CF8",
        "ass_highlight": "&H00F88C81",
        "description": "Spaced uppercase futuristic title styling"
    }
]


def format_ass_time(seconds: float) -> str:
    """Formats float seconds into ASS timestamp format: H:MM:SS.cs"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        s += 1
        cs = 0
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def hex_to_ass_color(hex_str: str, alpha: int = 0) -> str:
    """
    Converts CSS hex color (#RRGGBB or #RGB) into ASS color &HAABBGGRR.
    """
    if not hex_str or hex_str == "transparent":
        return "&H00000000"
    hex_clean = hex_str.lstrip("#")
    if len(hex_clean) == 3:
        hex_clean = "".join([c * 2 for c in hex_clean])
    if len(hex_clean) == 6:
        r = hex_clean[0:2]
        g = hex_clean[2:4]
        b = hex_clean[4:6]
        return f"&H{alpha:02X}{b}{g}{r}"
    elif len(hex_clean) == 8:
        # #RRGGBBAA
        r = hex_clean[0:2]
        g = hex_clean[2:4]
        b = hex_clean[4:6]
        a = 255 - int(hex_clean[6:8], 16)  # ASS alpha is inverted (0=opaque, 255=transparent)
        return f"&H{a:02X}{b}{g}{r}"
    return "&H00FFFFFF"


def generate_ass_subtitles(
    segments: List[Dict[str, Any]],
    preset_or_config: Union[str, Dict[str, Any]] = "pop_ap_yellow",
    output_path: Optional[Path] = None,
    canvas_w: int = 1080,
    canvas_h: int = 1920
) -> Path:
    """
    Generates a high-fidelity Advanced SubStation Alpha (.ass) subtitle file.
    Supports:
    - Custom coordinates (x, y percentages), font family, font size, bold/italic.
    - Full outline, shadow blur, custom box backgrounds.
    - Word-level animation effects (karaoke, scale_pop, word_highlight, slide, fade).
    - Per-segment / individual overrides preserved from frontend direct manipulation.
    """
    # 1. Resolve base preset configuration
    preset_id = preset_or_config if isinstance(preset_or_config, str) else preset_or_config.get("id", "pop_ap_yellow")
    base_preset = next((p for p in SUBTITLE_PRESETS if p["id"] == preset_id), SUBTITLE_PRESETS[0])

    # If preset_or_config is a full custom dictionary, merge it over base preset
    cfg = dict(base_preset)
    if isinstance(preset_or_config, dict):
        cfg.update(preset_or_config)

    font_family = cfg.get("font_family", "Arial")
    # Map friendly names to actual font names for libass
    font_name = "Arial"
    if "Khand" in font_family:
        font_name = "Khand-Bold"
    elif "Impact" in font_family:
        font_name = "Impact"
    elif "Devanagari" in font_family or "Noto" in font_family:
        font_name = "NotoSansDevanagari-Bold"
    elif "Georgia" in font_family:
        font_name = "Georgia"

    # Scale font size relative to 1080x1920 vertical canvas
    base_font_size = int(cfg.get("font_size", 28)) * 2.2

    # Color processing
    primary_color = cfg.get("ass_primary") or hex_to_ass_color(cfg.get("primary_color", "#FFFF00"))
    outline_color = cfg.get("ass_outline") or hex_to_ass_color(cfg.get("outline_color", "#000000"))
    shadow_color = cfg.get("ass_shadow") or hex_to_ass_color(cfg.get("shadow_color", "#000000"), alpha=128)
    bg_color = cfg.get("ass_bg") or hex_to_ass_color(cfg.get("bg_color", "transparent"), alpha=60)
    highlight_color = cfg.get("ass_highlight") or hex_to_ass_color(cfg.get("highlight_color", "#00FF66"))

    border_style = int(cfg.get("border_style", 3 if cfg.get("bg_color") and cfg.get("bg_color") != "transparent" else 1))
    outline_width = float(cfg.get("outline_width", 3.0)) * 1.5
    shadow_depth = float(cfg.get("shadow_depth", 2.0)) * 1.5
    bold = -1 if cfg.get("font_weight") in ("bold", "800", "900") or cfg.get("bold") else 0
    italic = -1 if cfg.get("italic") else 0
    underline = -1 if cfg.get("underline") else 0
    casing = cfg.get("casing", "uppercase")
    alignment = int(cfg.get("alignment", 2))  # 2: bottom center, 5: middle center, 8: top center
    margin_v = int(cfg.get("margin_v", 70)) * 2
    anim_type = cfg.get("animation", "popup")

    # Positional override (if user dragged subtitle to custom X/Y)
    pos_x_pct = cfg.get("pos_x")  # e.g. 50 (%)
    pos_y_pct = cfg.get("pos_y")  # e.g. 85 (%)

    ass_content = f"""[Script Info]
Title: Professional Subtitles (VEED Style)
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: {canvas_w}
PlayResY: {canvas_h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{base_font_size},{primary_color},&H000000FF,{outline_color},{shadow_color if border_style == 1 else bg_color},{bold},{italic},{underline},0,100,100,1,0,{border_style},{outline_width},{shadow_depth},{alignment},60,60,{margin_v},1
Style: Boxed,{font_name},{base_font_size},{primary_color},&H000000FF,{outline_color},{bg_color},{bold},{italic},{underline},0,100,100,1,0,3,1,0,{alignment},60,60,{margin_v},1
Style: Glow,{font_name},{base_font_size},{highlight_color},&H000000FF,{highlight_color},{highlight_color},{bold},{italic},{underline},0,100,100,1,0,1,{outline_width + 4},0,{alignment},60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    for s in segments:
        text = s.get("text", "").strip()
        if not text:
            continue

        # Check for individual segment override
        seg_cfg = s.get("style_override") or {}
        seg_casing = seg_cfg.get("casing", casing)
        if seg_casing == "uppercase":
            text = text.upper()
        elif seg_casing == "lowercase":
            text = text.lower()

        start_str = format_ass_time(float(s["start"]))
        end_str = format_ass_time(float(s["end"]))

        # Build inline tags (Positioning, animations, word highlighting)
        inline_tags = []

        # Position override if specified
        cur_pos_x = seg_cfg.get("pos_x", pos_x_pct)
        cur_pos_y = seg_cfg.get("pos_y", pos_y_pct)
        if cur_pos_x is not None and cur_pos_y is not None:
            px = int((float(cur_pos_x) / 100.0) * canvas_w)
            py = int((float(cur_pos_y) / 100.0) * canvas_h)
            inline_tags.append(f"\\pos({px},{py})")

        # Rotation override
        rot_deg = seg_cfg.get("rotation", cfg.get("rotation", 0))
        if rot_deg:
            inline_tags.append(f"\\frz{rot_deg}")

        # Animation Tags for ASS
        cur_anim = seg_cfg.get("animation", anim_type)
        if cur_anim in ("popup", "scale_in"):
            inline_tags.append(r"\t(0,90,\fscx115\fscy115)\t(90,170,\fscx100\fscy100)")
        elif cur_anim == "bounce":
            inline_tags.append(r"\t(0,80,\fscy125)\t(80,160,\fscy95)\t(160,220,\fscy100)")
        elif cur_anim == "slide_up":
            inline_tags.append(r"\move(540,1720,540,1660)")
        elif cur_anim == "fade_in":
            inline_tags.append(r"\fad(120,80)")
        elif cur_anim == "smooth_reveal":
            inline_tags.append(r"\fad(150,100)\t(0,100,\fscx104\fscy104)\t(100,200,\fscx100\fscy100)")
        elif cur_anim == "pulse":
            inline_tags.append(r"\t(0,120,\fscx112\fscy112)\t(120,240,\fscx100\fscy100)")
        elif cur_anim == "spring":
            inline_tags.append(r"\t(0,100,\fscx120\fscy120)\t(100,180,\fscx95\fscy95)\t(180,240,\fscx100\fscy100)")
        elif cur_anim == "flip":
            inline_tags.append(r"\t(0,120,\frx30)\t(120,220,\frx0)")
        elif cur_anim == "glitch":
            inline_tags.append(r"\blur4\t(0,60,\blur0\fscx108)\t(60,120,\fscx100)")

        # Word-level highlighting / Karaoke
        words = text.split()
        if cur_anim == "pop_keyword" and len(words) > 1:
            longest_idx = max(range(len(words)), key=lambda idx: len(words[idx]))
            words[longest_idx] = f"{{\\c{highlight_color}\\fscx122\\fscy122}}{words[longest_idx]}{{\\c{primary_color}\\fscx100\\fscy100}}"
            text = " ".join(words)
        elif cur_anim == "karaoke" and len(words) > 1:
            # ASS \k karaoke timing tags
            dur_cs = int(round((float(s["end"]) - float(s["start"])) * 100))
            k_step = max(5, dur_cs // len(words))
            k_words = [f"{{\\kf{k_step}}}{w}" for w in words]
            text = " ".join(k_words)
        elif seg_cfg.get("highlight_words"):
            hl_set = set(w.lower() for w in seg_cfg["highlight_words"])
            words = [
                f"{{\\c{highlight_color}\\fscx118\\fscy118}}{w}{{\\c{primary_color}\\fscx100\\fscy100}}"
                if w.lower().strip(".,!?") in hl_set else w
                for w in words
            ]
            text = " ".join(words)

        prefix = "{" + "".join(inline_tags) + "}" if inline_tags else ""
        ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{prefix}{text}\n"

    if output_path is None:
        output_path = config.DATA_DIR / f"subs_{uuid.uuid4().hex}.ass"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(ass_content)

    return output_path
