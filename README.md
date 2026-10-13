# Disaster-Resilient Cloud Storage & Recovery Portal

Cloud-native file storage with JWT/RBAC, SHA-256 integrity, content-addressed deduplication,
encryption at rest, versioning, snapshot-based disaster recovery, and Prometheus metrics.
Built to run on a laptop today and on Kubernetes Persistent Volumes later, **with zero code changes**.

## Quick start (one click)

Needs only **Python 3.11+** (tick "Add python.exe to PATH" when installing on Windows).

- **Windows:** double-click `start.bat`
- **macOS / Linux:** run `./start.sh`

The script creates a virtual environment, installs packages, starts the server and opens
**http://localhost:8000**. Register a user named `admin` to get the recovery tools, plus any other
user for normal file storage.

### Try the full story in two minutes
1. As a normal user, drag files onto the page. Upload one file twice under different names: both show the **same fingerprint** (deduplication).
2. Upload a changed file with an existing name, open its **History** and restore an older version.
3. Sign in as `admin`, open **Recovery**, click **Take snapshot**.
4. Click **Simulate failure**: fingerprints turn red and downloads are blocked.
5. Click **Restore** on the snapshot and watch the five-step recovery pipeline verify and repair everything.

Press **Ctrl + K** anywhere for the command palette. The theme toggle is at the bottom of the sidebar.

## Run manually (developers)

```bash
cd services
python -m venv .venv
# Windows:      .venv\Scripts\activate
# Linux/macOS:  source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -v                                   # 5 end-to-end tests
uvicorn app.main:app --reload               # http://localhost:8000/docs
```

Local mode uses SQLite (`data/storage.db`) and a folder (`data/blobs/`) as storage.

Open **http://localhost:8000** for the portal (the pre-built React app in `frontend/dist`
is served by FastAPI, so Node.js is not needed just to use it). API docs stay at `/docs`.

### Changing the portal (needs Node.js 20+)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, live reload, API proxied to :8000
npm run build      # refresh frontend/dist so FastAPI serves the new version
```

Portal (React 19 + Vite, Motion for animation, Lucide icons):
- **My files**: drop-anywhere upload with live progress, list and grid layouts, SHA-256 fingerprints, filter, version-history drawer with restore
- **Recovery** (admin): animated health ring, integrity scan, snapshots, failure simulation, five-step verified recovery pipeline with recovery time
- **Overview** (admin): animated counters, deduplication savings, integrity summary, accounts
- Light and dark themes, Ctrl+K command palette, keyboard accessible, responsive to phone width, respects reduced-motion

## Architecture mapping

| Diagram layer        | Code                                  | Kubernetes (Phase 3)                    |
|----------------------|---------------------------------------|-----------------------------------------|
| Authentication Svc   | `app/auth` — JWT + RBAC (user/admin)  | Deployment `SERVICE=auth`               |
| Upload Service       | `app/upload` — dedup + encrypt + hash | Deployment `SERVICE=upload` + HPA       |
| Versioning Service   | `app/versioning`                      | Deployment `SERVICE=versioning`         |
| Recovery Service     | `app/recovery` — snapshots, verified restore, chaos | Deployment + VolumeSnapshot + Velero |
| Monitoring API       | `app/monitoring` — `/metrics`, probes | Prometheus + Grafana                    |
| Checksum + Dedup     | `app/core/blobs.py` (content-addressed) | —                                      |
| PV / PVC             | `app/core/storage.py` (local or S3)   | Postgres + MinIO StatefulSets on PVCs   |

**Modular monolith:** one codebase, one image; `SERVICE` env var selects which module a pod serves.

## Configuration (env vars)

| Variable          | Default (laptop)                 | Docker / K8s                                   |
|-------------------|----------------------------------|------------------------------------------------|
| `SERVICE`         | `all`                            | `auth` / `upload` / `versioning` / `recovery`  |
| `DATABASE_URL`    | `sqlite:///./data/storage.db`    | `postgresql+psycopg://...@postgres:5432/storage` |
| `STORAGE_BACKEND` | `local`                          | `s3` (MinIO / AWS S3)                          |
| `JWT_SECRET`, `ENCRYPTION_KEY` | dev values          | from Kubernetes Secrets                       |
| `BOOTSTRAP_ADMIN` | `admin`                          | username that becomes admin on register        |
| `ALLOW_CHAOS`     | `true`                           | `false` in production                          |

## API

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | public |
| GET  | `/api/auth/me` | user |
| POST/GET | `/api/files` | user — upload (same name = new version) / list |
| GET  | `/api/files/{id}/download?version=N` | user — SHA-256 verified |
| DELETE | `/api/files/{id}` | user |
| GET  | `/api/files/{id}/versions` | user |
| POST | `/api/files/{id}/versions/{n}/restore` | user |
| GET  | `/api/recovery/integrity` | admin — scan every blob |
| POST/GET | `/api/recovery/snapshots` | admin |
| POST | `/api/recovery/snapshots/{id}/restore` | admin — verify-then-restore |
| POST | `/api/recovery/simulate-disaster?count=N&mode=delete\|corrupt` | admin — demo chaos |
| GET  | `/api/admin/stats`, `/api/auth/users` | admin |
| GET  | `/health/live`, `/health/ready`, `/metrics` | probes / Prometheus |

## Demo script (Swagger UI at /docs)

1. Register `admin` and `alice`; click **Authorize** and log in.
2. As alice upload `notes.txt`, then upload a changed `notes.txt` (v2), then restore v1.
3. Upload the same content under another name → `deduplicated: true`; check `/api/admin/stats`.
4. As admin: `POST /api/recovery/snapshots`.
5. `POST /api/recovery/simulate-disaster?count=5&mode=corrupt` → `/integrity` shows damage, downloads return 503.
6. `POST /api/recovery/snapshots/{id}/restore` → `fully_recovered: true`, downloads work again.

## Roadmap

- [x] Phase 1 — Backend (this)
- [x] Phase 1b — React portal (animated redesign)
- [ ] Phase 2 — Docker Compose (`deploy/compose/`) with Postgres + MinIO
- [ ] Phase 3 — Kubernetes: StatefulSets on PVCs, 5 Deployments, Ingress, probes, HPA
- [ ] Phase 4 — CSI VolumeSnapshots + Velero → backup MinIO; Prometheus + Grafana; GitHub Actions
