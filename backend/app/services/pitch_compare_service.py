from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from app.db.statcast import (
    is_known_pitch_type,
    resolve_statcast_parquet,
    statcast_connection,
    table_columns,
)
from app.services.pitch_query_service import (
    DEFAULT_STATCAST_PARQUET,
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


def _average_by_pitch_type(values: dict[str, list[float]]) -> dict[str, float]:
    return {
        pitch_type: sum(group_values) / len(group_values)
        for pitch_type, group_values in sorted(values.items())
        if group_values
    }


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _most_common_hand(values: list[str]) -> str | None:
    if not values:
        return None
    return Counter(values).most_common(1)[0][0]


def _statcast_arm_angle(pitch: dict[str, Any]) -> float | None:
    # Statcast exposes arm_angle directly. Release position is not equivalent
    # to arm angle, so Relay only reports this metric when the real field exists.
    arm_angle = pitch.get("arm_angle")
    if arm_angle is None:
        return None
    return float(arm_angle)


def _summarize_period(pitches: list[dict[str, Any]]) -> dict[str, Any]:
    pitch_count = len(pitches)
    pitch_type_counts: dict[str, int] = defaultdict(int)
    # Spin, velocity, and movement are intentionally bucketed by pitch_type.
    # Comparing a slider's movement to a fastball's movement would be noisy, so
    # Relay only computes these averages and deltas within the same pitch type.
    velocity_by_pitch_type: dict[str, list[float]] = defaultdict(list)
    spin_by_pitch_type: dict[str, list[float]] = defaultdict(list)
    ivb_by_pitch_type: dict[str, list[float]] = defaultdict(list)
    horizontal_break_by_pitch_type: dict[str, list[float]] = defaultdict(list)
    arm_angle_by_pitch_type: dict[str, list[float]] = defaultdict(list)

    strike_count = 0
    whiff_count = 0
    located_pitch_count = 0
    zone_pitch_count = 0
    pitcher_hands: list[str] = []
    arm_angles: list[float] = []

    for pitch in pitches:
        if not is_known_pitch_type(pitch.get("pitch_type")):
            continue

        pitch_type = str(pitch["pitch_type"]).strip()
        pitch_type_counts[pitch_type] += 1

        release_speed = pitch.get("release_speed")
        if release_speed is not None:
            velocity_by_pitch_type[pitch_type].append(release_speed)

        release_spin_rate = pitch.get("release_spin_rate")
        if release_spin_rate is not None:
            spin_by_pitch_type[pitch_type].append(release_spin_rate)

        # Statcast pfx_x/pfx_z are in feet. Relay displays movement in inches
        # so the comparison table uses the same units as the strike-zone detail.
        pfx_z = pitch.get("pfx_z")
        if pfx_z is not None:
            ivb_by_pitch_type[pitch_type].append(pfx_z * 12)

        pfx_x = pitch.get("pfx_x")
        if pfx_x is not None:
            horizontal_break_by_pitch_type[pitch_type].append(pfx_x * 12)

        arm_angle = _statcast_arm_angle(pitch)
        if arm_angle is not None:
            arm_angle_by_pitch_type[pitch_type].append(arm_angle)
            arm_angles.append(arm_angle)

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

        p_throws = pitch.get("p_throws")
        if p_throws in {"L", "R"}:
            pitcher_hands.append(p_throws)

    pitch_count = sum(pitch_type_counts.values())
    pitch_usage = {
        pitch_type: {
            "count": count,
            "rate": _rate(count, pitch_count),
        }
        for pitch_type, count in sorted(pitch_type_counts.items())
    }

    return {
        "pitch_count": pitch_count,
        "pitch_usage": pitch_usage,
        "average_velocity": _average_by_pitch_type(velocity_by_pitch_type),
        "average_spin_rate": _average_by_pitch_type(spin_by_pitch_type),
        "average_induced_vertical_break": _average_by_pitch_type(ivb_by_pitch_type),
        "average_horizontal_break": _average_by_pitch_type(
            horizontal_break_by_pitch_type
        ),
        "average_arm_angle": _average_by_pitch_type(arm_angle_by_pitch_type),
        "arm_angle": _average(arm_angles),
        "strike_rate": _rate(strike_count, pitch_count),
        "whiff_rate": _rate(whiff_count, pitch_count),
        "zone_rate": _rate(zone_pitch_count, located_pitch_count),
        "pitcher_hand": _most_common_hand(pitcher_hands),
    }


def _period_delta(
    period_a: dict[str, Any],
    period_b: dict[str, Any],
) -> dict[str, Any]:
    pitch_types = sorted(
        set(period_a["pitch_usage"].keys()) | set(period_b["pitch_usage"].keys())
    )
    def metric_delta(metric_name: str) -> dict[str, float | int | None]:
        pitch_types = sorted(
            set(period_a[metric_name].keys()) | set(period_b[metric_name].keys())
        )
        return {
            pitch_type: _delta(
                period_a[metric_name].get(pitch_type),
                period_b[metric_name].get(pitch_type),
            )
            for pitch_type in pitch_types
        }

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
        "average_velocity": metric_delta("average_velocity"),
        "average_spin_rate": metric_delta("average_spin_rate"),
        "average_induced_vertical_break": metric_delta(
            "average_induced_vertical_break"
        ),
        "average_horizontal_break": metric_delta("average_horizontal_break"),
        "average_arm_angle": metric_delta("average_arm_angle"),
        "arm_angle": _delta(period_a["arm_angle"], period_b["arm_angle"]),
        "strike_rate": _delta(period_a["strike_rate"], period_b["strike_rate"]),
        "whiff_rate": _delta(period_a["whiff_rate"], period_b["whiff_rate"]),
        "zone_rate": _delta(period_a["zone_rate"], period_b["zone_rate"]),
    }


