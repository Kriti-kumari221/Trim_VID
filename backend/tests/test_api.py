import json, os, subprocess, tempfile, time
os.environ["DATA_DIR"] = tempfile.mkdtemp()
import pytest
from fastapi.testclient import TestClient
from app import main, ffmpeg_utils as fx

client = TestClient(main.app)


def mk(path, audio=True, size="1920x1080", dur=6):
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"testsrc=size={size}:rate=30:duration={dur}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}", "-c:a", "aac"]
    subprocess.run(cmd + ["-c:v", "libx264", "-g", "30", "-pix_fmt", "yuv420p", "-shortest", str(path)], check=True)
    return path


@pytest.fixture(scope="module")
def sample(tmp_path_factory):
    return mk(tmp_path_factory.mktemp("m") / "s.mp4")


def up(p):
    with open(p, "rb") as f:
        return client.post("/api/upload", files={"file": (p.name, f, "video/mp4")})


@pytest.fixture(scope="module")
def vid(sample):
    return up(sample).json()["video_id"]


def run_job(vid, **body):
    j = client.post(f"/api/video/{vid}/trim", json=body).json()
    for _ in range(600):
        s = client.get(f"/api/jobs/{j['id']}").json()
        if s["status"] in ("done", "failed", "cancelled"):
            return s
        time.sleep(0.2)
    raise AssertionError("job timed out")


def save(job_id, tmp_path):
    r = client.get(f"/api/jobs/{job_id}/download")
    assert r.status_code == 200
    p = tmp_path / "out.mp4"
    p.write_bytes(r.content)
    return p


def streams(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", str(p)],
                         capture_output=True, text=True).stdout
    return {s["codec_type"]: s for s in json.loads(out)["streams"]}


def test_upload_and_metadata(vid):
    m = client.get(f"/api/video/{vid}/metadata").json()
    assert m["width"] == 1920 and m["height"] == 1080 and m["has_audio"] and abs(m["duration"] - 6) < 0.2 and m["fps"] == 30


def test_rejects_bad_files(tmp_path):
    bad = tmp_path / "x.mp4"
    bad.write_bytes(b"not a video")
    assert up(bad).status_code == 400
    txt = tmp_path / "x.txt"
    txt.write_text("hi")
    assert up(txt).status_code == 415


def test_path_traversal():
    assert client.get("/api/video/..%2F..%2Fetc/metadata").status_code == 404


def test_invalid_timestamps(vid):
    t = f"/api/video/{vid}/trim"
    assert client.post(t, json={"start": 3, "end": 1}).status_code == 400      # start > end
    assert client.post(t, json={"start": 1, "end": 1}).status_code == 400
    assert client.post(t, json={"start": 1, "end": 99}).status_code == 400     # beyond duration
    assert client.post(t, json={"start": -1, "end": 2}).status_code == 422


def test_precise_trim_accuracy_sync_and_download(vid, tmp_path):
    s = run_job(vid, start=1.234, end=3.734, mode="precise")
    assert s["status"] == "done"
    st = streams(save(s["id"], tmp_path))
    v, a = float(st["video"]["duration"]), float(st["audio"]["duration"])
    assert abs(v - 2.5) < 0.1 and abs(a - v) < 0.1


def test_fast_trim(vid, tmp_path):
    s = run_job(vid, start=1.5, end=3.5, mode="fast")
    assert s["status"] == "done"
    assert float(streams(save(s["id"], tmp_path))["video"]["duration"]) >= 1.9


def test_hd_export_and_h265(vid, tmp_path):
    s = run_job(vid, start=0, end=1.5, resolution="720p", codec="h265", quality="small")
    st = streams(save(s["id"], tmp_path))
    assert st["video"]["height"] == 720 and st["video"]["codec_name"] == "hevc"


def test_no_audio_video(tmp_path):
    p = mk(tmp_path / "na.mp4", audio=False, size="640x360", dur=3)
    v = up(p).json()["video_id"]
    assert run_job(v, start=0.5, end=2)["status"] == "done"


def test_size_limit(sample, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 1000)
    assert up(sample).status_code == 413


def test_failed_job(vid, monkeypatch):
    monkeypatch.setattr(fx, "build_cmd", lambda *a, **k: ["ffmpeg", "-v", "error", "-i", "/nope.mp4", "/tmp/x.mp4"])
    s = run_job(vid, start=0, end=1)
    assert s["status"] == "failed" and s["error"]
    assert client.get(f"/api/jobs/{s['id']}/download").status_code == 409


def test_preview_and_delete(sample):
    v = up(sample).json()["video_id"]
    r = client.post(f"/api/video/{v}/preview", json={"start": 0, "end": 2})
    assert r.status_code == 200 and client.get(r.json()["preview_url"]).status_code == 200
    assert client.delete(f"/api/video/{v}").status_code == 200
    assert client.get(f"/api/video/{v}/metadata").status_code == 404
