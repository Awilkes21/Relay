import argparse
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.statcast import duckdb_string_literal  # noqa: E402
from ingest_statcast_batch import summarize_parquet  # noqa: E402


LOGGER = logging.getLogger("relay.prepare_demo_cache")
DEFAULT_DEMO_PITCHER_IDS = [
    669373,  # Tarik Skubal
    694973,  # Paul Skenes
    605400,  # Aaron Nola
    669203,  # Corbin Burnes
    554430,  # Zack Wheeler
    543037,  # Gerrit Cole
    657277,  # Logan Webb
    592332,  # Kevin Gausman
    675911,  # Spencer Strider
    656302,  # Dylan Cease
    680694,  # Kyle Bradish
    669923,  # George Kirby
]
DEFAULT_DEMO_SEASONS = [2021, 2022, 2023, 2024, 2025, 2026]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or install a curated Relay demo Statcast cache."
    )
    parser.add_argument(
        "--source",
        default="../data/statcast.parquet",
        help="Source parquet to subset when building demo data.",
    )
    parser.add_argument(
        "--demo-dir",
        default="../data/demo",
        help="Directory for committed-friendly demo cache artifacts.",
    )
    parser.add_argument(
        "--active-output",
        default="../data/statcast.parquet",
        help="Active app parquet path to write when --install is used.",
    )
    parser.add_argument(
        "--active-manifest",
        default="../data/statcast_manifest.json",
        help="Active app manifest path to write when --install is used.",
    )
    parser.add_argument(
        "--pitcher-id",
        action="append",
        type=int,
        default=[],
        help="Pitcher MLBAM ID to include. Defaults to the curated demo pitchers.",
    )
    parser.add_argument(
        "--season",
        action="append",
        type=int,
        default=[],
        help="Season to include. Defaults to the curated demo seasons.",
    )
    parser.add_argument(
        "--max-pitches-per-pitcher-season",
        type=int,
        default=0,
        help="Optional cap per pitcher-season. Use 0 to keep every matching row.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Do not rebuild demo artifacts; only install existing demo artifacts.",
    )
    parser.add_argument(
        "--install",
        action="store_true",
        help="Install the demo artifacts into the active data/statcast cache paths.",
    )
    return parser.parse_args()


def import_duckdb() -> Any:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    return duckdb


def unique_ints(values: list[int], defaults: list[int]) -> list[int]:
    return list(dict.fromkeys(values or defaults))


def write_manifest(
    parquet_path: Path,
    manifest_path: Path,
    *,
    source_path: Path,
    pitcher_ids: list[int],
    seasons: list[int],
    max_pitches_per_pitcher_season: int,
) -> None:
    cache_summary = summarize_parquet(parquet_path)
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "output_path": str(parquet_path),
        "manifest_path": str(manifest_path),
        "date_range": {
            "start": cache_summary.get("first_game_date"),
            "end": cache_summary.get("last_game_date"),
        },
        "game_types": "source_subset",
        "replace": True,
        "demo": {
            "source_path": str(source_path),
            "pitcher_ids": pitcher_ids,
            "seasons": seasons,
            "max_pitches_per_pitcher_season": max_pitches_per_pitcher_season or None,
        },
        "ingestion_results": [
            {
                "pitcher_id": pitcher.get("pitcher_id"),
                "player_name": pitcher.get("player_name"),
                "row_count": pitcher.get("row_count"),
                "first_game_date": pitcher.get("first_game_date"),
                "last_game_date": pitcher.get("last_game_date"),
                "status": "ok",
            }
            for pitcher in cache_summary.get("pitchers", [])
        ],
        "cache": cache_summary,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_demo_cache(
    source_path: Path,
    demo_parquet_path: Path,
    demo_manifest_path: Path,
    pitcher_ids: list[int],
    seasons: list[int],
    max_pitches_per_pitcher_season: int,
) -> None:
    if not source_path.exists():
        raise FileNotFoundError(f"Source parquet not found: {source_path}")

    duckdb = import_duckdb()
    demo_parquet_path.parent.mkdir(parents=True, exist_ok=True)
    pitcher_list = ", ".join(str(pitcher_id) for pitcher_id in pitcher_ids)
    season_list = ", ".join(str(season) for season in seasons)
    source_literal = duckdb_string_literal(str(source_path))
    output_literal = duckdb_string_literal(str(demo_parquet_path))
    base_query = (
        "SELECT * FROM read_parquet("
        f"{source_literal}) "
        f"WHERE pitcher IN ({pitcher_list}) "
        f"AND game_year IN ({season_list})"
    )

    if max_pitches_per_pitcher_season > 0:
        base_query = (
            "SELECT * FROM ("
            "SELECT *, row_number() OVER ("
            "PARTITION BY pitcher, game_year ORDER BY game_date, at_bat_number, pitch_number"
            ") AS relay_demo_row_number "
            f"FROM ({base_query})"
            f") WHERE relay_demo_row_number <= {max_pitches_per_pitcher_season}"
        )

    with duckdb.connect() as connection:
        connection.execute(
            f"COPY ({base_query}) TO {output_literal} (FORMAT PARQUET)"
        )

    write_manifest(
        demo_parquet_path,
        demo_manifest_path,
        source_path=source_path,
        pitcher_ids=pitcher_ids,
        seasons=seasons,
        max_pitches_per_pitcher_season=max_pitches_per_pitcher_season,
    )


