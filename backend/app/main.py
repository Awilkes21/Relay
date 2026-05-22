from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.pitches import router as pitches_router

app = FastAPI(title="Relay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(pitches_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
