import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path


try:
    import duckdb
    import pandas as pd
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"Ingestion test dependencies are not installed: {exc}") from exc


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

from ingest_statcast import filter_game_types, parse_pitcher_name, save_parquet
from ingest_statcast import fetch_statcast_pitcher, resolve_pitcher_id


class FakeStatcastProvider:
    def resolve_pitcher_id(self, pitcher_name: str) -> int:
        self.resolved_pitcher_name = pitcher_name
        return 605400

    def fetch_pitcher_pitches(self, start_date: date, end_date: date, pitcher_id: int):
        self.fetch_args = (start_date, end_date, pitcher_id)
        return pd.DataFrame([{"pitcher": pitcher_id, "game_date": start_date.isoformat()}])


class IngestStatcastTests(unittest.TestCase):
    def test_parses_first_last_pitcher_name(self):
        self.assertEqual(parse_pitcher_name("Aaron Nola"), ("Nola", "Aaron"))

    def test_parses_last_comma_first_pitcher_name(self):
        self.assertEqual(parse_pitcher_name("Nola, Aaron"), ("Nola", "Aaron"))

    def test_ingestion_helpers_delegate_to_provider(self):
        provider = FakeStatcastProvider()

        pitcher_id = resolve_pitcher_id("Aaron Nola", provider)
        data = fetch_statcast_pitcher(
            date(2024, 4, 1),
            date(2024, 4, 2),
            pitcher_id,
            provider,
        )

        self.assertEqual(pitcher_id, 605400)
        self.assertEqual(provider.resolved_pitcher_name, "Aaron Nola")
        self.assertEqual(provider.fetch_args, (date(2024, 4, 1), date(2024, 4, 2), 605400))
        self.assertEqual(len(data), 1)

    def test_filter_game_types_defaults_to_regular_season(self):
        data = pd.DataFrame(
            [
                {"game_type": "R", "pitcher": 605400},
                {"game_type": "S", "pitcher": 605400},
            ]
        )

        filtered = filter_game_types(data, ("R",))

        self.assertEqual(filtered["game_type"].tolist(), ["R"])

    def test_filter_game_types_can_include_spring_training(self):
        data = pd.DataFrame(
            [
                {"game_type": "R", "pitcher": 605400},
                {"game_type": "S", "pitcher": 605400},
            ]
        )

        filtered = filter_game_types(data, ("R", "S"))

        self.assertEqual(filtered["game_type"].tolist(), ["R", "S"])

    def test_append_merges_and_dedupes_shared_cache(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "statcast.parquet"
            first_batch = pd.DataFrame(
                [
                    {
                        "game_pk": 1,
                        "at_bat_number": 1,
                        "pitch_number": 1,
                        "pitcher": 605400,
                        "batter": 1,
                        "game_date": "2024-04-01",
                        "pitch_type": "FF",
                    }
                ]
            )
            second_batch = pd.DataFrame(
                [
                    {
                        "game_pk": 1,
                        "at_bat_number": 1,
                        "pitch_number": 1,
                        "pitcher": 605400,
                        "batter": 1,
                        "game_date": "2024-04-01",
                        "pitch_type": "FF",
                    },
                    {
                        "game_pk": 2,
                        "at_bat_number": 1,
                        "pitch_number": 1,
                        "pitcher": 669373,
                        "batter": 2,
                        "game_date": "2024-04-02",
                        "pitch_type": "SL",
                    },
                ]
            )

            self.assertEqual(save_parquet(first_batch, output_path), 1)
            self.assertEqual(save_parquet(second_batch, output_path, append=True), 2)

            pitchers = duckdb.connect().execute(
                f"SELECT DISTINCT pitcher FROM read_parquet('{output_path.as_posix()}') "
                "ORDER BY pitcher"
            ).fetchall()

            self.assertEqual(pitchers, [(605400,), (669373,)])


if __name__ == "__main__":
    unittest.main()