def install_demo_cache(
    demo_parquet_path: Path,
    demo_manifest_path: Path,
    active_output_path: Path,
    active_manifest_path: Path,
) -> None:
    if not demo_parquet_path.exists() or not demo_manifest_path.exists():
        raise FileNotFoundError(
            f"Demo cache artifacts not found in {demo_parquet_path.parent}. Build them first."
        )

    active_output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(demo_parquet_path, active_output_path)

    demo_manifest = json.loads(demo_manifest_path.read_text(encoding="utf-8"))
    demo = demo_manifest.get("demo") if isinstance(demo_manifest.get("demo"), dict) else {}
    write_manifest(
        active_output_path,
        active_manifest_path,
        source_path=Path(str(demo.get("source_path") or demo_parquet_path)),
        pitcher_ids=[int(value) for value in demo.get("pitcher_ids", [])],
        seasons=[int(value) for value in demo.get("seasons", [])],
        max_pitches_per_pitcher_season=int(demo.get("max_pitches_per_pitcher_season") or 0),
    )


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()
    source_path = Path(args.source)
    demo_dir = Path(args.demo_dir)
    demo_parquet_path = demo_dir / "statcast.parquet"
    demo_manifest_path = demo_dir / "statcast_manifest.json"
    active_output_path = Path(args.active_output)
    active_manifest_path = Path(args.active_manifest)
    pitcher_ids = unique_ints(args.pitcher_id, DEFAULT_DEMO_PITCHER_IDS)
    seasons = unique_ints(args.season, DEFAULT_DEMO_SEASONS)

    try:
        if not args.skip_build:
            LOGGER.info("building demo cache: %s", demo_parquet_path)
            build_demo_cache(
                source_path,
                demo_parquet_path,
                demo_manifest_path,
                pitcher_ids,
                seasons,
                args.max_pitches_per_pitcher_season,
            )

        if args.install:
            LOGGER.info("installing demo cache to: %s", active_output_path)
            install_demo_cache(
                demo_parquet_path,
                demo_manifest_path,
                active_output_path,
                active_manifest_path,
            )

        demo_summary = summarize_parquet(demo_parquet_path)
        LOGGER.info(
            "demo rows: %s across %s pitchers",
            demo_summary.get("row_count", 0),
            demo_summary.get("pitcher_count", 0),
        )
        LOGGER.info("demo manifest: %s", demo_manifest_path)
    except Exception as exc:
        LOGGER.error("failed to prepare demo cache: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
