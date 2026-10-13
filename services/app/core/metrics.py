"""Prometheus metrics shared by all modules. Scraped from /metrics."""
from prometheus_client import Counter, Histogram

UPLOADS = Counter("rs_uploads_total", "Files uploaded", ["deduplicated"])
DEDUP_BYTES_SAVED = Counter("rs_dedup_bytes_saved_total", "Bytes not stored thanks to dedup")
DOWNLOADS = Counter("rs_downloads_total", "Files downloaded")
INTEGRITY_FAILURES = Counter("rs_integrity_failures_total", "SHA-256 mismatches detected")
RESTORES = Counter("rs_restores_total", "Restore operations", ["kind"])
LOGINS = Counter("rs_logins_total", "Login attempts", ["result"])
UPLOAD_LATENCY = Histogram("rs_upload_seconds", "Upload processing time")
