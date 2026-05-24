from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.errors import raise_service_error
from app.services.pitch_query_service import (
    get_cache_metadata,
    get_pitch_data_quality,
    get_pitch_heatmap,
    list_cached_pitchers,
    list_pitch_filter_options,
    search_pitches,
)


router = APIRouter()

LocationFilter = str
ResultOrder = str
HeatmapMode = str

LOCATION_FILTER_PATTERN = "^(zone|out_of_zone|chase)$"
RESULT_ORDER_PATTERN = "^(latest|oldest|random)$"
HEATMAP_MODE_PATTERN = "^(all|whiffs|hard_contact|in_zone)$"

PITCH_FIELDS = [
    "game_date",
    "player_name",
    "pitcher",
    "batter",
    "batter_name",
    "p_throws",
    "stand",
    "pitch_type",
    "release_speed",
    "release_spin_rate",
    "release_pos_x",
    "release_pos_z",
    "arm_angle",
    "pfx_x",
    "pfx_z",
    "plate_x",
    "plate_z",
    "launch_speed",
    "launch_angle",
    "bb_type",
    "hit_distance_sc",
    "estimated_ba_using_speedangle",
    "estimated_woba_using_speedangle",
    "woba_value",
    "balls",
    "strikes",
    "description",
    "events",
    "on_1b",
    "on_2b",
    "on_3b",
]

MOVEMENT_METADATA = {
    "raw_pitch_fields": {
        "pfx_x": "horizontal movement in feet from Statcast",
        "pfx_z": "vertical movement in feet from Statcast",
    },
    "display": "Relay displays pfx_x and pfx_z as inches by multiplying by 12.",
}


def _compact_pitch(row: dict[str, Any]) -> dict[str, Any]:
    return {field: row.get(field) for field in PITCH_FIELDS}


class PitchFilterParams:
    def __init__(
        self,
        pitcher_id: int | None = Query(default=None, ge=1),
        pitcher_name: str | None = Query(default=None, min_length=1),
        season: int | None = Query(default=None, ge=1876),
        start_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
        end_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
        pitch_type: str | None = Query(default=None, min_length=1),
        pitch_type_group: str | None = Query(
            default=None,
            pattern="^(fastball|breaking|offspeed)$",
        ),
        balls: int | None = Query(default=None, ge=0, le=3),
        strikes: int | None = Query(default=None, ge=0, le=2),
        min_velocity: float | None = Query(default=None, ge=0),
        max_velocity: float | None = Query(default=None, ge=0),
        batter_hand: str | None = Query(default=None, pattern="^[LR]$"),
        description: str | None = Query(default=None, min_length=1),
        events: str | None = Query(default=None, min_length=1),
        base_state: str | None = Query(default=None, pattern="^(runners_on|bases_empty)$"),
        count_group: str | None = Query(
            default=None,
            pattern="^(ahead|behind|even|two_strikes|full_count)$",
        ),
        location_filter: LocationFilter | None = Query(
            default=None,
            pattern=LOCATION_FILTER_PATTERN,
        ),
    ) -> None:
        self.pitcher_id = pitcher_id
        self.pitcher_name = pitcher_name
        self.season = season
        self.start_date = start_date
        self.end_date = end_date
        self.pitch_type = pitch_type
        self.pitch_type_group = pitch_type_group
        self.balls = balls
        self.strikes = strikes
        self.min_velocity = min_velocity
        self.max_velocity = max_velocity
        self.batter_hand = batter_hand
        self.description = description
        self.events = events
        self.base_state = base_state
        self.count_group = count_group
        self.location_filter = location_filter

        if min_velocity is not None and max_velocity is not None and min_velocity > max_velocity:
            raise HTTPException(
                status_code=422,
                detail="min_velocity must be less than or equal to max_velocity",
            )

    def to_filters(self) -> dict[str, Any]:
        return {
            "pitcher_id": self.pitcher_id,
            "pitcher_name": self.pitcher_name,
            "season": self.season,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "pitch_type": self.pitch_type,
            "pitch_type_group": self.pitch_type_group,
            "balls": self.balls,
            "strikes": self.strikes,
            "min_velocity": self.min_velocity,
            "max_velocity": self.max_velocity,
            "batter_hand": self.batter_hand,
            "description": self.description,
            "events": self.events,
            "base_state": self.base_state,
            "count_group": self.count_group,
            "location_filter": self.location_filter,
        }


@router.get("/pitchers")
def get_pitchers() -> dict[str, Any]:
    try:
        pitchers = list_cached_pitchers()
    except Exception as exc:
        raise_service_error(exc)

    return {"count": len(pitchers), "results": pitchers}


@router.get("/cache/metadata")
def get_cache_metadata_endpoint() -> dict[str, Any]:
    try:
        return get_cache_metadata()
    except Exception as exc:
        raise_service_error(exc)


@router.get("/pitch-options")
def get_pitch_options(filters: PitchFilterParams = Depends()) -> dict[str, Any]:
    option_filters = filters.to_filters()
    option_filters["min_velocity"] = None
    option_filters["max_velocity"] = None

    try:
        return list_pitch_filter_options(option_filters)
    except Exception as exc:
        raise_service_error(exc)


@router.get("/pitches")
def get_pitches(
    filters: PitchFilterParams = Depends(),
    result_order: ResultOrder = Query(default="latest", pattern=RESULT_ORDER_PATTERN),
    limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    pitch_filters = filters.to_filters()
    pitch_filters["result_order"] = result_order
    pitch_filters["limit"] = limit

    try:
        search_response = search_pitches(pitch_filters)
        results = [_compact_pitch(row) for row in search_response["results"]]
    except Exception as exc:
        raise_service_error(exc)

    return {
        "count": len(results),
        "total_count": search_response["total_count"],
        "movement": MOVEMENT_METADATA,
        "results": results,
    }


@router.get("/pitches/data-quality")
def get_pitches_data_quality(filters: PitchFilterParams = Depends()) -> dict[str, Any]:
    try:
        return get_pitch_data_quality(filters.to_filters())
    except Exception as exc:
        raise_service_error(exc)


@router.get("/pitches/heatmap")
def get_pitches_heatmap(
    filters: PitchFilterParams = Depends(),
    x_bins: int = Query(default=25, ge=10, le=60),
    z_bins: int = Query(default=25, ge=10, le=60),
    mode: HeatmapMode = Query(default="all", pattern=HEATMAP_MODE_PATTERN),
) -> dict[str, Any]:
    try:
        return get_pitch_heatmap(filters.to_filters(), x_bins=x_bins, z_bins=z_bins, mode=mode)
    except Exception as exc:
        raise_service_error(exc)
