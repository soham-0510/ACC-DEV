#!/usr/bin/env bash
# One-click start for macOS / Linux: sets up Python, installs packages, opens the portal.
set -e
cd "$(dirname "$0")/services"

PY=$(command -v python3 || command -v python || true)
if [ -z "$PY" ]; then
  echo "Python 3.11+ is required: https://www.python.org/downloads/"
  exit 1
fi

[ -x .venv/bin/python ] || { echo "[1/3] Creating virtual environment..."; "$PY" -m venv .venv; }
echo "[2/3] Installing packages..."
.venv/bin/python -m pip install -q --disable-pip-version-check -r requirements.txt

echo "[3/3] Starting Resilient Storage at http://localhost:8000 (Ctrl+C to stop)"
( sleep 3; (command -v open >/dev/null && open http://localhost:8000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8000) || true ) &
exec .venv/bin/python -m uvicorn app.main:app --port 8000
