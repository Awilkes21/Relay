from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.api.errors import raise_service_error
from app.services.pitch_compare_service import (
    compare_pitcher_periods,
    resolve_pitcher_id_from_cache,
)


router = APIRouter()

MOVEMENT_METADATA = {
    "average_induced_vertical_break": "average pfx_z by pitch type, converted to inches",
    "average_horizontal_break": "average pfx_x by pitch type, converted to inches",
}


@router.get("/compare/pitcher")
def compare_pitcher(
    pitcher_id: int | None = Query(default=None, ge=1),
    pitcher_name: str | None = Query(default=None, min_length=1),
    a_start: date = Query(),
    a_end: date = Query(),
    b_start: date = Query(),
    b_end: date = Query(),
    pitch_type: str | None = Query(default=None, min_length=1),
    batter_hand: str | None = Query(default=None, pattern="^[LR]$"),
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

        comparison = compare_pitcher_periods(
            pitcher_id,
            a_start,
            a_end,
            b_start,
            b_end,
            pitch_type=pitch_type,
            batter_hand=batter_hand,
        )
        comparison["movement"] = MOVEMENT_METADATA
        return comparison
    except Exception as exc:
        raise_service_error(exc)
