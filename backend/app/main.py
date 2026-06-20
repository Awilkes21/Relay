import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.compare import router as compare_router
from app.api.nl_query import router as nl_query_router
from app.api.pitches import router as pitches_router
from app.api.schemas import HealthResponse

LOGGER = logging.getLogger("relay.api")
app = FastAPI(title="Relay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "RELAY_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time-ms"] = f"{elapsed_ms:.1f}"
    if request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.url.path in {"/robots.txt", "/favicon.ico", "/favicon.svg", "/relay-preview.svg"}:
        response.headers["Cache-Control"] = "public, max-age=86400"
    if request.url.path.startswith(("/pitches", "/compare", "/pitchers", "/cache", "/query")):
        LOGGER.info(
            "%s %s %s %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    return response

app.include_router(pitches_router)
app.include_router(compare_router)
app.include_router(nl_query_router)

FRONTEND_DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"

if FRONTEND_ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS_DIR), name="assets")


@app.get("/robots.txt", include_in_schema=False)
def robots_txt() -> FileResponse:
    robots_path = FRONTEND_DIST_DIR / "robots.txt"
    if robots_path.exists():
        return FileResponse(robots_path, media_type="text/plain")
    return FileResponse(Path(__file__).resolve().parents[2] / "frontend" / "public" / "robots.txt", media_type="text/plain")


@app.get("/favicon.svg", include_in_schema=False)
def favicon_svg() -> FileResponse:
    favicon_path = FRONTEND_DIST_DIR / "favicon.svg"
    if favicon_path.exists():
        return FileResponse(favicon_path, media_type="image/svg+xml")
    return FileResponse(Path(__file__).resolve().parents[2] / "frontend" / "public" / "favicon.svg", media_type="image/svg+xml")


@app.get("/relay-preview.svg", include_in_schema=False)
def relay_preview_svg() -> FileResponse:
    preview_path = FRONTEND_DIST_DIR / "relay-preview.svg"
    if preview_path.exists():
        return FileResponse(preview_path, media_type="image/svg+xml")
    return FileResponse(Path(__file__).resolve().parents[2] / "frontend" / "public" / "relay-preview.svg", media_type="image/svg+xml")


@app.get("/health", response_model=HealthResponse)
def health() -> dict[str, str]:
    return {"status": "ok"}


if FRONTEND_INDEX.exists():

    @app.get("/{path:path}", include_in_schema=False)
    def serve_frontend(path: str) -> FileResponse:
        return FileResponse(FRONTEND_INDEX)
