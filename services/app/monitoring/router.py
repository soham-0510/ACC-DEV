"""Monitoring API: liveness/readiness probes, Prometheus /metrics, admin stats."""
from fastapi import APIRouter, Depends, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import Blob, File, FileVersion, User, get_db
from app.core.security import require_admin

router = APIRouter(tags=["monitoring"])


@router.get("/health/live")
def live():
    """Liveness: process is up. K8s restarts the pod if this fails."""
    return {"status": "alive"}


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    """Readiness: DB reachable. K8s stops sending traffic if this fails."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "service": get_settings().service}
    except Exception as e:
        return Response(f'{{"status":"not-ready","error":"{type(e).__name__}"}}', status_code=503,
                        media_type="application/json")


@router.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/api/admin/stats")
def stats(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    logical = db.scalar(select(func.coalesce(func.sum(FileVersion.size), 0)))
    physical = db.scalar(select(func.coalesce(func.sum(Blob.size), 0)))
    return {
        "users": db.scalar(select(func.count(User.id))),
        "files": db.scalar(select(func.count(File.id))),
        "versions": db.scalar(select(func.count(FileVersion.id))),
        "unique_blobs": db.scalar(select(func.count(Blob.sha256))),
        "logical_bytes": logical,
        "physical_bytes": physical,
        "dedup_saved_bytes": logical - physical,
        "dedup_ratio": round(logical / physical, 2) if physical else 1.0,
    }
