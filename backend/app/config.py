import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env from backend directory or project root
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data")).resolve()
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "2048"))
JOB_TIMEOUT_S = int(os.getenv("JOB_TIMEOUT_S", "3600"))
TTL_HOURS = float(os.getenv("TTL_HOURS", "168"))  # default 7 days; project-linked videos are NEVER purged
USE_HW = os.getenv("USE_HW_ACCEL", "false").lower() == "true"
WORKERS = int(os.getenv("JOB_WORKERS", "2"))

cors_raw = os.getenv("CORS_ORIGINS", "*")
if cors_raw.strip() == "*":
    CORS_ORIGINS = ["*"]
else:
    CORS_ORIGINS = [orig.strip() for orig in cors_raw.split(",") if orig.strip()]
    for orig in ("http://localhost:5173", "http://127.0.0.1:5173", "https://trim-vid-34.onrender.com", "https://trim-vid.onrender.com"):
        if orig not in CORS_ORIGINS:
            CORS_ORIGINS.append(orig)

# Try standard relative paths to find built frontend
_default_dist = BASE_DIR.parent / "frontend" / "dist"
if not _default_dist.is_dir():
    alt_dist = BASE_DIR / "frontend" / "dist"
    if alt_dist.is_dir():
        _default_dist = alt_dist

FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", _default_dist)).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

