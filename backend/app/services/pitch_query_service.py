from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any


DEFAULT_STATCAST_PARQUET = (
    Path(__file__).resolve().parents[3] / "data" / "statcast_sample.parquet"
)


def _build_pitch_query(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    where_clauses: list[str] = []
    params: list[Any] = []

    exact_filters = {
        "pitcher_id": "pitcher",
        "season": "game_year",
        "pitch_type": "pitch_type",
        "balls": "balls",
        "strikes": "strikes",
    }

    for filter_name, column_name in exact_filters.items():
        value = filters.get(filter_name)
        if value is not None:
            where_clauses.append(f"{column_name} = ?")
            params.append(value)

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

    query = "SELECT * FROM statcast_pitches"
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    query += " ORDER BY game_date DESC"

    limit = filters.get("limit", 100)
    if limit is not None:
        query += " LIMIT ?"
        params.append(int(limit))

    return query, params


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
    return "'" + value.replace("'", "''") + "'"


def search_pitches(
    filters: dict[str, Any],
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> list[dict[str, Any]]:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    parquet_path = Path(parquet_path)
    if not parquet_path.exists():
        raise FileNotFoundError(f"Statcast parquet file not found: {parquet_path}")

    query, params = _build_pitch_query(filters)

    with duckdb.connect() as connection:
        connection.execute(
            "CREATE TEMP VIEW statcast_pitches AS "
            f"SELECT * FROM read_parquet({_duckdb_string_literal(str(parquet_path))})"
        )
        cursor = connection.execute(query, params)
        columns = [description[0] for description in cursor.description]
        return _rows_to_dicts(columns, cursor.fetchall())
