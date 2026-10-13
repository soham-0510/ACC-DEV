"""Storage abstraction. App code only calls put/get/exists/delete/list_keys.
- LocalStorage: a folder. On laptop = ./data/blobs, in K8s = PVC mounted at /data.
- S3Storage:   MinIO locally, AWS S3 in the cloud. Same API.
Switching is one env var: STORAGE_BACKEND=local|s3"""
from pathlib import Path
from typing import Protocol

from .config import get_settings


class Storage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...
    def list_keys(self) -> list[str]: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # shard by first 2 hex chars, like git: blobs/ab/ab3f...
        return self.root / key[:2] / key

    def put(self, key: str, data: bytes) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(p)  # atomic rename: a crash never leaves a half-written blob

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def list_keys(self) -> list[str]:
        return [p.name for p in self.root.glob("*/*") if p.is_file() and p.suffix != ".tmp"]


class S3Storage:
    def __init__(self, endpoint, bucket, access_key, secret_key):
        import boto3
        self.bucket = bucket
        self.s3 = boto3.client("s3", endpoint_url=endpoint,
                               aws_access_key_id=access_key, aws_secret_access_key=secret_key)
        try:
            self.s3.head_bucket(Bucket=bucket)
        except Exception:
            self.s3.create_bucket(Bucket=bucket)

    def put(self, key, data):
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data)

    def get(self, key):
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def exists(self, key):
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def delete(self, key):
        self.s3.delete_object(Bucket=self.bucket, Key=key)

    def list_keys(self):
        keys, token = [], None
        while True:
            kw = {"Bucket": self.bucket, **({"ContinuationToken": token} if token else {})}
            resp = self.s3.list_objects_v2(**kw)
            keys += [o["Key"] for o in resp.get("Contents", [])]
            if not resp.get("IsTruncated"):
                return keys
            token = resp["NextContinuationToken"]


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        s = get_settings()
        _storage = (S3Storage(s.s3_endpoint, s.s3_bucket, s.s3_access_key, s.s3_secret_key)
                    if s.storage_backend == "s3" else LocalStorage(s.local_storage_path))
    return _storage
