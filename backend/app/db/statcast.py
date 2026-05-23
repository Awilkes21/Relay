from __future__ import annotations

import json
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator


DATA_DIR = Path(__file__).resolve().parents[3] / "data"
DEFAULT_STATCAST_PARQUET = DATA_DIR / "statcast.parquet"
DEFAULT_STATCAST_MANIFEST = DATA_DIR / "statcast_manifest.json"
LEGACY_STATCAST_PARQUET = DATA_DIR / "statcast_sample.parquet"
STATCAST_VIEW_NAME = "statcast_pitches"
RAW_STATCAST_VIEW_NAME = "_raw_statcast_pitches"
UNKNOWN_PITCH_TYPES = frozenset({"", "unknown", "unkown", "un"})
DATA_QUALITY_METRICS = (
    {
        "key": "arm_angle",
        "label": "Arm Angle",
        "fields": ("arm_angle",),
        "denominator": "all_pitches",
    },
    {
        "key": "spin",
        "label": "Spin",
        "fields": ("release_spin_rate",),
        "denominator": "all_pitches",
    },
    {
        "key": "movement",
        "label": "Movement",
        "fields": ("pfx_x", "pfx_z"),
        "denominator": "all_pitches",
    },
    {
        "key": "plate_location",
        "label": "Plate Location",
        "fields": ("plate_x", "plate_z"),
        "denominator": "all_pitches",
    },
    {
        "key": "batted_ball",
        "label": "Batted-Ball Metrics",
        "fields": ("launch_speed", "launch_angle"),
        "denominator": "balls_in_play",
    },
)


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


def data_quality_report(connection: Any) -> dict[str, Any]:
    columns = table_columns(connection)
    total_count = int(connection.execute(f"SELECT count(*) FROM {STATCAST_VIEW_NAME}").fetchone()[0])
    batted_ball_condition = (
        "description IN ('hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score')"
        if "description" in columns
        else "FALSE"
    )

    metrics: list[dict[str, Any]] = []
    for metric in DATA_QUALITY_METRICS:
        fields = tuple(metric["fields"])
        missing_fields = [field for field in fields if field not in columns]
        if metric["denominator"] == "balls_in_play":
            denominator_count = int(
                connection.execute(
                    "SELECT count(*) FROM "
                    f"{STATCAST_VIEW_NAME} WHERE {batted_ball_condition}"
                ).fetchone()[0]
            )
        else:
            denominator_count = total_count

        if missing_fields:
            available_count = 0
        elif denominator_count == 0:
            available_count = 0
        else:
            presence_condition = " AND ".join(f"{field} IS NOT NULL" for field in fields)
            where_condition = presence_condition
            if metric["denominator"] == "balls_in_play":
                where_condition = f"{batted_ball_condition} AND {presence_condition}"
            available_count = int(
                connection.execute(
                    f"SELECT count(*) FROM {STATCAST_VIEW_NAME} WHERE {where_condition}"
                ).fetchone()[0]
            )

        missing_count = max(denominator_count - available_count, 0)
        metrics.append(
            {
                "key": metric["key"],
                "label": metric["label"],
                "fields": list(fields),
                "denominator": metric["denominator"],
                "denominator_count": denominator_count,
                "available_count": available_count,
                "missing_count": missing_count,
                "missing_rate": (missing_count / denominator_count) if denominator_count else None,
                "available_rate": (available_count / denominator_count) if denominator_count else None,
                "missing_fields": missing_fields,
            }
        )

    return {
        "pitch_count": total_count,
        "metrics": metrics,
    }


def parquet_signature(parquet_path: Path | str = DEFAULT_STATCAST_PARQUET) -> tuple[str, int, int]:
    resolved_path = resolve_statcast_parquet(parquet_path)
    stat = resolved_path.stat()
    return str(resolved_path), stat.st_mtime_ns, stat.st_size


def resolve_statcast_manifest(
    manifest_path: Path | str | None = None,
) -> Path:
    if manifest_path is None:
        return DEFAULT_STATCAST_MANIFEST
    return Path(manifest_path)


def cache_metadata_signature(
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
    manifest_path: Path | str | None = None,
) -> tuple[str, int, int, str, int, int]:
    resolved_parquet = resolve_statcast_parquet(parquet_path)
    parquet_stat = resolved_parquet.stat()
    resolved_manifest = resolve_statcast_manifest(manifest_path)
    if resolved_manifest.exists():
        manifest_stat = resolved_manifest.stat()
        manifest_modified_ns = manifest_stat.st_mtime_ns
        manifest_size_bytes = manifest_stat.st_size
    else:
        manifest_modified_ns = 0
        manifest_size_bytes = 0

    return (
        str(resolved_parquet),
        parquet_stat.st_mtime_ns,
        parquet_stat.st_size,
        str(resolved_manifest),
        manifest_modified_ns,
        manifest_size_bytes,
    )


def get_statcast_cache_metadata(
    parquet_path: Path | str = DEFAULT_STATCAST_PARQUET,
    manifest_path: Path | str | None = None,
) -> dict[str, Any]:
    return _get_statcast_cache_metadata_cached(
        *cache_metadata_signature(parquet_path, manifest_path)
    )


