Write-Host "Starting ClipTrim HD Studio (Dev Mode)..." -ForegroundColor Cyan
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptDir\backend'; .\.venv\Scripts\activate.ps1; python -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptDir\frontend'; npm run dev"

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"
