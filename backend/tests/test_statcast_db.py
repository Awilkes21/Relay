import json
import sys
import tempfile
import unittest
from pathlib import Path


try:
    import duckdb
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"DuckDB test dependency is not installed: {exc}") from exc


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db.statcast import data_quality_report, get_statcast_cache_metadata, statcast_connection


class StatcastDbTests(unittest.TestCase):
    def test_statcast_view_excludes_unknown_pitch_types(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 'FF' AS pitch_type, 1 AS pitch_id "
                "UNION ALL "
                "SELECT 'UN' AS pitch_type, 2 AS pitch_id "
                "UNION ALL "
                "SELECT 'Unknown' AS pitch_type, 3 AS pitch_id "
                "UNION ALL "
                "SELECT NULL AS pitch_type, 4 AS pitch_id"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )

            with statcast_connection(parquet_path) as connection:
                rows = connection.execute(
                    "SELECT pitch_type, pitch_id FROM statcast_pitches ORDER BY pitch_id"
                ).fetchall()

        self.assertEqual(rows, [("FF", 1)])

    def test_data_quality_report_uses_expected_denominators(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 'FF' AS pitch_type, 1 AS pitch_id, 45.0 AS arm_angle, "
                "2400 AS release_spin_rate, 0.5 AS pfx_x, 1.2 AS pfx_z, "
                "0.1 AS plate_x, 2.5 AS plate_z, 'called_strike' AS description, "
                "NULL AS launch_speed, NULL AS launch_angle "
                "UNION ALL "
                "SELECT 'SL' AS pitch_type, 2 AS pitch_id, NULL AS arm_angle, "
                "2500 AS release_spin_rate, NULL AS pfx_x, 0.4 AS pfx_z, "
                "NULL AS plate_x, 2.2 AS plate_z, 'hit_into_play' AS description, "
                "96.0 AS launch_speed, 12.0 AS launch_angle "
                "UNION ALL "
                "SELECT 'CH' AS pitch_type, 3 AS pitch_id, 42.0 AS arm_angle, "
                "NULL AS release_spin_rate, 0.2 AS pfx_x, 1.0 AS pfx_z, "
                "-0.1 AS plate_x, 2.8 AS plate_z, 'hit_into_play' AS description, "
                "NULL AS launch_speed, 20.0 AS launch_angle"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )

            with statcast_connection(parquet_path) as connection:
                report = data_quality_report(connection)

        metrics = {metric["key"]: metric for metric in report["metrics"]}
        self.assertEqual(report["pitch_count"], 3)
        self.assertEqual(metrics["arm_angle"]["available_count"], 2)
        self.assertEqual(metrics["spin"]["available_count"], 2)
        self.assertEqual(metrics["movement"]["available_count"], 2)
        self.assertEqual(metrics["plate_location"]["available_count"], 2)
        self.assertEqual(metrics["batted_ball"]["denominator_count"], 2)
        self.assertEqual(metrics["batted_ball"]["available_count"], 1)

    def test_cache_metadata_reads_matching_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            manifest_path = Path(temp_dir) / "statcast_manifest.json"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 'FF' AS pitch_type, 1 AS pitch_id, 605400 AS pitcher, "
                "DATE '2024-04-01' AS game_date, 2024 AS game_year"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )
            manifest_path.write_text(
                json.dumps(
                    {
                        "generated_at": "2026-01-01T00:00:00+00:00",
                        "output_path": str(parquet_path),
                        "date_range": {"start": "2024-04-01", "end": "2024-04-30"},
                        "cache": {
                            "exists": True,
                            "row_count": 99,
                            "pitcher_count": 3,
                            "first_game_date": "2024-04-01",
                            "last_game_date": "2024-04-30",
                            "seasons": [2024],
                            "pitch_types": ["FF", "SL"],
                            "data_quality": {"pitch_count": 99, "metrics": []},
                        },
                    }
                ),
                encoding="utf-8",
            )

            metadata = get_statcast_cache_metadata(parquet_path, manifest_path)

        self.assertEqual(metadata["source"], "manifest")
        self.assertEqual(metadata["pitch_count"], 99)
        self.assertEqual(metadata["pitcher_count"], 3)
        self.assertEqual(metadata["seasons"], [2024])
        self.assertEqual(metadata["manifest"]["path"], str(manifest_path))

    def test_cache_metadata_falls_back_when_manifest_is_invalid(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            manifest_path = Path(temp_dir) / "statcast_manifest.json"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 'FF' AS pitch_type, 1 AS pitch_id, 605400 AS pitcher, "
                "DATE '2024-04-01' AS game_date, 2024 AS game_year"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )
            manifest_path.write_text("{not-json", encoding="utf-8")

            metadata = get_statcast_cache_metadata(parquet_path, manifest_path)

        self.assertEqual(metadata["source"], "duckdb")
        self.assertEqual(metadata["pitch_count"], 1)
        self.assertEqual(metadata["pitcher_count"], 1)


if __name__ == "__main__":
    unittest.main()
