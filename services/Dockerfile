# Multi-stage build: small image, no compilers in production, runs as non-root.
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    LOCAL_STORAGE_PATH=/data/blobs SNAPSHOT_PATH=/data/snapshots
RUN useradd --uid 10001 --create-home app && mkdir -p /data && chown app:app /data
COPY --from=builder /install /usr/local
WORKDIR /srv
COPY --chown=app:app app ./app
USER app
EXPOSE 8000
# /data is where the Docker volume / Kubernetes PVC gets mounted
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=3s CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health/live')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
