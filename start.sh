#!/usr/bin/env bash
set -e
PORT="${PORT:-8000}"
echo "Starting ClipTrim HD Studio on port $PORT..."
cd backend
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
