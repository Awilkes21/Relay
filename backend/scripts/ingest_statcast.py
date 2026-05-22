import argparse
import logging
import sys
from datetime import date
from pathlib import Path


LOGGER = logging.getLogger("relay.ingest_statcast")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Statcast pitch-level data for one pitcher and date range."
    )
    parser.add_argument(
        "--start-date",
        required=True,
        type=date.fromisoformat,
        help="Start date in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--end-date",
        required=True,
        type=date.fromisoformat,
        help="End date in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--pitcher-id",
        required=True,
        type=int,
        help="Pitcher MLBAM ID.",
    )
    parser.add_argument(
        "--output",
        default="data/statcast_sample.parquet",
        help="Output parquet path.",
    )
    return parser.parse_args()


def fetch_statcast_pitcher(start_date: date, end_date: date, pitcher_id: int):
    try:
        from pybaseball import statcast_pitcher
    except ImportError as exc:
        raise RuntimeError(
            "pybaseball is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    return statcast_pitcher(
        start_dt=start_date.isoformat(),
        end_dt=end_date.isoformat(),
        player_id=pitcher_id,
    )


def save_parquet(dataframe, output_path: Path) -> None:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    escaped_output = output_path.as_posix().replace("'", "''")

    with duckdb.connect() as connection:
        connection.register("statcast_data", dataframe)
        connection.execute(
            f"COPY statcast_data TO '{escaped_output}' (FORMAT PARQUET)"
        )


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()

    if args.start_date > args.end_date:
        LOGGER.error("start date must be before or equal to end date")
        return 1

    output_path = Path(args.output)

    LOGGER.info("date range: %s to %s", args.start_date, args.end_date)
    LOGGER.info("pitcher id: %s", args.pitcher_id)

    try:
        data = fetch_statcast_pitcher(args.start_date, args.end_date, args.pitcher_id)
        LOGGER.info("row count: %s", len(data))

        save_parquet(data, output_path)
        LOGGER.info("output path: %s", output_path)
    except Exception as exc:
        LOGGER.error("failed to ingest Statcast data: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
