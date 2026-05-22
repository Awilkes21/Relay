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

from app.services.pitch_compare_service import (
    _period_delta,
    _summarize_period,
    resolve_pitcher_id_from_cache,
)


class PitchCompareServiceTests(unittest.TestCase):
    def test_summarizes_pitch_usage_velocity_and_rates(self):
        summary = _summarize_period(
            [
                {
                    "pitch_type": "FF",
                    "release_speed": 96.0,
                    "release_spin_rate": 2400,
                    "pfx_z": 1.5,
                    "pfx_x": -0.75,
                    "description": "called_strike",
                    "plate_x": 0.0,
                    "plate_z": 2.5,
                },
                {
                    "pitch_type": "FF",
                    "release_speed": 98.0,
                    "release_spin_rate": 2600,
                    "pfx_z": 1.7,
                    "pfx_x": -0.5,
                    "description": "swinging_strike",
                    "plate_x": 1.5,
                    "plate_z": 2.5,
                },
                {
                    "pitch_type": "SL",
                    "release_speed": 86.0,
                    "release_spin_rate": 2500,
                    "pfx_z": 0.4,
                    "pfx_x": 0.25,
                    "description": "ball",
                    "plate_x": None,
                    "plate_z": None,
                },
            ]
        )

        self.assertEqual(summary["pitch_count"], 3)
        self.assertEqual(summary["pitch_usage"]["FF"]["count"], 2)
        self.assertAlmostEqual(summary["pitch_usage"]["FF"]["rate"], 2 / 3)
        self.assertEqual(summary["pitch_usage"]["SL"]["count"], 1)
        self.assertEqual(summary["average_velocity"]["FF"], 97.0)
        self.assertEqual(summary["average_velocity"]["SL"], 86.0)
        self.assertEqual(summary["average_spin_rate"]["FF"], 2500)
        self.assertEqual(summary["average_spin_rate"]["SL"], 2500)
        self.assertAlmostEqual(summary["average_induced_vertical_break"]["FF"], 19.2)
        self.assertEqual(summary["average_horizontal_break"]["SL"], 3.0)
        self.assertAlmostEqual(summary["strike_rate"], 2 / 3)
        self.assertAlmostEqual(summary["whiff_rate"], 1 / 3)
        self.assertAlmostEqual(summary["zone_rate"], 1 / 2)

    def test_builds_period_deltas(self):
        period_a = _summarize_period(
            [
                {
                    "pitch_type": "FF",
                    "release_speed": 96.0,
                    "release_spin_rate": 2400,
                    "pfx_z": 1.5,
                    "pfx_x": -0.75,
                    "description": "called_strike",
                    "plate_x": 0.0,
                    "plate_z": 2.5,
                }
            ]
        )
        period_b = _summarize_period(
            [
                {
                    "pitch_type": "FF",
                    "release_speed": 98.0,
                    "release_spin_rate": 2600,
                    "pfx_z": 1.75,
                    "pfx_x": -0.5,
                    "description": "ball",
                    "plate_x": 2.0,
                    "plate_z": 2.5,
                },
                {
                    "pitch_type": "SL",
                    "release_speed": 87.0,
                    "release_spin_rate": 2500,
                    "pfx_z": 0.5,
                    "pfx_x": 0.25,
                    "description": "swinging_strike",
                    "plate_x": 0.0,
                    "plate_z": 2.5,
                },
            ]
        )

        deltas = _period_delta(period_a, period_b)

        self.assertEqual(deltas["pitch_count"], 1)
        self.assertEqual(deltas["pitch_usage"]["FF"]["count"], 0)
        self.assertEqual(deltas["pitch_usage"]["SL"]["count"], 1)
        self.assertEqual(deltas["average_velocity"]["FF"], 2.0)
        self.assertIsNone(deltas["average_velocity"]["SL"])
        self.assertEqual(deltas["average_spin_rate"]["FF"], 200)
        self.assertEqual(deltas["average_induced_vertical_break"]["FF"], 3.0)
        self.assertEqual(deltas["average_horizontal_break"]["FF"], 3.0)
        self.assertEqual(deltas["strike_rate"], -0.5)
        self.assertEqual(deltas["whiff_rate"], 0.5)
        self.assertEqual(deltas["zone_rate"], -0.5)

    def test_resolves_pitcher_id_from_cached_name(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 605400 AS pitcher, 'Nola, Aaron' AS player_name "
                "UNION ALL "
                "SELECT 669373 AS pitcher, 'Skubal, Tarik' AS player_name"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )

            self.assertEqual(resolve_pitcher_id_from_cache("nola", parquet_path), 605400)


if __name__ == "__main__":
    unittest.main()
