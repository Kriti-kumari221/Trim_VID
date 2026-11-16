#!/usr/bin/env bash
# Exit on error
set -e

echo "=== Building ClipTrim HD Studio ==="

# 1. Install system ffmpeg if not present
if ! command -v ffmpeg &> /dev/null; then
    echo "Installing FFmpeg..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y ffmpeg
    else
        echo "Warning: apt-get not found. Ensure FFmpeg is installed in your environment."
    fi
fi

# 2. Build React frontend
echo "Building Frontend..."
cd frontend
npm ci
npm run build
cd ..

# 3. Install Python dependencies
echo "Installing Python dependencies..."
cd backend
pip install -r requirements.txt
python -c "import static_ffmpeg; static_ffmpeg.add_paths()" || true
cd ..

echo "=== Build Complete ==="