@lru_cache(maxsize=8)
def _get_statcast_cache_metadata_cached(
    parquet_path: str,
    modified_ns: int,
    file_size_bytes: int,
    manifest_path: str,
    manifest_modified_ns: int,
    manifest_size_bytes: int,
) -> dict[str, Any]:
    # The parquet and manifest timestamps are part of the cache key so metadata
    # refreshes after ingestion updates either file.
    manifest_metadata = _metadata_from_manifest(
        manifest_path=Path(manifest_path),
        parquet_path=Path(parquet_path),
        parquet_modified_ns=modified_ns,
        parquet_file_size_bytes=file_size_bytes,
        manifest_modified_ns=manifest_modified_ns,
        manifest_size_bytes=manifest_size_bytes,
    )
    if manifest_metadata is not None:
        if manifest_metadata.get("seasons") and manifest_metadata.get("data_quality"):
            return manifest_metadata

        duckdb_metadata = _metadata_from_duckdb(parquet_path, file_size_bytes)
        manifest_metadata["seasons"] = duckdb_metadata["seasons"]
        manifest_metadata["data_quality"] = duckdb_metadata["data_quality"]
        manifest_metadata["source"] = "manifest+duckdb"
        return manifest_metadata

    return _metadata_from_duckdb(parquet_path, file_size_bytes)


def _metadata_from_duckdb(parquet_path: str, file_size_bytes: int) -> dict[str, Any]:
    with statcast_connection(parquet_path) as connection:
        columns = table_columns(connection)
        row = connection.execute(
            "SELECT count(*) AS pitch_count, "
            "count(DISTINCT pitcher) AS pitcher_count, "
            "min(game_date) AS first_game_date, "
            "max(game_date) AS last_game_date "
            f"FROM {STATCAST_VIEW_NAME}"
        ).fetchone()
        seasons = (
            [
                int(season)
                for (season,) in connection.execute(
                    f"SELECT DISTINCT game_year FROM {STATCAST_VIEW_NAME} "
                    "WHERE game_year IS NOT NULL ORDER BY game_year"
                ).fetchall()
            ]
            if "game_year" in columns
            else []
        )
        pitch_types = (
            [
                pitch_type
                for (pitch_type,) in connection.execute(
                    f"SELECT DISTINCT pitch_type FROM {STATCAST_VIEW_NAME} "
                    "ORDER BY pitch_type"
                ).fetchall()
            ]
            if "pitch_type" in columns
            else []
        )
        data_quality = data_quality_report(connection)

    return {
        "path": parquet_path,
        "file_size_bytes": file_size_bytes,
        "pitch_count": int(row[0]),
        "pitcher_count": int(row[1]),
        "first_game_date": row[2].isoformat() if hasattr(row[2], "isoformat") else row[2],
        "last_game_date": row[3].isoformat() if hasattr(row[3], "isoformat") else row[3],
        "seasons": seasons,
        "pitch_types": pitch_types,
        "data_quality": data_quality,
        "source": "duckdb",
    }


def _metadata_from_manifest(
    manifest_path: Path,
    parquet_path: Path,
    parquet_modified_ns: int,
    parquet_file_size_bytes: int,
    manifest_modified_ns: int,
    manifest_size_bytes: int,
) -> dict[str, Any] | None:
    if manifest_modified_ns == 0 or manifest_size_bytes == 0:
        return None
    if manifest_modified_ns < parquet_modified_ns:
        return None

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(manifest, dict):
        return None
    if not _manifest_output_matches_parquet(manifest, manifest_path, parquet_path):
        return None

    cache = manifest.get("cache")
    if not isinstance(cache, dict) or cache.get("exists") is False:
        return None
    if cache.get("row_count") is None or cache.get("pitcher_count") is None:
        return None

    return {
        "path": str(parquet_path),
        "file_size_bytes": parquet_file_size_bytes,
        "pitch_count": int(cache["row_count"]),
        "pitcher_count": int(cache["pitcher_count"]),
        "first_game_date": cache.get("first_game_date"),
        "last_game_date": cache.get("last_game_date"),
        "seasons": cache.get("seasons") or [],
        "pitch_types": cache.get("pitch_types") or [],
        "data_quality": cache.get("data_quality"),
        "source": "manifest",
        "manifest": {
            "path": str(manifest_path),
            "generated_at": manifest.get("generated_at"),
            "date_range": manifest.get("date_range"),
        },
    }


def _manifest_output_matches_parquet(
    manifest: dict[str, Any],
    manifest_path: Path,
    parquet_path: Path,
) -> bool:
    output_path = manifest.get("output_path")
    if not isinstance(output_path, str) or not output_path.strip():
        return False

    raw_path = Path(output_path)
    candidates = [raw_path]
    if not raw_path.is_absolute():
        candidates.extend(
            [
                manifest_path.parent / raw_path,
                Path.cwd() / raw_path,
                Path.cwd() / "backend" / raw_path,
            ]
        )

    resolved_parquet = parquet_path.resolve(strict=False)
    return any(
        candidate.resolve(strict=False) == resolved_parquet
        for candidate in candidates
    )
