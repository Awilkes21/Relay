import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.compare import router as compare_router
from app.api.nl_query import router as nl_query_router
from app.api.pitches import router as pitches_router

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

app.include_router(pitches_router)
app.include_router(compare_router)
app.include_router(nl_query_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
