"""End-to-end test of the whole resilience story. Run: pytest -v"""
import os
import sys
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp())
os.environ.update(DATABASE_URL=f"sqlite:///{_tmp}/test.db", LOCAL_STORAGE_PATH=str(_tmp / "blobs"),
                  SNAPSHOT_PATH=str(_tmp / "snaps"), SERVICE="all")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


def token(c, user, pw="password123"):
    c.post("/api/auth/register", json={"username": user, "password": pw})
    r = c.post("/api/auth/login", data={"username": user, "password": pw})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_health(c):
    assert c.get("/health/live").status_code == 200
    assert c.get("/health/ready").json()["status"] == "ready"


def test_auth_and_rbac(c):
    assert c.get("/api/files").status_code == 401
    alice = token(c, "alice")
    assert c.get("/api/auth/me", headers=alice).json()["role"] == "user"
    assert c.get("/api/admin/stats", headers=alice).status_code == 403
    admin = token(c, "admin")
    assert c.get("/api/auth/me", headers=admin).json()["role"] == "admin"
    assert c.post("/api/auth/login", data={"username": "alice", "password": "wrong-pass"}).status_code == 401


def test_upload_dedup_versioning(c):
    alice, bob = token(c, "alice"), token(c, "bob")
    r = c.post("/api/files", headers=alice, files={"file": ("notes.txt", b"hello v1")})
    assert r.status_code == 201 and r.json()["deduplicated"] is False
    fid = r.json()["id"]

    # Bob uploads identical content -> stored once
    r = c.post("/api/files", headers=bob, files={"file": ("copy.txt", b"hello v1")})
    assert r.json()["deduplicated"] is True

    # Alice edits -> v2
    r = c.post("/api/files", headers=alice, files={"file": ("notes.txt", b"hello v2")})
    assert r.json()["versions"] == 2

    # Download verifies checksum and returns latest
    r = c.get(f"/api/files/{fid}/download", headers=alice)
    assert r.content == b"hello v2" and len(r.headers["X-Content-SHA256"]) == 64

    # Restore v1 -> becomes v3 with v1 content
    r = c.post(f"/api/files/{fid}/versions/1/restore", headers=alice)
    assert r.json()["versions"] == 3
    assert c.get(f"/api/files/{fid}/download", headers=alice).content == b"hello v1"

    # Bob can't see Alice's file
    assert c.get(f"/api/files/{fid}/download", headers=bob).status_code == 404

    stats = c.get("/api/admin/stats", headers=token(c, "admin")).json()
    assert stats["dedup_saved_bytes"] > 0


def test_disaster_and_recovery(c):
    admin, alice = token(c, "admin"), token(c, "alice")
    c.post("/api/files", headers=alice, files={"file": ("report.pdf", b"important data" * 100)})
    assert c.get("/api/recovery/integrity", headers=admin).json()["healthy"] is True

    snap = c.post("/api/recovery/snapshots", headers=admin).json()["id"]

    # Disaster: corrupt one blob, delete the rest
    c.post("/api/recovery/simulate-disaster?count=1&mode=corrupt", headers=admin)
    c.post("/api/recovery/simulate-disaster?count=10&mode=delete", headers=admin)
    scan = c.get("/api/recovery/integrity", headers=admin).json()
    assert scan["healthy"] is False

    # Downloads refuse to serve bad data
    fid = c.get("/api/files", headers=alice).json()[0]["id"]
    assert c.get(f"/api/files/{fid}/download", headers=alice).status_code == 503

    # Restore with verification -> fully healthy again
    report = c.post(f"/api/recovery/snapshots/{snap}/restore", headers=admin).json()
    assert report["fully_recovered"] is True and report["restored"]
    assert c.get("/api/recovery/integrity", headers=admin).json()["healthy"] is True
    assert c.get(f"/api/files/{fid}/download", headers=alice).status_code == 200


def test_metrics_exposed(c):
    body = c.get("/metrics").text
    assert "rs_uploads_total" in body and "rs_integrity_failures_total" in body
