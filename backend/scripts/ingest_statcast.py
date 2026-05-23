import argparse
import logging
import sys
from datetime import date
from pathlib import Path

from statcast_provider import (
    StatcastProvider,
    get_statcast_provider,
    parse_pitcher_name,
)


LOGGER = logging.getLogger("relay.ingest_statcast")
DEFAULT_GAME_TYPES = ("R",)
SPRING_TRAINING_GAME_TYPE = "S"
GAME_TYPE_CHOICES = ("R", "S", "F", "D", "L", "W")
GAME_TYPE_LABELS = {
    "R": "regular season",
    "S": "spring training",
    "F": "wild card",
    "D": "division series",
    "L": "league championship",
    "W": "world series",
}


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
    parser.add_argument(
        "--provider",
        choices=["pybaseball"],
        default="pybaseball",
        help="Statcast data provider implementation.",
    )
    parser.add_argument(
        "--game-type",
        action="append",
        choices=GAME_TYPE_CHOICES,
        help=(
            "MLB game_type code to keep. Defaults to R regular-season games. "
            "Pass multiple times for multiple types."
        ),
    )
    parser.add_argument(
        "--include-spring-training",
        action="store_true",
        help="Include spring training games in addition to the selected game types.",
    )
    parser.add_argument(
        "--all-game-types",
        action="store_true",
        help="Keep every game_type returned by the provider.",
    )
    args = parser.parse_args()
    if args.pitcher_id is None and not args.pitcher_name:
        parser.error("one of --pitcher-id or --pitcher-name is required")
    return args


def resolve_pitcher_id(
    pitcher_name: str,
    provider: StatcastProvider | None = None,
) -> int:
    statcast_provider = provider or get_statcast_provider()
    return statcast_provider.resolve_pitcher_id(pitcher_name)


def fetch_statcast_pitcher(
    start_date: date,
    end_date: date,
    pitcher_id: int,
    provider: StatcastProvider | None = None,
):
    statcast_provider = provider or get_statcast_provider()
    return statcast_provider.fetch_pitcher_pitches(start_date, end_date, pitcher_id)


def selected_game_types(args: argparse.Namespace) -> tuple[str, ...] | None:
    if args.all_game_types:
        return None

    game_types = list(args.game_type or DEFAULT_GAME_TYPES)
    if args.include_spring_training:
        game_types.append(SPRING_TRAINING_GAME_TYPE)
    return tuple(dict.fromkeys(game_types))


def filter_game_types(dataframe, game_types: tuple[str, ...] | None):
    if game_types is None:
        return dataframe
    if "game_type" not in dataframe.columns:
        LOGGER.warning(
            "game_type column missing from provider data; keeping all fetched rows"
        )
        return dataframe
    return dataframe[dataframe["game_type"].isin(game_types)].copy()


def game_type_summary(game_types: tuple[str, ...] | None) -> str:
    if game_types is None:
        return "all"
    return ", ".join(f"{game_type} ({GAME_TYPE_LABELS.get(game_type, 'unknown')})" for game_type in game_types)


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
    provider = get_statcast_provider(args.provider)
    game_types = selected_game_types(args)

    LOGGER.info("date range: %s to %s", args.start_date, args.end_date)
    LOGGER.info("append mode: %s", args.append)
    LOGGER.info("provider: %s", args.provider)
    LOGGER.info("game types: %s", game_type_summary(game_types))

    try:
        if pitcher_id is None:
            LOGGER.info("pitcher name: %s", args.pitcher_name)
            pitcher_id = resolve_pitcher_id(args.pitcher_name, provider)

        LOGGER.info("pitcher id: %s", pitcher_id)

        data = fetch_statcast_pitcher(args.start_date, args.end_date, pitcher_id, provider)
        LOGGER.info("fetched row count: %s", len(data))
        data = filter_game_types(data, game_types)
        LOGGER.info("kept row count after game_type filter: %s", len(data))

        saved_row_count = save_parquet(data, output_path, append=args.append)
        LOGGER.info("saved row count: %s", saved_row_count)
        LOGGER.info("output path: %s", output_path)
    except Exception as exc:
        LOGGER.error("failed to ingest Statcast data: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
