import json
import pytest
from fastapi.testclient import TestClient
from app import main

client = TestClient(main.app)

def test_project_crud():
    # 1. Create project
    r = client.post("/api/projects", json={"name": "Nasruddin Story", "folder": "Stories"})
    assert r.status_code == 200
    p = r.json()
    assert p["name"] == "Nasruddin Story"
    assert p["folder"] == "Stories"
    pid = p["id"]

    # 2. List projects
    r = client.get("/api/projects?search=Nasruddin")
    assert r.status_code == 200
    projs = r.json()
    assert any(x["id"] == pid for x in projs)

    # 3. Create folders
    r_f1 = client.post(f"/api/projects/{pid}/folders", json={"name": "Introduction"})
    assert r_f1.status_code == 200
    f1_id = r_f1.json()["id"]

    r_f2 = client.post(f"/api/projects/{pid}/folders", json={"name": "Main Story"})
    assert r_f2.status_code == 200
    f2_id = r_f2.json()["id"]

    # 4. Create clips
    r_c1 = client.post(f"/api/projects/{pid}/clips", json={"name": "Intro_01", "start_time": 0.0, "end_time": 5.5, "folder_id": f1_id})
    assert r_c1.status_code == 200
    c1_id = r_c1.json()["id"]

    r_c2 = client.post(f"/api/projects/{pid}/clips", json={"name": "Intro_02", "start_time": 5.5, "end_time": 12.0, "folder_id": f1_id})
    assert r_c2.status_code == 200
    c2_id = r_c2.json()["id"]

    # 5. Auto number clips
    r_num = client.post(f"/api/projects/{pid}/clips/auto-number", json={"folder_id": f1_id})
    assert r_num.status_code == 200
    assert len(r_num.json()) == 2
    assert r_num.json()[0]["name"] == "Introduction_01"

    # 6. Reorder clips
    r_reorder = client.post(f"/api/projects/{pid}/clips/reorder", json={"clip_ids": [c2_id, c1_id]})
    assert r_reorder.status_code == 200

    # 7. Duplicate project
    r_dup = client.post(f"/api/projects/{pid}/duplicate")
    assert r_dup.status_code == 200
    dup_p = r_dup.json()
    assert "Copy" in dup_p["name"]
    assert len(dup_p["clips"]) == 2

    # 8. Delete projects
    assert client.delete(f"/api/projects/{pid}").status_code == 200
    assert client.delete(f"/api/projects/{dup_p['id']}").status_code == 200

def test_music_and_subtitles():
    # 1. Subtitle presets
    r = client.get("/api/subtitles/presets")
    assert r.status_code == 200
    presets = r.json()
    assert len(presets) >= 4
    assert any(p["id"] == "viral_yellow" for p in presets)

    # 2. Synthesize short music track
    r_m = client.post("/api/music/generate", json={"mood": "emotional", "genre": "cinematic", "duration": 2.0})
    assert r_m.status_code == 200
    m = r_m.json()
    assert m["mood"] == "emotional"
    assert "url" in m
