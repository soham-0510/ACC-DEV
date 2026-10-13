"""Content-addressed blob store = deduplication + integrity in one design.
plaintext -> SHA-256 -> if hash known: ref_count++ (dedup) else encrypt+store."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .db import Blob
from .metrics import DEDUP_BYTES_SAVED, INTEGRITY_FAILURES
from .security import decrypt, encrypt, sha256_hex
from .storage import get_storage


def store_bytes(db: Session, data: bytes) -> tuple[Blob, bool]:
    """Returns (blob, deduplicated). Caller commits."""
    digest = sha256_hex(data)
    blob = db.get(Blob, digest)
    storage = get_storage()
    if blob and storage.exists(digest):
        blob.ref_count += 1
        DEDUP_BYTES_SAVED.inc(blob.stored_size)
        return blob, True
    ciphertext = encrypt(data)
    storage.put(digest, ciphertext)
    if blob:  # metadata existed but object was lost -> self-repair
        blob.ref_count += 1
        blob.stored_size = len(ciphertext)
        return blob, False
    blob = Blob(sha256=digest, size=len(data), stored_size=len(ciphertext), ref_count=1)
    db.add(blob)
    return blob, False


def read_verified(sha256: str) -> bytes:
    """Fetch, decrypt and re-hash. Never serve data that fails the checksum."""
    try:
        data = decrypt(get_storage().get(sha256))
    except FileNotFoundError:
        INTEGRITY_FAILURES.inc()
        raise HTTPException(503, "Blob missing from storage - restore from snapshot required")
    except Exception:
        INTEGRITY_FAILURES.inc()
        raise HTTPException(503, "Blob corrupted (decryption failed) - restore required")
    if sha256_hex(data) != sha256:
        INTEGRITY_FAILURES.inc()
        raise HTTPException(503, "SHA-256 mismatch - restore required")
    return data


def release(db: Session, sha256: str) -> None:
    blob = db.get(Blob, sha256)
    if not blob:
        return
    blob.ref_count -= 1
    if blob.ref_count <= 0:
        get_storage().delete(sha256)
        db.delete(blob)
