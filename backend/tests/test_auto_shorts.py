import os
import pytest
from pathlib import Path
import sys

# Setup backend import path
backend_path = Path(__file__).resolve().parent.parent / "cliptrim-hd" / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app import template_service

def test_template_loading():
    template = template_service.load_template("acharya_prashant_classic")
    assert template is not None
    assert template["name"] == "Acharya Prashant Classic"
    assert template["canvas"]["width"] == 1080
    assert template["canvas"]["height"] == 1920
    assert "PRASHANT" in template["header"]["text"].replace(" ", "")

def test_format_ass_time():
    assert template_service.format_ass_time(0.0) == "0:00:00.00"
    assert template_service.format_ass_time(1.234) == "0:00:01.23"
    assert template_service.format_ass_time(65.5) == "0:01:05.50"
    assert template_service.format_ass_time(3661.05) == "1:01:01.05"

def test_group_words_into_chunks():
    words = [
        {"word": "जब", "start": 0.0, "end": 0.4},
        {"word": "भी", "start": 0.4, "end": 0.7},
        {"word": "मन", "start": 0.8, "end": 1.2},
        {"word": "भटके", "start": 1.2, "end": 1.8},
        {"word": "तो", "start": 1.9, "end": 2.2},
    ]
    chunks = template_service.group_words_into_chunks(words, max_words=2)
    assert len(chunks) == 3
    assert chunks[0]["text"] == "जब भी"
    assert chunks[0]["start"] == 0.0
    assert chunks[0]["end"] == 0.7
    assert chunks[1]["text"] == "मन भटके"
    assert chunks[2]["text"] == "तो"

def test_generate_ass_subtitles(tmp_path):
    template = template_service.load_template("acharya_prashant_classic")
    chunks = [
        {"start": 0.5, "end": 1.5, "text": "नमस्ते दोस्तों"}
    ]
    ass_path = tmp_path / "test.ass"
    out = template_service.generate_ass_subtitles(chunks, template, ass_path)
    assert out.is_file()
    content = out.read_text(encoding="utf-8")
    assert "ScriptType: v4.00+" in content
    assert "Style: Default" in content
    assert "नमस्ते दोस्तों" in content
    assert "Dialogue: 0,0:00:00.50,0:00:01.50,Glow" in content

def test_build_filter_complex(tmp_path):
    template = template_service.load_template("acharya_prashant_classic")
    sub_file = tmp_path / "sub.ass"
    sub_file.write_text("[Script Info]", encoding="utf-8")
    fc, out_label = template_service.build_template_filter_complex(template, sub_file)
    assert "pad=1080:1920" in fc
    # Header is either overlaid via authentic logo png or drawn with drawtext & gold drawbox lines
    assert ("overlay=" in fc or "drawtext=" in fc)
    assert "subtitles=" in fc
    assert out_label == "v_out"
