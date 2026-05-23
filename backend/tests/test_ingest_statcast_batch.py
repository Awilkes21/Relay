import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path


try:
    import duckdb
    import pandas as pd
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"Batch ingestion test dependency is not installed: {exc}") from exc


BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from ingest_statcast_batch import (
    build_manifest,
    summarize_dataframe,
    summarize_parquet,
    unique_preserving_order,
    write_manifest,
)


class IngestStatcastBatchTests(unittest.TestCase):
    def test_unique_preserving_order(self):
        self.assertEqual(unique_preserving_order([1, 2, 1, 3, 2]), [1, 2, 3])

    def test_summarize_dataframe_ignores_unknown_pitch_types(self):
        dataframe = pd.DataFrame(
            [
                {
                    "pitcher": 605400,
                    "player_name": "Nola, Aaron",
                    "game_date": "2024-04-01",
                    "pitch_type": "FF",
                },
                {
                    "pitcher": 605400,
                    "player_name": "Nola, Aaron",
                    "game_date": "2024-04-02",
                    "pitch_type": "UN",
                },
            ]
        )

        summary = summarize_dataframe(dataframe, 605400, requested_name="Aaron Nola")

        self.assertEqual(summary["pitcher_id"], 605400)
        self.assertEqual(summary["requested_name"], "Aaron Nola")
        self.assertEqual(summary["row_count"], 2)
        self.assertEqual(summary["player_name"], "Nola, Aaron")
        self.assertEqual(summary["pitch_types"], ["FF"])

    def test_summarize_parquet_indexes_cache(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 605400 AS pitcher, 'Nola, Aaron' AS player_name, "
                "DATE '2024-04-01' AS game_date, 'FF' AS pitch_type "
                "UNION ALL "
                "SELECT 605400 AS pitcher, 'Nola, Aaron' AS player_name, "
                "DATE '2024-04-02' AS game_date, 'UN' AS pitch_type "
                "UNION ALL "
                "SELECT 669373 AS pitcher, 'Skubal, Tarik' AS player_name, "
                "DATE '2024-04-03' AS game_date, 'SL' AS pitch_type"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )

            summary = summarize_parquet(parquet_path)

        self.assertTrue(summary["exists"])
        self.assertEqual(summary["row_count"], 2)
        self.assertEqual(summary["pitcher_count"], 2)
        self.assertEqual(summary["pitch_types"], ["FF", "SL"])
        self.assertEqual(
            [(pitcher["pitcher_id"], pitcher["row_count"]) for pitcher in summary["pitchers"]],
            [(605400, 1), (669373, 1)],
        )
        self.assertIn("data_quality", summary)

    def test_builds_and_writes_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            manifest_path = Path(temp_dir) / "statcast_manifest.json"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 605400 AS pitcher, 'Nola, Aaron' AS player_name, "
                "DATE '2024-04-01' AS game_date, 'FF' AS pitch_type"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )

            manifest = build_manifest(
                parquet_path,
                manifest_path,
                date(2024, 4, 1),
                date(2024, 4, 30),
                [{"pitcher_id": 605400, "row_count": 1, "status": "ok"}],
                replace=False,
            )
            write_manifest(manifest_path, manifest)

            self.assertTrue(manifest_path.exists())
            self.assertEqual(manifest["cache"]["row_count"], 1)
            self.assertEqual(manifest["date_range"]["start"], "2024-04-01")
            self.assertIn("data_quality", manifest["cache"])


if __name__ == "__main__":
    unittest.main()
