import sys
import tempfile
import unittest
from pathlib import Path


try:
    import duckdb
    import pandas as pd
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"Ingestion test dependencies are not installed: {exc}") from exc


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

from ingest_statcast import parse_pitcher_name, save_parquet


class IngestStatcastTests(unittest.TestCase):
    def test_parses_first_last_pitcher_name(self):
        self.assertEqual(parse_pitcher_name("Aaron Nola"), ("Nola", "Aaron"))

    def test_parses_last_comma_first_pitcher_name(self):
        self.assertEqual(parse_pitcher_name("Nola, Aaron"), ("Nola", "Aaron"))

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
