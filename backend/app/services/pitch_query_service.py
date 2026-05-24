from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.db.statcast import (
    DEFAULT_STATCAST_PARQUET,
    LEGACY_STATCAST_PARQUET,
    duckdb_string_literal,
    get_statcast_cache_metadata,
    resolve_statcast_parquet,
    statcast_connection,
    table_columns,
)

ZONE_LEFT = -0.83
ZONE_RIGHT = 0.83
ZONE_BOTTOM = 1.5
ZONE_TOP = 3.5
HEATMAP_X_MIN = -2.5
HEATMAP_X_MAX = 2.5
HEATMAP_Z_MIN = 0.0
HEATMAP_Z_MAX = 5.0
HARD_CONTACT_MIN_LAUNCH_SPEED = 95
WHIFF_DESCRIPTIONS = ("swinging_strike", "swinging_strike_blocked", "missed_bunt")
PITCH_TYPE_GROUPS = {
    "fastball": ("FF", "SI", "FC"),
    "breaking": ("SL", "ST", "CU", "KC", "SV"),
    "offspeed": ("CH", "FS", "FO", "SC"),
}


def _pitch_type_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()]


def _zone_condition() -> str:
    return (
        f"(plate_x BETWEEN {ZONE_LEFT} AND {ZONE_RIGHT} "
        f"AND plate_z BETWEEN {ZONE_BOTTOM} AND {ZONE_TOP})"
    )


