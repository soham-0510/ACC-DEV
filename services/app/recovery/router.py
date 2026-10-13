"""Recovery Service (admin): integrity scan, snapshots, verified restore, disaster simulation.

App-level recovery implements the Slide 4 flow:
  failure -> pick snapshot -> verify SHA-256 of each copy -> restore only valid blobs -> resume.
In Kubernetes this is complemented by CSI VolumeSnapshots + Velero at the volume/cluster level."""
import json
import os
import random
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import Blob, User, get_db
from app.core.metrics import INTEGRITY_FAILURES, RESTORES
from app.core.security import decrypt, require_admin, sha256_hex
from app.core.storage import get_storage

router = APIRouter(prefix="/api/recovery", tags=["recovery"])
settings = get_settings()


def check_blob(sha: str) -> str:
    """'ok' | 'missing' | 'corrupt'"""
    storage = get_storage()
    if not storage.exists(sha):
        return "missing"
    try:
        return "ok" if sha256_hex(decrypt(storage.get(sha))) == sha else "corrupt"
    except Exception:
        return "corrupt"


@router.get("/integrity")
def integrity_scan(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    results = {"ok": [], "missing": [], "corrupt": []}
    for blob in db.scalars(select(Blob)):
        results[check_blob(blob.sha256)].append(blob.sha256)
    bad = len(results["missing"]) + len(results["corrupt"])
    if bad:
        INTEGRITY_FAILURES.inc(bad)
    return {"total": sum(map(len, results.values())), "healthy": bad == 0,
            "ok": len(results["ok"]), "missing": results["missing"], "corrupt": results["corrupt"],
            "blobs": [{"sha256": s, "status": st} for st in ("corrupt", "missing", "ok") for s in results[st]]}


@router.post("/snapshots", status_code=201)
def create_snapshot(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    snap_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    root = settings.snapshot_path / snap_id
    (root / "blobs").mkdir(parents=True)
    storage, copied = get_storage(), []
    for blob in db.scalars(select(Blob)):
        if storage.exists(blob.sha256):
            (root / "blobs" / blob.sha256).write_bytes(storage.get(blob.sha256))
            copied.append(blob.sha256)
    if settings.database_url.startswith("sqlite"):
        shutil.copy2(settings.database_url.split("///")[-1], root / "storage.db")
    manifest = {"id": snap_id, "created_at": snap_id, "blobs": copied,
                "bytes": sum((root / "blobs" / s).stat().st_size for s in copied)}
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return {k: v for k, v in manifest.items() if k != "blobs"} | {"blob_count": len(copied)}


@router.get("/snapshots")
def list_snapshots(_: User = Depends(require_admin)):
    if not settings.snapshot_path.exists():
        return []
    out = []
    for m in sorted(settings.snapshot_path.glob("*/manifest.json"), reverse=True):
        d = json.loads(m.read_text())
        out.append({"id": d["id"], "blob_count": len(d["blobs"]), "bytes": d["bytes"]})
    return out


@router.post("/snapshots/{snap_id}/restore")
def restore_from_snapshot(snap_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    root = settings.snapshot_path / snap_id
    if not snap_id.replace("T", "").replace("Z", "").isdigit() or not root.is_dir():
        raise HTTPException(404, "Snapshot not found")
    storage = get_storage()
    report = {"restored": [], "skipped_invalid_copy": [], "not_in_snapshot": [], "already_ok": 0}
    for blob in db.scalars(select(Blob)):
        if check_blob(blob.sha256) == "ok":
            report["already_ok"] += 1
            continue
        copy = root / "blobs" / blob.sha256
        if not copy.exists():
            report["not_in_snapshot"].append(blob.sha256)
            continue
        data = copy.read_bytes()
        try:
            valid = sha256_hex(decrypt(data)) == blob.sha256  # verify BEFORE restoring
        except Exception:
            valid = False
        if valid:
            storage.put(blob.sha256, data)
            report["restored"].append(blob.sha256)
        else:
            report["skipped_invalid_copy"].append(blob.sha256)
    RESTORES.labels(kind="snapshot").inc()
    report["fully_recovered"] = not report["skipped_invalid_copy"] and not report["not_in_snapshot"]
    return report


@router.post("/simulate-disaster")
def simulate_disaster(count: int = 1, mode: str = "delete",
                      _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Chaos testing for demos: delete or corrupt random blobs. Disable with ALLOW_CHAOS=false."""
    if os.getenv("ALLOW_CHAOS", "true").lower() != "true":
        raise HTTPException(403, "Chaos endpoint disabled")
    if mode not in {"delete", "corrupt"}:
        raise HTTPException(400, "mode must be delete|corrupt")
    storage = get_storage()
    keys = [b.sha256 for b in db.scalars(select(Blob)) if storage.exists(b.sha256)]
    victims = random.sample(keys, min(count, len(keys)))
    for k in victims:
        storage.delete(k) if mode == "delete" else storage.put(k, b"garbage-" + os.urandom(32))
    return {"mode": mode, "affected": victims}
