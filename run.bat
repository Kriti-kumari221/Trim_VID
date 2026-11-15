@echo off
setlocal
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
    echo Python virtual environment not found in backend\.venv.
    echo Creating virtual environment...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

echo Starting ClipTrim HD on http://localhost:8000 ...
start http://localhost:8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
