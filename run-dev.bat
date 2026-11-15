@echo off
setlocal
cd /d "%~dp0"
echo Starting Backend (FastAPI on :8000)...
start "ClipTrim Backend" cmd /k "cd backend && call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload --port 8000"

echo Starting Frontend (Vite on :5173)...
start "ClipTrim Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173
