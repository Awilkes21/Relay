from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.api.errors import raise_service_error
from app.services.pitch_compare_service import (
    compare_pitcher_periods,
    resolve_pitcher_id_from_cache,
)
from app.services.pitch_query_service import get_pitch_heatmap


router = APIRouter()

MOVEMENT_METADATA = {
    "average_induced_vertical_break": "average pfx_z by pitch type, converted to inches",
    "average_horizontal_break": "average pfx_x by pitch type, converted to inches",
}
HEATMAP_MODE_PATTERN = "^(all|whiffs|hard_contact|in_zone)$"


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
    heatmap_mode: str = Query(default="all", pattern=HEATMAP_MODE_PATTERN),
    include_heatmaps: bool = Query(default=True),
    x_bins: int = Query(default=25, ge=10, le=60),
    z_bins: int = Query(default=25, ge=10, le=60),
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
        if include_heatmaps:
            base_filters: dict[str, Any] = {
                "pitcher_id": pitcher_id,
                "pitch_type": pitch_type,
                "batter_hand": batter_hand,
            }
            comparison["chart_data"] = {
                "heatmap_mode": heatmap_mode,
                "heatmaps": {
                    "period_a": get_pitch_heatmap(
                        {
                            **base_filters,
                            "start_date": a_start.isoformat(),
                            "end_date": a_end.isoformat(),
                        },
                        x_bins=x_bins,
                        z_bins=z_bins,
                        mode=heatmap_mode,
                    ),
                    "period_b": get_pitch_heatmap(
                        {
                            **base_filters,
                            "start_date": b_start.isoformat(),
                            "end_date": b_end.isoformat(),
                        },
                        x_bins=x_bins,
                        z_bins=z_bins,
                        mode=heatmap_mode,
                    ),
                },
            }
        return comparison
    except Exception as exc:
        raise_service_error(exc)
