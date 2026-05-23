import argparse
import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from ingest_statcast import fetch_statcast_pitcher, resolve_pitcher_id, save_parquet


LOGGER = logging.getLogger("relay.ingest_statcast_batch")
UNKNOWN_PITCH_TYPES = {"", "unknown", "unkown", "un"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Statcast data for multiple pitchers into one parquet cache."
    )
    parser.add_argument("--start-date", required=True, type=date.fromisoformat)
    parser.add_argument("--end-date", required=True, type=date.fromisoformat)
    parser.add_argument("--pitcher-id", action="append", type=int, default=[])
    parser.add_argument("--pitcher-name", action="append", default=[])
    parser.add_argument("--output", default="../data/statcast.parquet")
    parser.add_argument("--manifest", default="../data/statcast_manifest.json")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Overwrite the output parquet instead of appending to an existing cache.",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Continue ingesting remaining pitchers when one pitcher fails.",
    )
    parser.add_argument(
        "--index-only",
        action="store_true",
        help="Skip fetching data and rebuild the manifest from the existing parquet.",
    )
    return parser.parse_args()


def unique_preserving_order(values: list[int]) -> list[int]:
    return list(dict.fromkeys(values))


def import_duckdb() -> Any:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    return duckdb


def json_value(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def is_known_pitch_type(value: Any) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() not in UNKNOWN_PITCH_TYPES


def summarize_dataframe(dataframe: Any, pitcher_id: int, requested_name: str | None = None) -> dict[str, Any]:
    row_count = int(len(dataframe))
    summary: dict[str, Any] = {
        "pitcher_id": pitcher_id,
        "requested_name": requested_name,
        "row_count": row_count,
        "status": "ok",
    }

    if row_count == 0:
        return summary

    if "player_name" in dataframe.columns:
        names = dataframe["player_name"].dropna().unique()
        if len(names) > 0:
            summary["player_name"] = str(names[0])
    if "game_date" in dataframe.columns:
        summary["first_game_date"] = json_value(dataframe["game_date"].min())
        summary["last_game_date"] = json_value(dataframe["game_date"].max())
    if "pitch_type" in dataframe.columns:
        summary["pitch_types"] = sorted(
            str(pitch_type)
            for pitch_type in dataframe["pitch_type"].dropna().unique()
            if is_known_pitch_type(pitch_type)
        )

    return summary


def summarize_parquet(output_path: Path) -> dict[str, Any]:
    if not output_path.exists():
        return {
            "exists": False,
            "row_count": 0,
            "pitcher_count": 0,
            "pitchers": [],
            "pitch_types": [],
        }

    duckdb = import_duckdb()
    escaped_output = output_path.as_posix().replace("'", "''")
    unknown_pitch_types = ", ".join(f"'{value}'" for value in sorted(UNKNOWN_PITCH_TYPES))
    with duckdb.connect() as connection:
        row = connection.execute(
            "SELECT count(*) AS row_count, count(DISTINCT pitcher) AS pitcher_count, "
            "min(game_date) AS first_game_date, max(game_date) AS last_game_date "
            f"FROM read_parquet('{escaped_output}')"
        ).fetchone()
        pitchers = connection.execute(
            "SELECT pitcher AS pitcher_id, any_value(player_name) AS player_name, "
            "count(*) AS row_count, min(game_date) AS first_game_date, "
            "max(game_date) AS last_game_date "
            f"FROM read_parquet('{escaped_output}') "
            "GROUP BY pitcher ORDER BY player_name"
        ).fetchall()
        pitch_types = connection.execute(
            f"SELECT DISTINCT pitch_type FROM read_parquet('{escaped_output}') "
            "WHERE pitch_type IS NOT NULL "
            f"AND lower(trim(CAST(pitch_type AS VARCHAR))) NOT IN ({unknown_pitch_types}) "
            "ORDER BY pitch_type"
        ).fetchall()

    return {
        "exists": True,
        "row_count": int(row[0]),
        "pitcher_count": int(row[1]),
        "first_game_date": json_value(row[2]),
        "last_game_date": json_value(row[3]),
        "pitchers": [
            {
                "pitcher_id": int(pitcher_id) if pitcher_id is not None else None,
                "player_name": player_name,
                "row_count": int(row_count),
                "first_game_date": json_value(first_game_date),
                "last_game_date": json_value(last_game_date),
            }
            for pitcher_id, player_name, row_count, first_game_date, last_game_date in pitchers
        ],
        "pitch_types": [pitch_type for (pitch_type,) in pitch_types],
    }


def write_manifest(manifest_path: Path, manifest: dict[str, Any]) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_manifest(
    output_path: Path,
    manifest_path: Path,
    start_date: date,
    end_date: date,
    ingestion_results: list[dict[str, Any]],
    replace: bool,
) -> dict[str, Any]:
    cache_summary = summarize_parquet(output_path)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "output_path": str(output_path),
        "manifest_path": str(manifest_path),
        "date_range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "replace": replace,
        "ingestion_results": ingestion_results,
        "cache": cache_summary,
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()

    if args.start_date > args.end_date:
        LOGGER.error("start date must be before or equal to end date")
        return 1
    if not args.index_only and not args.pitcher_id and not args.pitcher_name:
        LOGGER.error("at least one --pitcher-id or --pitcher-name is required")
        return 1

    output_path = Path(args.output)
    manifest_path = Path(args.manifest)
    pitcher_ids = list(args.pitcher_id)
    ingestion_results: list[dict[str, Any]] = []

    try:
        if args.index_only:
            LOGGER.info("index-only mode: rebuilding manifest from %s", output_path)
        else:
            requested_names_by_id: dict[int, str] = {}
            for pitcher_name in args.pitcher_name:
                LOGGER.info("resolving pitcher name: %s", pitcher_name)
                resolved_pitcher_id = resolve_pitcher_id(pitcher_name)
                pitcher_ids.append(resolved_pitcher_id)
                requested_names_by_id[resolved_pitcher_id] = pitcher_name

            should_append = output_path.exists() and not args.replace
            for index, pitcher_id in enumerate(unique_preserving_order(pitcher_ids)):
                LOGGER.info("ingesting pitcher id: %s", pitcher_id)
                try:
                    data = fetch_statcast_pitcher(args.start_date, args.end_date, pitcher_id)
                    pitcher_summary = summarize_dataframe(
                        data,
                        pitcher_id,
                        requested_name=requested_names_by_id.get(pitcher_id),
                    )
                    LOGGER.info("fetched row count: %s", pitcher_summary["row_count"])
                    saved_count = save_parquet(
                        data,
                        output_path,
                        append=should_append or index > 0,
                    )
                    pitcher_summary["cache_row_count_after_save"] = saved_count
                    ingestion_results.append(pitcher_summary)
                except Exception as exc:
                    LOGGER.error("failed pitcher id %s: %s", pitcher_id, exc)
                    ingestion_results.append(
                        {
                            "pitcher_id": pitcher_id,
                            "requested_name": requested_names_by_id.get(pitcher_id),
                            "row_count": 0,
                            "status": "error",
                            "error": str(exc),
                        }
                    )
                    if not args.continue_on_error:
                        raise

        manifest = build_manifest(
            output_path,
            manifest_path,
            args.start_date,
            args.end_date,
            ingestion_results,
            replace=args.replace,
        )
        write_manifest(manifest_path, manifest)

        LOGGER.info("output path: %s", output_path)
        LOGGER.info(
            "cache rows: %s across %s pitchers",
            manifest["cache"]["row_count"],
            manifest["cache"]["pitcher_count"],
        )
        LOGGER.info("manifest path: %s", manifest_path)
        if any(result.get("status") == "error" for result in ingestion_results):
            LOGGER.error(
                "completed with %s pitcher errors",
                sum(1 for result in ingestion_results if result.get("status") == "error"),
            )
            return 1
    except Exception as exc:
        LOGGER.error("failed to ingest Statcast batch: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