def _fetch_period_pitches(
    pitcher_id: int,
    start_date: date,
    end_date: date,
    parquet_path: Path,
    pitch_type: str | None = None,
    batter_hand: str | None = None,
) -> list[dict[str, Any]]:
    with statcast_connection(parquet_path) as connection:
        columns = table_columns(connection)
        arm_angle_select = "arm_angle" if "arm_angle" in columns else "NULL AS arm_angle"
        where_clauses = ["pitcher = ?", "game_date BETWEEN ? AND ?"]
        params: list[Any] = [pitcher_id, start_date.isoformat(), end_date.isoformat()]

        if pitch_type:
            where_clauses.append("pitch_type = ?")
            params.append(pitch_type)
        if batter_hand:
            where_clauses.append("stand = ?")
            params.append(batter_hand)

        cursor = connection.execute(
            "SELECT pitch_type, release_speed, release_spin_rate, pfx_x, pfx_z, "
            "description, plate_x, plate_z, p_throws, "
            f"{arm_angle_select} "
            "FROM statcast_pitches "
            f"WHERE {' AND '.join(where_clauses)}",
            params,
        )
        columns = [description[0] for description in cursor.description]
        return _rows_to_dicts(columns, cursor.fetchall())


def resolve_pitcher_id_from_cache(
    pitcher_name: str,
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> int:
    with statcast_connection(parquet_path) as connection:
        cursor = connection.execute(
            "SELECT DISTINCT pitcher, player_name "
            "FROM statcast_pitches "
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
    pitch_type: str | None = None,
    batter_hand: str | None = None,
) -> dict[str, Any]:
    parquet_path = resolve_statcast_parquet(parquet_path)

    period_a = _summarize_period(
        _fetch_period_pitches(
            pitcher_id,
            a_start,
            a_end,
            parquet_path,
            pitch_type=pitch_type,
            batter_hand=batter_hand,
        )
    )
    period_b = _summarize_period(
        _fetch_period_pitches(
            pitcher_id,
            b_start,
            b_end,
            parquet_path,
            pitch_type=pitch_type,
            batter_hand=batter_hand,
        )
    )
    pitcher_hand = period_a.get("pitcher_hand") or period_b.get("pitcher_hand")

    return {
        "pitcher_id": pitcher_id,
        "pitcher_hand": pitcher_hand,
        "filters": {
            "pitch_type": pitch_type,
            "batter_hand": batter_hand,
        },
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
