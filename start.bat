@echo off
REM One-click start for Windows: sets up Python, installs packages, opens the portal.
title Resilient Storage
cd /d "%~dp0services"

where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed. Install Python 3.11+ from https://www.python.org/downloads/
  echo Tick "Add python.exe to PATH" during install, then run this file again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Creating virtual environment...
  python -m venv .venv
)

echo [2/3] Installing packages (first run takes a minute)...
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
  echo Package install failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo [3/3] Starting Resilient Storage at http://localhost:8000
echo Keep this window open. Press Ctrl+C to stop.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8000"
".venv\Scripts\python.exe" -m uvicorn app.main:app --port 8000
pause