def _build_where_clause(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    where_clauses: list[str] = []
    params: list[Any] = []

    exact_filters = {
        "pitcher_id": "pitcher",
        "season": "game_year",
        "pitch_type": "pitch_type",
        "balls": "balls",
        "strikes": "strikes",
        "batter_hand": "stand",
        "description": "description",
        "events": "events",
    }

    for filter_name, column_name in exact_filters.items():
        value = filters.get(filter_name)
        if value is not None:
            if filter_name == "pitch_type":
                pitch_types = _pitch_type_values(value)
                if len(pitch_types) == 1:
                    where_clauses.append("pitch_type = ?")
                    params.append(pitch_types[0])
                elif len(pitch_types) > 1:
                    placeholders = ", ".join("?" for _pitch_type in pitch_types)
                    where_clauses.append(f"pitch_type IN ({placeholders})")
                    params.extend(pitch_types)
            else:
                where_clauses.append(f"{column_name} = ?")
                params.append(value)

    pitch_type_group = filters.get("pitch_type_group")
    if pitch_type_group in PITCH_TYPE_GROUPS:
        pitch_types = PITCH_TYPE_GROUPS[pitch_type_group]
        placeholders = ", ".join("?" for _pitch_type in pitch_types)
        where_clauses.append(f"pitch_type IN ({placeholders})")
        params.extend(pitch_types)

    pitcher_name = filters.get("pitcher_name")
    if pitcher_name:
        where_clauses.append("LOWER(player_name) LIKE ?")
        params.append(f"%{str(pitcher_name).lower()}%")

    min_velocity = filters.get("min_velocity")
    if min_velocity is not None:
        where_clauses.append("release_speed >= ?")
        params.append(min_velocity)

    max_velocity = filters.get("max_velocity")
    if max_velocity is not None:
        where_clauses.append("release_speed <= ?")
        params.append(max_velocity)

    base_state = filters.get("base_state")
    if base_state == "runners_on":
        where_clauses.append("(on_1b IS NOT NULL OR on_2b IS NOT NULL OR on_3b IS NOT NULL)")
    elif base_state == "bases_empty":
        where_clauses.append("(on_1b IS NULL AND on_2b IS NULL AND on_3b IS NULL)")

    count_group = filters.get("count_group")
    if count_group == "ahead":
        where_clauses.append("strikes > balls")
    elif count_group == "behind":
        where_clauses.append("balls > strikes")
    elif count_group == "even":
        where_clauses.append("balls = strikes")
    elif count_group == "two_strikes":
        where_clauses.append("strikes = 2")
    elif count_group == "full_count":
        where_clauses.append("(balls = 3 AND strikes = 2)")

    location_filter = filters.get("location_filter")
    if location_filter == "zone":
        where_clauses.append(_zone_condition())
    elif location_filter in {"out_of_zone", "chase"}:
        where_clauses.append(f"(plate_x IS NOT NULL AND plate_z IS NOT NULL AND NOT {_zone_condition()})")

    start_date = filters.get("start_date")
    if start_date is not None:
        where_clauses.append("game_date >= ?")
        params.append(start_date)

    end_date = filters.get("end_date")
    if end_date is not None:
        where_clauses.append("game_date <= ?")
        params.append(end_date)

    where_sql = ""
    if where_clauses:
        where_sql = " WHERE " + " AND ".join(where_clauses)

    return where_sql, params


def _build_pitch_query(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    where_sql, params = _build_where_clause(filters)
    query = "SELECT * FROM statcast_pitches" + where_sql

    result_order = filters.get("result_order", "latest")
    if result_order == "oldest":
        query += " ORDER BY game_date ASC"
    elif result_order == "random":
        query += " ORDER BY random()"
    else:
        query += " ORDER BY game_date DESC"

    limit = filters.get("limit", 100)
    if limit is not None:
        query += " LIMIT ?"
        params.append(int(limit))

    return query, params


def _build_pitch_count_query(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    where_sql, params = _build_where_clause(filters)
    return "SELECT count(*) FROM statcast_pitches" + where_sql, params


def _append_where_condition(where_sql: str, condition: str) -> str:
    return f"{where_sql} AND {condition}" if where_sql else f" WHERE {condition}"


def _build_pitch_heatmap_query(
    filters: dict[str, Any],
    x_bins: int,
    z_bins: int,
    mode: str = "all",
) -> tuple[str, list[Any], dict[str, float]]:
    where_sql, where_params = _build_where_clause(filters)
    x_min = HEATMAP_X_MIN
    x_max = HEATMAP_X_MAX
    z_min = HEATMAP_Z_MIN
    z_max = HEATMAP_Z_MAX
    x_bin_width = (x_max - x_min) / x_bins
    z_bin_width = (z_max - z_min) / z_bins

    where_sql = _append_where_condition(where_sql, "plate_x IS NOT NULL")
    where_sql = _append_where_condition(where_sql, "plate_z IS NOT NULL")
    if mode == "whiffs":
        where_sql = _append_where_condition(
            where_sql,
            "description IN (" + ", ".join(_duckdb_string_literal(value) for value in WHIFF_DESCRIPTIONS) + ")",
        )
    elif mode == "hard_contact":
        where_sql = _append_where_condition(where_sql, f"launch_speed >= {HARD_CONTACT_MIN_LAUNCH_SPEED}")
    elif mode == "in_zone":
        where_sql = _append_where_condition(where_sql, _zone_condition())
    where_sql = _append_where_condition(where_sql, "plate_x >= ? AND plate_x < ?")
    where_sql = _append_where_condition(where_sql, "plate_z >= ? AND plate_z < ?")

    bin_expression_sql = (
        "CAST(FLOOR((plate_x - ?) / ?) AS INTEGER) AS x_bin, "
        "CAST(FLOOR((plate_z - ?) / ?) AS INTEGER) AS z_bin"
    )
    query = (
        "WITH binned AS ("
        "SELECT "
        f"{bin_expression_sql}, "
        "pitch_type, release_speed, launch_speed "
        "FROM statcast_pitches"
        f"{where_sql}"
        "), pitch_mix AS ("
        "SELECT x_bin, z_bin, pitch_type, count(*) AS pitch_type_count "
        "FROM binned WHERE pitch_type IS NOT NULL "
        "GROUP BY x_bin, z_bin, pitch_type"
        "), top_pitch AS ("
        "SELECT x_bin, z_bin, arg_max(pitch_type, pitch_type_count) AS top_pitch_type, "
        "max(pitch_type_count) AS top_pitch_count "
        "FROM pitch_mix GROUP BY x_bin, z_bin"
        "), cells AS ("
        "SELECT x_bin, z_bin, count(*) AS pitch_count, "
        "avg(release_speed) AS average_velocity, "
        "avg(launch_speed) AS average_exit_velocity, "
        "max(launch_speed) AS max_exit_velocity "
        "FROM binned GROUP BY x_bin, z_bin"
        ") "
        "SELECT cells.x_bin, cells.z_bin, cells.pitch_count, "
        "cells.average_velocity, cells.average_exit_velocity, cells.max_exit_velocity, "
        "top_pitch.top_pitch_type, top_pitch.top_pitch_count "
        "FROM cells LEFT JOIN top_pitch "
        "ON cells.x_bin = top_pitch.x_bin AND cells.z_bin = top_pitch.z_bin "
        "ORDER BY cells.x_bin, cells.z_bin"
    )
    params = [
        x_min,
        x_bin_width,
        z_min,
        z_bin_width,
        *where_params,
        x_min,
        x_max,
        z_min,
        z_max,
    ]
    domain = {
        "x_min": x_min,
        "x_max": x_max,
        "z_min": z_min,
        "z_max": z_max,
        "x_bin_width": x_bin_width,
        "z_bin_width": z_bin_width,
    }
    return query, params, domain


def _to_json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _rows_to_dicts(columns: list[str], rows: list[tuple[Any, ...]]) -> list[dict[str, Any]]:
    return [
        {column: _to_json_value(value) for column, value in zip(columns, row)}
        for row in rows
    ]


def _duckdb_string_literal(value: str) -> str:
    return duckdb_string_literal(value)


def _table_columns(connection: Any, table_name: str) -> set[str]:
    return table_columns(connection, table_name)


def _resolve_statcast_parquet(parquet_path: Path | str) -> Path:
    return resolve_statcast_parquet(parquet_path)


def _filters_without(filters: dict[str, Any], *filter_names: str) -> dict[str, Any]:
    return {key: value for key, value in filters.items() if key not in filter_names}


def search_pitches(
    filters: dict[str, Any],
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> dict[str, Any]:
    query, params = _build_pitch_query(filters)
    count_query, count_params = _build_pitch_count_query(filters)

    with statcast_connection(parquet_path) as connection:
        total_count = int(connection.execute(count_query, count_params).fetchone()[0])
        cursor = connection.execute(query, params)
        columns = [description[0] for description in cursor.description]
        return {
            "total_count": total_count,
            "results": _rows_to_dicts(columns, cursor.fetchall()),
        }


def get_pitch_data_quality(
    filters: dict[str, Any],
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> dict[str, Any]:
    where_sql, params = _build_where_clause(filters)
    contact_condition = (
        "(bb_type IS NOT NULL OR launch_speed IS NOT NULL OR launch_angle IS NOT NULL "
        "OR hit_distance_sc IS NOT NULL OR description = 'hit_into_play' OR events IS NOT NULL)"
    )
    query = (
        "SELECT "
        "count(*) AS pitch_count, "
        "sum(CASE WHEN plate_x IS NOT NULL AND plate_z IS NOT NULL THEN 1 ELSE 0 END) AS plate_location_available, "
        "sum(CASE WHEN pfx_x IS NOT NULL AND pfx_z IS NOT NULL THEN 1 ELSE 0 END) AS movement_available, "
        "sum(CASE WHEN release_spin_rate IS NOT NULL THEN 1 ELSE 0 END) AS spin_available, "
        "sum(CASE WHEN arm_angle IS NOT NULL THEN 1 ELSE 0 END) AS arm_angle_available, "
        f"sum(CASE WHEN {contact_condition} THEN 1 ELSE 0 END) AS batted_ball_denominator, "
        f"sum(CASE WHEN {contact_condition} AND launch_speed IS NOT NULL AND launch_angle IS NOT NULL THEN 1 ELSE 0 END) "
        "AS batted_ball_available "
        f"FROM statcast_pitches{where_sql}"
    )

    with statcast_connection(parquet_path) as connection:
        row = connection.execute(query, params).fetchone()

    pitch_count = int(row[0] or 0)
    batted_ball_denominator = int(row[5] or 0)
    metric_inputs = [
        ("plate_location", "Plate Location", "all_pitches", pitch_count, int(row[1] or 0)),
        ("movement", "Movement", "all_pitches", pitch_count, int(row[2] or 0)),
        ("spin", "Spin", "all_pitches", pitch_count, int(row[3] or 0)),
        ("arm_angle", "Arm Angle", "all_pitches", pitch_count, int(row[4] or 0)),
        (
            "batted_ball",
            "Batted-Ball Metrics",
            "balls_in_play",
            batted_ball_denominator,
            int(row[6] or 0),
        ),
    ]

    metrics = []
    for key, label, denominator, denominator_count, available_count in metric_inputs:
        missing_count = max(denominator_count - available_count, 0)
        metrics.append(
            {
                "key": key,
                "label": label,
                "denominator": denominator,
                "denominator_count": denominator_count,
                "available_count": available_count,
                "missing_count": missing_count,
                "available_rate": available_count / denominator_count if denominator_count else None,
                "missing_rate": missing_count / denominator_count if denominator_count else None,
                "missing_fields": [],
            }
        )

    return {"pitch_count": pitch_count, "metrics": metrics}


def get_pitch_heatmap(
    filters: dict[str, Any],
    x_bins: int = 25,
    z_bins: int = 25,
    mode: str = "all",
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> dict[str, Any]:
    query, params, domain = _build_pitch_heatmap_query(filters, x_bins, z_bins, mode=mode)

    with statcast_connection(parquet_path) as connection:
        rows = connection.execute(query, params).fetchall()

    max_count = max((row[2] for row in rows), default=0)
    total_count = sum(row[2] for row in rows)
    cells = [
        {
            "x_bin": int(x_bin),
            "z_bin": int(z_bin),
            "x_start": domain["x_min"] + int(x_bin) * domain["x_bin_width"],
            "x_end": domain["x_min"] + (int(x_bin) + 1) * domain["x_bin_width"],
            "z_start": domain["z_min"] + int(z_bin) * domain["z_bin_width"],
            "z_end": domain["z_min"] + (int(z_bin) + 1) * domain["z_bin_width"],
            "count": int(count),
            "share": (int(count) / total_count) if total_count else 0,
            "density": (int(count) / max_count) if max_count else 0,
            "average_velocity": _to_json_value(average_velocity),
            "average_exit_velocity": _to_json_value(average_exit_velocity),
            "max_exit_velocity": _to_json_value(max_exit_velocity),
            "top_pitch_type": top_pitch_type,
            "top_pitch_count": _to_json_value(top_pitch_count),
            "top_pitch_share": (int(top_pitch_count) / int(count)) if top_pitch_count else 0,
        }
        for (
            x_bin,
            z_bin,
            count,
            average_velocity,
            average_exit_velocity,
            max_exit_velocity,
            top_pitch_type,
            top_pitch_count,
        ) in rows
    ]

    return {
        "mode": mode,
        "x_bins": x_bins,
        "z_bins": z_bins,
        "domain": {
            "x_min": domain["x_min"],
            "x_max": domain["x_max"],
            "z_min": domain["z_min"],
            "z_max": domain["z_max"],
        },
        "total_count": total_count,
        "max_count": int(max_count),
        "cells": cells,
    }


def list_pitch_filter_options(
    filters: dict[str, Any],
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> dict[str, Any]:
    def distinct_query(column_name: str, option_filters: dict[str, Any]) -> tuple[str, list[Any]]:
        where_sql, params = _build_where_clause(option_filters)
        query = (
            f"SELECT DISTINCT {column_name} AS value FROM statcast_pitches"
            f"{where_sql} AND {column_name} IS NOT NULL "
            f"ORDER BY {column_name}"
            if where_sql
            else (
                f"SELECT DISTINCT {column_name} AS value FROM statcast_pitches "
                f"WHERE {column_name} IS NOT NULL ORDER BY {column_name}"
            )
        )
        return query, params

    def game_dates_query() -> tuple[str, list[Any]]:
        where_sql, params = _build_where_clause(_filters_without(filters, "start_date", "end_date"))
        return where_sql, params

    def velocity_query() -> tuple[str, list[Any]]:
        where_sql, params = _build_where_clause(_filters_without(filters, "min_velocity", "max_velocity"))
        return (
            f"SELECT min(release_speed), max(release_speed) FROM statcast_pitches{where_sql}",
            params,
        )

    def option_query_filters(option_name: str) -> dict[str, Any]:
        option_filter_fields = {
            "seasons": ("season",),
            "pitch_types": ("pitch_type",),
            "batter_hands": ("batter_hand",),
            "descriptions": ("description",),
            "events": ("events",),
        }
        return _filters_without(filters, *option_filter_fields[option_name])

    def append_where_not_null(where_sql: str, column_name: str) -> str:
        return (
            f"{where_sql} AND {column_name} IS NOT NULL"
            if where_sql
            else f" WHERE {column_name} IS NOT NULL"
        )

    with statcast_connection(parquet_path) as connection:
        columns = _table_columns(connection, "statcast_pitches")
        options: dict[str, Any] = {}
        for option_name, column_name in {
            "seasons": "game_year",
            "pitch_types": "pitch_type",
            "batter_hands": "stand",
            "descriptions": "description",
            "events": "events",
        }.items():
            query, option_params = distinct_query(
                column_name,
                option_query_filters(option_name),
            )
            cursor = connection.execute(query, option_params)
            options[option_name] = [_to_json_value(row[0]) for row in cursor.fetchall()]

        game_where_sql, game_params = game_dates_query()
        game_date_where_sql = append_where_not_null(game_where_sql, "game_date")
        if {"home_team", "away_team", "inning_topbot"}.issubset(columns):
            cursor = connection.execute(
                "SELECT game_date, any_value(away_team) AS away_team, "
                "any_value(home_team) AS home_team, "
                "any_value(CASE "
                "WHEN inning_topbot = 'Top' THEN away_team "
                "WHEN inning_topbot = 'Bot' THEN home_team "
                "ELSE NULL END) AS opponent_team, "
                "count(*) AS pitch_count "
                f"FROM statcast_pitches{game_date_where_sql} "
                "GROUP BY game_date ORDER BY game_date DESC",
                game_params,
            )
        elif "home_team" in columns and "away_team" in columns:
            cursor = connection.execute(
                "SELECT game_date, any_value(away_team) AS away_team, "
                "any_value(home_team) AS home_team, NULL AS opponent_team, "
                "count(*) AS pitch_count "
                f"FROM statcast_pitches{game_date_where_sql} "
                "GROUP BY game_date ORDER BY game_date DESC",
                game_params,
            )
        else:
            cursor = connection.execute(
                "SELECT game_date, NULL AS away_team, NULL AS home_team, "
                "NULL AS opponent_team, "
                "count(*) AS pitch_count "
                f"FROM statcast_pitches{game_date_where_sql} "
                "GROUP BY game_date ORDER BY game_date DESC",
                game_params,
            )
        options["game_dates"] = _rows_to_dicts(
            ["game_date", "away_team", "home_team", "opponent_team", "pitch_count"],
            cursor.fetchall(),
        )

        query, velocity_params = velocity_query()
        cursor = connection.execute(query, velocity_params)
        min_velocity, max_velocity = cursor.fetchone()
        options["velocity"] = {
            "min": _to_json_value(min_velocity),
            "max": _to_json_value(max_velocity),
        }

    return options


def list_cached_pitchers(
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> list[dict[str, Any]]:
    with statcast_connection(parquet_path) as connection:
        cursor = connection.execute(
            "SELECT pitcher, player_name, count(*) AS pitch_count, "
            "min(game_date) AS first_game_date, max(game_date) AS last_game_date "
            "FROM statcast_pitches "
            "GROUP BY pitcher, player_name "
            "ORDER BY player_name"
        )
        columns = [description[0] for description in cursor.description]
        return _rows_to_dicts(columns, cursor.fetchall())


def get_cache_metadata(
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> dict[str, Any]:
    return get_statcast_cache_metadata(parquet_path)
