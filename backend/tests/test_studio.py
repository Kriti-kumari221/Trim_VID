import json
import pytest
from app import db, projects_service, clips_service, music_service, subtitles_service

def test_project_crud():
    db.init_db()
    # 1. Create project
    p = projects_service.create_project("Nasruddin Story", "Stories")
    assert p["name"] == "Nasruddin Story"
    assert p["folder"] == "Stories"
    pid = p["id"]

    # 2. List projects
    projs = projects_service.list_projects(search="Nasruddin")
    assert any(x["id"] == pid for x in projs)

    # 3. Create folders
    f1 = clips_service.create_folder(pid, "Introduction")
    f1_id = f1["id"]
    f2 = clips_service.create_folder(pid, "Main Story")
    f2_id = f2["id"]

    # 4. Create clips
    c1 = clips_service.create_clip(pid, "Intro_01", 0.0, 5.5, f1_id)
    c2 = clips_service.create_clip(pid, "Intro_02", 5.5, 12.0, f1_id)
    assert c1["name"] == "Intro_01"
    assert c2["name"] == "Intro_02"

    # 5. Auto number clips
    numbered = clips_service.auto_number_clips(pid, f1_id)
    assert len(numbered) == 2
    assert numbered[0]["name"] == "Introduction_01"

    # 6. Reorder clips
    reordered = clips_service.reorder_clips([c2["id"], c1["id"]])
    assert reordered is True

    # 7. Duplicate project
    dup = projects_service.duplicate_project(pid)
    assert dup is not None
    assert "Copy" in dup["name"]

    # 8. Delete projects
    assert projects_service.delete_project(pid) is True
    assert projects_service.delete_project(dup["id"]) is True

def test_music_and_subtitles():
    db.init_db()
    # 1. Subtitle presets
    presets = subtitles_service.SUBTITLE_PRESETS
    assert len(presets) >= 4
    assert any(p["id"] == "viral_yellow" for p in presets)

    # 2. Synthesize short music track
    m = music_service.generate_music_for_project(None, mood="emotional", genre="cinematic", duration=2.0)
    assert m["mood"] == "emotional"
    assert "url" in m

    # 3. Script-to-music composition
    comp = music_service.detect_and_compose_from_script(None)
    assert comp is not None
    assert "url" in comp
