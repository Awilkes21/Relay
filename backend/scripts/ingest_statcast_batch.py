import argparse
import logging
import sys
from datetime import date
from pathlib import Path

from ingest_statcast import fetch_statcast_pitcher, resolve_pitcher_id, save_parquet


LOGGER = logging.getLogger("relay.ingest_statcast_batch")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Statcast data for multiple pitchers into one parquet cache."
    )
    parser.add_argument("--start-date", required=True, type=date.fromisoformat)
    parser.add_argument("--end-date", required=True, type=date.fromisoformat)
    parser.add_argument("--pitcher-id", action="append", type=int, default=[])
    parser.add_argument("--pitcher-name", action="append", default=[])
    parser.add_argument("--output", default="../data/statcast.parquet")
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()

    if args.start_date > args.end_date:
        LOGGER.error("start date must be before or equal to end date")
        return 1
    if not args.pitcher_id and not args.pitcher_name:
        LOGGER.error("at least one --pitcher-id or --pitcher-name is required")
        return 1

    output_path = Path(args.output)
    pitcher_ids = list(args.pitcher_id)

    try:
        for pitcher_name in args.pitcher_name:
            LOGGER.info("resolving pitcher name: %s", pitcher_name)
            pitcher_ids.append(resolve_pitcher_id(pitcher_name))

        for index, pitcher_id in enumerate(dict.fromkeys(pitcher_ids)):
            LOGGER.info("ingesting pitcher id: %s", pitcher_id)
            data = fetch_statcast_pitcher(args.start_date, args.end_date, pitcher_id)
            LOGGER.info("fetched row count: %s", len(data))
            saved_count = save_parquet(
                data,
                output_path,
                append=index > 0 or output_path.exists(),
            )
            LOGGER.info("saved row count: %s", saved_count)

        LOGGER.info("output path: %s", output_path)
    except Exception as exc:
        LOGGER.error("failed to ingest Statcast batch: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
