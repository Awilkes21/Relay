from __future__ import annotations

from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from app.services.pitch_query_service import (
    DEFAULT_STATCAST_PARQUET,
    LEGACY_STATCAST_PARQUET,
    _duckdb_string_literal,
    _rows_to_dicts,
)


STRIKE_DESCRIPTIONS = {
    "called_strike",
    "foul",
    "foul_bunt",
    "foul_tip",
    "missed_bunt",
    "swinging_strike",
    "swinging_strike_blocked",
}
WHIFF_DESCRIPTIONS = {
    "swinging_strike",
    "swinging_strike_blocked",
}
ZONE_LEFT = -0.83
ZONE_RIGHT = 0.83
ZONE_BOTTOM = 1.5
ZONE_TOP = 3.5


def _rate(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return numerator / denominator


def _delta(a_value: float | int | None, b_value: float | int | None) -> float | int | None:
    if a_value is None or b_value is None:
        return None
    return b_value - a_value


def _is_in_zone(pitch: dict[str, Any]) -> bool:
    plate_x = pitch.get("plate_x")
    plate_z = pitch.get("plate_z")
    if plate_x is None or plate_z is None:
        return False

    return ZONE_LEFT <= plate_x <= ZONE_RIGHT and ZONE_BOTTOM <= plate_z <= ZONE_TOP


def _summarize_period(pitches: list[dict[str, Any]]) -> dict[str, Any]:
    pitch_count = len(pitches)
    pitch_type_counts: dict[str, int] = defaultdict(int)
    velocity_by_pitch_type: dict[str, list[float]] = defaultdict(list)

    strike_count = 0
    whiff_count = 0
    located_pitch_count = 0
    zone_pitch_count = 0

    for pitch in pitches:
        pitch_type = pitch.get("pitch_type") or "Unknown"
        pitch_type_counts[pitch_type] += 1

        release_speed = pitch.get("release_speed")
        if release_speed is not None:
            velocity_by_pitch_type[pitch_type].append(release_speed)

        # Statcast descriptions are pitch outcomes. For this first pass, strike
        # rate is the share of pitches whose description is a called strike,
        # swinging strike, foul, bunt foul, or foul tip.
        description = pitch.get("description")
        if description in STRIKE_DESCRIPTIONS:
            strike_count += 1
        if description in WHIFF_DESCRIPTIONS:
            whiff_count += 1

        # Zone rate only uses pitches with both coordinates present. The zone
        # bounds are a fixed rule-of-thumb strike zone in Statcast plate_x/z feet.
        if pitch.get("plate_x") is not None and pitch.get("plate_z") is not None:
            located_pitch_count += 1
            if _is_in_zone(pitch):
                zone_pitch_count += 1

    pitch_usage = {
        pitch_type: {
            "count": count,
            "rate": _rate(count, pitch_count),
        }
        for pitch_type, count in sorted(pitch_type_counts.items())
    }
    average_velocity = {
        pitch_type: sum(velocities) / len(velocities)
        for pitch_type, velocities in sorted(velocity_by_pitch_type.items())
        if velocities
    }

    return {
        "pitch_count": pitch_count,
        "pitch_usage": pitch_usage,
        "average_velocity": average_velocity,
        "strike_rate": _rate(strike_count, pitch_count),
        "whiff_rate": _rate(whiff_count, pitch_count),
        "zone_rate": _rate(zone_pitch_count, located_pitch_count),
    }


def _period_delta(
    period_a: dict[str, Any],
    period_b: dict[str, Any],
) -> dict[str, Any]:
    pitch_types = sorted(
        set(period_a["pitch_usage"].keys()) | set(period_b["pitch_usage"].keys())
    )
    velocity_types = sorted(
        set(period_a["average_velocity"].keys())
        | set(period_b["average_velocity"].keys())
    )

    return {
        "pitch_count": period_b["pitch_count"] - period_a["pitch_count"],
        "pitch_usage": {
            pitch_type: {
                "count": _delta(
                    period_a["pitch_usage"].get(pitch_type, {}).get("count", 0),
                    period_b["pitch_usage"].get(pitch_type, {}).get("count", 0),
                ),
                "rate": _delta(
                    period_a["pitch_usage"].get(pitch_type, {}).get("rate", 0),
                    period_b["pitch_usage"].get(pitch_type, {}).get("rate", 0),
                ),
            }
            for pitch_type in pitch_types
        },
        "average_velocity": {
            pitch_type: _delta(
                period_a["average_velocity"].get(pitch_type),
                period_b["average_velocity"].get(pitch_type),
            )
            for pitch_type in velocity_types
        },
        "strike_rate": _delta(period_a["strike_rate"], period_b["strike_rate"]),
        "whiff_rate": _delta(period_a["whiff_rate"], period_b["whiff_rate"]),
        "zone_rate": _delta(period_a["zone_rate"], period_b["zone_rate"]),
    }


def _fetch_period_pitches(
    pitcher_id: int,
    start_date: date,
    end_date: date,
    parquet_path: Path,
) -> list[dict[str, Any]]:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    with duckdb.connect() as connection:
        cursor = connection.execute(
            "SELECT pitch_type, release_speed, description, plate_x, plate_z "
            f"FROM read_parquet({_duckdb_string_literal(str(parquet_path))}) "
            "WHERE pitcher = ? AND game_date BETWEEN ? AND ?",
            [pitcher_id, start_date.isoformat(), end_date.isoformat()],
        )
        columns = [description[0] for description in cursor.description]
        return _rows_to_dicts(columns, cursor.fetchall())


def resolve_pitcher_id_from_cache(
    pitcher_name: str,
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    parquet_path = Path(parquet_path)
    if parquet_path == DEFAULT_STATCAST_PARQUET and not parquet_path.exists():
        parquet_path = LEGACY_STATCAST_PARQUET

    if not parquet_path.exists():
        raise FileNotFoundError(f"Statcast parquet file not found: {parquet_path}")

    with duckdb.connect() as connection:
        cursor = connection.execute(
            "SELECT DISTINCT pitcher, player_name "
            f"FROM read_parquet({_duckdb_string_literal(str(parquet_path))}) "
            "WHERE LOWER(player_name) LIKE ? "
            "ORDER BY player_name",
            [f"%{pitcher_name.lower()}%"],
        )
        matches = cursor.fetchall()

    pitcher_ids = sorted({int(match[0]) for match in matches})
    if not pitcher_ids:
        raise RuntimeError(f"no cached pitcher found for name: {pitcher_name}")
    if len(pitcher_ids) > 1:
        names = ", ".join(f"{name} ({pitcher_id})" for pitcher_id, name in matches)
        raise RuntimeError(f"pitcher name matched multiple cached pitchers: {names}")

    return pitcher_ids[0]


def compare_pitcher_periods(
    pitcher_id: int,
    a_start: date,
    a_end: date,
    b_start: date,
    b_end: date,
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> dict[str, Any]:
    parquet_path = Path(parquet_path)
    if parquet_path == DEFAULT_STATCAST_PARQUET and not parquet_path.exists():
        parquet_path = LEGACY_STATCAST_PARQUET

    if not parquet_path.exists():
        raise FileNotFoundError(f"Statcast parquet file not found: {parquet_path}")

    period_a = _summarize_period(
        _fetch_period_pitches(pitcher_id, a_start, a_end, parquet_path)
    )
    period_b = _summarize_period(
        _fetch_period_pitches(pitcher_id, b_start, b_end, parquet_path)
    )

    return {
        "pitcher_id": pitcher_id,
        "period_a": {
            "start": a_start.isoformat(),
            "end": a_end.isoformat(),
            "metrics": period_a,
        },
        "period_b": {
            "start": b_start.isoformat(),
            "end": b_end.isoformat(),
            "metrics": period_b,
        },
        "deltas": _period_delta(period_a, period_b),
    }
