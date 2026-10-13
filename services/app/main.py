"""Entry point. One codebase, one image, many services (modular monolith).
SERVICE=all        -> everything in one process (laptop dev)
SERVICE=upload     -> only the upload module (one K8s Deployment per module)"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth.router import router as auth
from app.core.config import get_settings
from app.core.db import init_db
from app.monitoring.router import router as monitoring
from app.recovery.router import router as recovery
from app.upload.router import router as upload
from app.versioning.router import router as versioning

MODULES = {"auth": [auth], "upload": [upload], "versioning": [versioning],
           "recovery": [recovery], "monitoring": []}

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Resilient Storage Portal",
              description="Disaster-Resilient Cloud Storage & Recovery Portal",
              version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["X-Content-SHA256"])

app.include_router(monitoring)  # every service exposes health + metrics
if settings.service == "all":
    for routers in MODULES.values():
        for r in routers:
            app.include_router(r)
elif settings.service in MODULES:
    for r in MODULES[settings.service]:
        app.include_router(r)
else:
    raise RuntimeError(f"Unknown SERVICE={settings.service!r}; use one of: all, {', '.join(MODULES)}")

# Laptop mode: serve the built React portal from the same origin (no Node.js needed).
# In Kubernetes the portal runs in its own nginx container instead.
_dist = Path(os.getenv("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if settings.service == "all" and (_dist / "index.html").exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="portal")
