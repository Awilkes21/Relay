from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services.pitch_compare_service import (
    compare_pitcher_periods,
    resolve_pitcher_id_from_cache,
)


router = APIRouter()


@router.get("/compare/pitcher")
def compare_pitcher(
    pitcher_id: int | None = Query(default=None, ge=1),
    pitcher_name: str | None = Query(default=None, min_length=1),
    a_start: date = Query(),
    a_end: date = Query(),
    b_start: date = Query(),
    b_end: date = Query(),
) -> dict[str, Any]:
    if a_start > a_end:
        raise HTTPException(
            status_code=422,
            detail="a_start must be before or equal to a_end",
        )
    if b_start > b_end:
        raise HTTPException(
            status_code=422,
            detail="b_start must be before or equal to b_end",
        )
    if pitcher_id is None and pitcher_name is None:
        raise HTTPException(
            status_code=422,
            detail="pitcher_id or pitcher_name is required",
        )

    try:
        if pitcher_id is None:
            pitcher_id = resolve_pitcher_id_from_cache(pitcher_name or "")

        return compare_pitcher_periods(pitcher_id, a_start, a_end, b_start, b_end)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
