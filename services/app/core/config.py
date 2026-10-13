"""Central config. Everything comes from env vars (12-factor), so the same
code runs on a laptop, in Docker Compose and in Kubernetes."""
import os
from functools import lru_cache
from pathlib import Path


class Settings:
    # Which module this process serves: all | auth | upload | versioning | recovery | monitoring
    service: str = os.getenv("SERVICE", "all")

    # Local default = SQLite. In Docker/K8s: postgresql+psycopg://user:pass@postgres:5432/storage
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/storage.db")

    # Storage backend: local (folder) | s3 (MinIO / AWS S3)
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")
    local_storage_path: Path = Path(os.getenv("LOCAL_STORAGE_PATH", "./data/blobs"))
    snapshot_path: Path = Path(os.getenv("SNAPSHOT_PATH", "./data/snapshots"))
    s3_endpoint: str | None = os.getenv("S3_ENDPOINT")  # http://minio:9000
    s3_bucket: str = os.getenv("S3_BUCKET", "blobs")
    s3_access_key: str | None = os.getenv("S3_ACCESS_KEY")
    s3_secret_key: str | None = os.getenv("S3_SECRET_KEY")

    # Security. Dev defaults only; real values come from K8s Secrets.
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-only-insecure-secret-change-me-in-k8s-secret")
    jwt_expiry_minutes: int = int(os.getenv("JWT_EXPIRY_MINUTES", "60"))
    # Fernet key (base64, 32 bytes). Generate: python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"
    encryption_key: str = os.getenv("ENCRYPTION_KEY", "kq9Zr3cS3m6pU0vY8nQ1xW4tB7eH2jL5aF0dG6iK9oM=")

    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "100"))
    # First user to register with this name becomes admin
    bootstrap_admin: str = os.getenv("BOOTSTRAP_ADMIN", "admin")


@lru_cache
def get_settings() -> Settings:
    return Settings()
