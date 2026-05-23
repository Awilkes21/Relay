from __future__ import annotations

from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator


DATA_DIR = Path(__file__).resolve().parents[3] / "data"
DEFAULT_STATCAST_PARQUET = DATA_DIR / "statcast.parquet"
LEGACY_STATCAST_PARQUET = DATA_DIR / "statcast_sample.parquet"
STATCAST_VIEW_NAME = "statcast_pitches"
RAW_STATCAST_VIEW_NAME = "_raw_statcast_pitches"
UNKNOWN_PITCH_TYPES = frozenset({"", "unknown", "unkown", "un"})


def is_known_pitch_type(value: Any) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() not in UNKNOWN_PITCH_TYPES


def known_pitch_type_condition(column_name: str = "pitch_type") -> str:
    unknown_values = ", ".join(duckdb_string_literal(value) for value in sorted(UNKNOWN_PITCH_TYPES))
    return (
        f"{column_name} IS NOT NULL "
        f"AND lower(trim(CAST({column_name} AS VARCHAR))) NOT IN ({unknown_values})"
    )


def duckdb_string_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def import_duckdb() -> Any:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    return duckdb


def resolve_statcast_parquet(parquet_path: Path | str = DEFAULT_STATCAST_PARQUET) -> Path:
    resolved_path = Path(parquet_path)
    if resolved_path == DEFAULT_STATCAST_PARQUET and not resolved_path.exists():
        resolved_path = LEGACY_STATCAST_PARQUET

    if not resolved_path.exists():
        raise FileNotFoundError(f"Statcast parquet file not found: {resolved_path}")

    return resolved_path


@contextmanager
def statcast_connection(
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> Iterator[Any]:
    duckdb = import_duckdb()
    resolved_path = resolve_statcast_parquet(parquet_path)

    with duckdb.connect() as connection:
        connection.execute(
            f"CREATE TEMP VIEW {RAW_STATCAST_VIEW_NAME} AS "
            f"SELECT * FROM read_parquet({duckdb_string_literal(str(resolved_path))})"
        )
        raw_columns = table_columns(connection, RAW_STATCAST_VIEW_NAME)
        if "pitch_type" in raw_columns:
            connection.execute(
                f"CREATE TEMP VIEW {STATCAST_VIEW_NAME} AS "
                f"SELECT * FROM {RAW_STATCAST_VIEW_NAME} "
                f"WHERE {known_pitch_type_condition()}"
            )
        else:
            connection.execute(
                f"CREATE TEMP VIEW {STATCAST_VIEW_NAME} AS "
                f"SELECT * FROM {RAW_STATCAST_VIEW_NAME}"
            )
        yield connection


def table_columns(connection: Any, table_name: str = STATCAST_VIEW_NAME) -> set[str]:
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()}


def parquet_signature(parquet_path: Path | str = DEFAULT_STATCAST_PARQUET) -> tuple[str, int, int]:
    resolved_path = resolve_statcast_parquet(parquet_path)
    stat = resolved_path.stat()
    return str(resolved_path), stat.st_mtime_ns, stat.st_size


def get_statcast_cache_metadata(
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
) -> dict[str, Any]:
    return _get_statcast_cache_metadata_cached(*parquet_signature(parquet_path))


@lru_cache(maxsize=8)
def _get_statcast_cache_metadata_cached(
    parquet_path: str,
    modified_ns: int,
    file_size_bytes: int,
) -> dict[str, Any]:
    # modified_ns is part of the cache key so the metadata refreshes whenever
    # ingestion rewrites the parquet file.
    del modified_ns

    with statcast_connection(parquet_path) as connection:
        row = connection.execute(
            "SELECT count(*) AS pitch_count, "
            "count(DISTINCT pitcher) AS pitcher_count, "
            "min(game_date) AS first_game_date, "
            "max(game_date) AS last_game_date "
            f"FROM {STATCAST_VIEW_NAME}"
        ).fetchone()
        seasons = [
            int(season)
            for (season,) in connection.execute(
                f"SELECT DISTINCT game_year FROM {STATCAST_VIEW_NAME} "
                "WHERE game_year IS NOT NULL ORDER BY game_year"
            ).fetchall()
        ]
        pitch_types = [
            pitch_type
            for (pitch_type,) in connection.execute(
                f"SELECT DISTINCT pitch_type FROM {STATCAST_VIEW_NAME} "
                "ORDER BY pitch_type"
            ).fetchall()
        ]

    return {
        "path": parquet_path,
        "file_size_bytes": file_size_bytes,
        "pitch_count": int(row[0]),
        "pitcher_count": int(row[1]),
        "first_game_date": row[2].isoformat() if hasattr(row[2], "isoformat") else row[2],
        "last_game_date": row[3].isoformat() if hasattr(row[3], "isoformat") else row[3],
        "seasons": seasons,
        "pitch_types": pitch_types,
    }
