from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services.pitch_query_service import search_pitches


router = APIRouter()

PITCH_FIELDS = [
    "game_date",
    "player_name",
    "pitcher",
    "batter",
    "pitch_type",
    "release_speed",
    "release_spin_rate",
    "pfx_x",
    "pfx_z",
    "plate_x",
    "plate_z",
    "balls",
    "strikes",
    "description",
    "events",
]


def _compact_pitch(row: dict[str, Any]) -> dict[str, Any]:
    return {field: row.get(field) for field in PITCH_FIELDS}


@router.get("/pitches")
def get_pitches(
    pitcher_id: int | None = Query(default=None, ge=1),
    pitcher_name: str | None = Query(default=None, min_length=1),
    season: int | None = Query(default=None, ge=1876),
    pitch_type: str | None = Query(default=None, min_length=1),
    balls: int | None = Query(default=None, ge=0, le=3),
    strikes: int | None = Query(default=None, ge=0, le=2),
    min_velocity: float | None = Query(default=None, ge=0),
    max_velocity: float | None = Query(default=None, ge=0),
    limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    if (
        min_velocity is not None
        and max_velocity is not None
        and min_velocity > max_velocity
    ):
        raise HTTPException(
            status_code=422,
            detail="min_velocity must be less than or equal to max_velocity",
        )

    filters = {
        "pitcher_id": pitcher_id,
        "pitcher_name": pitcher_name,
        "season": season,
        "pitch_type": pitch_type,
        "balls": balls,
        "strikes": strikes,
        "min_velocity": min_velocity,
        "max_velocity": max_velocity,
        "limit": limit,
    }

    try:
        results = [_compact_pitch(row) for row in search_pitches(filters)]
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"count": len(results), "results": results}
