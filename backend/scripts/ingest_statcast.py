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
        type=int,
        help="Pitcher MLBAM ID.",
    )
    parser.add_argument(
        "--pitcher-name",
        help='Pitcher name, such as "Aaron Nola" or "Nola, Aaron".',
    )
    parser.add_argument(
        "--output",
        default="../data/statcast.parquet",
        help="Output parquet path.",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Merge fetched rows with the existing output parquet.",
    )
    args = parser.parse_args()
    if args.pitcher_id is None and not args.pitcher_name:
        parser.error("one of --pitcher-id or --pitcher-name is required")
    return args


def parse_pitcher_name(pitcher_name: str) -> tuple[str, str]:
    normalized_name = " ".join(pitcher_name.strip().split())
    if not normalized_name:
        raise ValueError("pitcher name cannot be empty")

    if "," in normalized_name:
        last_name, first_name = [part.strip() for part in normalized_name.split(",", 1)]
    else:
        name_parts = normalized_name.split()
        if len(name_parts) < 2:
            raise ValueError("pitcher name must include first and last name")
        first_name = " ".join(name_parts[:-1])
        last_name = name_parts[-1]

    if not first_name or not last_name:
        raise ValueError("pitcher name must include first and last name")

    return last_name, first_name


def resolve_pitcher_id(pitcher_name: str) -> int:
    try:
        from pybaseball import playerid_lookup
    except ImportError as exc:
        raise RuntimeError(
            "pybaseball is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    last_name, first_name = parse_pitcher_name(pitcher_name)
    players = playerid_lookup(last_name, first_name)
    if players.empty:
        raise RuntimeError(f"no MLBAM player found for pitcher name: {pitcher_name}")

    players = players.dropna(subset=["key_mlbam"])
    if players.empty:
        raise RuntimeError(f"no MLBAM ID found for pitcher name: {pitcher_name}")

    active_players = players[players.get("mlb_played_last", 0).fillna(0) >= 2015]
    match = active_players.iloc[0] if not active_players.empty else players.iloc[0]

    return int(match["key_mlbam"])


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


def save_parquet(dataframe, output_path: Path, append: bool = False) -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError(
            "duckdb is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    escaped_output = output_path.as_posix().replace("'", "''")

    with duckdb.connect() as connection:
        connection.register("new_statcast_data", dataframe)
        if append and output_path.exists():
            connection.execute(
                f"CREATE TEMP TABLE existing_statcast_data AS "
                f"SELECT * FROM read_parquet('{escaped_output}')"
            )
            connection.execute(
                "CREATE TEMP TABLE statcast_data AS "
                "SELECT * FROM existing_statcast_data "
                "UNION BY NAME "
                "SELECT * FROM new_statcast_data"
            )
        else:
            connection.execute(
                "CREATE TEMP TABLE statcast_data AS SELECT * FROM new_statcast_data"
            )

        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info('statcast_data')").fetchall()
        }
        dedupe_columns = [
            column
            for column in [
                "game_pk",
                "at_bat_number",
                "pitch_number",
                "pitcher",
                "batter",
                "game_date",
            ]
            if column in columns
        ]

        if dedupe_columns:
            partition_by = ", ".join(dedupe_columns)
            connection.execute(
                "CREATE TEMP TABLE deduped_statcast_data AS "
                "SELECT * EXCLUDE relay_row_number FROM ("
                "SELECT *, row_number() OVER ("
                f"PARTITION BY {partition_by} ORDER BY game_date DESC"
                ") AS relay_row_number "
                "FROM statcast_data"
                ") WHERE relay_row_number = 1"
            )
        else:
            connection.execute(
                "CREATE TEMP TABLE deduped_statcast_data AS SELECT * FROM statcast_data"
            )

        row_count = connection.execute(
            "SELECT count(*) FROM deduped_statcast_data"
        ).fetchone()[0]
        connection.execute(
            f"COPY deduped_statcast_data TO '{escaped_output}' (FORMAT PARQUET)"
        )
        return row_count


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()

    if args.start_date > args.end_date:
        LOGGER.error("start date must be before or equal to end date")
        return 1

    output_path = Path(args.output)
    pitcher_id = args.pitcher_id

    LOGGER.info("date range: %s to %s", args.start_date, args.end_date)
    LOGGER.info("append mode: %s", args.append)

    try:
        if pitcher_id is None:
            LOGGER.info("pitcher name: %s", args.pitcher_name)
            pitcher_id = resolve_pitcher_id(args.pitcher_name)

        LOGGER.info("pitcher id: %s", pitcher_id)

        data = fetch_statcast_pitcher(args.start_date, args.end_date, pitcher_id)
        LOGGER.info("fetched row count: %s", len(data))

        saved_row_count = save_parquet(data, output_path, append=args.append)
        LOGGER.info("saved row count: %s", saved_row_count)
        LOGGER.info("output path: %s", output_path)
    except Exception as exc:
        LOGGER.error("failed to ingest Statcast data: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
