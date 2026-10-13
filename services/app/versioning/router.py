"""Versioning Service: version history and point-in-time restore of a single file.
Restoring never rewrites history: it adds a NEW version pointing to the old blob
(zero bytes copied, thanks to content addressing)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.blobs import read_verified
from app.core.db import Blob, FileVersion, User, get_db
from app.core.metrics import RESTORES
from app.core.security import get_current_user
from app.upload.router import file_out, own_file

router = APIRouter(prefix="/api/files", tags=["versioning"])


@router.get("/{file_id}/versions")
def versions(file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = own_file(db, file_id, user)
    latest = f.versions[-1].version_no
    return [{"version": v.version_no, "size": v.size, "sha256": v.blob_sha256,
             "note": v.note, "created_at": v.created_at, "current": v.version_no == latest}
            for v in reversed(f.versions)]


@router.post("/{file_id}/versions/{version_no}/restore")
def restore_version(file_id: int, version_no: int,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = own_file(db, file_id, user)
    old = next((v for v in f.versions if v.version_no == version_no), None)
    if not old:
        raise HTTPException(404, "Version not found")
    read_verified(old.blob_sha256)  # refuse to restore a corrupted version
    db.get(Blob, old.blob_sha256).ref_count += 1
    db.add(FileVersion(file_id=f.id, version_no=f.versions[-1].version_no + 1,
                       blob_sha256=old.blob_sha256, size=old.size,
                       note=f"Restored from v{version_no}"))
    db.commit()
    db.refresh(f)
    RESTORES.labels(kind="version").inc()
    return file_out(f)
