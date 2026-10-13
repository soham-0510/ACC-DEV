"""Upload Service: upload (new file or new version), list, download, delete."""
import time
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.blobs import read_verified, release, store_bytes
from app.core.config import get_settings
from app.core.db import File, FileVersion, User, get_db
from app.core.metrics import DOWNLOADS, UPLOAD_LATENCY, UPLOADS
from app.core.security import get_current_user

router = APIRouter(prefix="/api/files", tags=["upload"])


def file_out(f: File) -> dict:
    latest = f.versions[-1] if f.versions else None
    return {"id": f.id, "name": f.name, "versions": len(f.versions),
            "size": latest.size if latest else 0,
            "sha256": latest.blob_sha256 if latest else None,
            "updated_at": latest.created_at if latest else f.created_at}


def own_file(db: Session, file_id: int, user: User) -> File:
    f = db.get(File, file_id)
    if not f or (f.owner_id != user.id and user.role != "admin"):
        raise HTTPException(404, "File not found")
    return f


@router.post("", status_code=201)
async def upload(file: UploadFile, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start = time.perf_counter()
    data = await file.read()
    if len(data) > get_settings().max_upload_mb * 1024 * 1024:
        raise HTTPException(413, "File too large")
    name = (file.filename or "unnamed").strip()[:255]

    blob, deduplicated = store_bytes(db, data)
    f = db.scalar(select(File).where(File.owner_id == user.id, File.name == name))
    if f is None:
        f = File(owner_id=user.id, name=name)
        db.add(f)
        db.flush()
    elif f.versions and f.versions[-1].blob_sha256 == blob.sha256:
        db.rollback()  # identical to current version: nothing to do
        return {**file_out(f), "deduplicated": True, "unchanged": True}

    v = FileVersion(file_id=f.id, version_no=len(f.versions) + 1, blob_sha256=blob.sha256, size=len(data))
    db.add(v)
    db.commit()
    db.refresh(f)
    UPLOADS.labels(deduplicated=str(deduplicated).lower()).inc()
    UPLOAD_LATENCY.observe(time.perf_counter() - start)
    return {**file_out(f), "deduplicated": deduplicated, "unchanged": False}


@router.get("")
def list_files(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [file_out(f) for f in db.scalars(select(File).where(File.owner_id == user.id).order_by(File.name))]


@router.get("/{file_id}/download")
def download(file_id: int, version: int | None = None,
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = own_file(db, file_id, user)
    v = next((x for x in f.versions if x.version_no == version), None) if version else f.versions[-1]
    if not v:
        raise HTTPException(404, "Version not found")
    data = read_verified(v.blob_sha256)
    DOWNLOADS.inc()
    return Response(data, media_type="application/octet-stream", headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f.name)}",
        "X-Content-SHA256": v.blob_sha256})


@router.delete("/{file_id}", status_code=204)
def delete(file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = own_file(db, file_id, user)
    for v in f.versions:
        release(db, v.blob_sha256)
    db.delete(f)
    db.commit()
