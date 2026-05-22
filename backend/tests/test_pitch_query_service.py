import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.pitch_query_service import _build_pitch_query, _duckdb_string_literal


class PitchQueryServiceTests(unittest.TestCase):
    def test_builds_parameterized_query_for_supported_filters(self):
        query, params = _build_pitch_query(
            {
                "pitcher_id": 605400,
                "pitcher_name": "skubal",
                "season": 2024,
                "pitch_type": "FF",
                "balls": 1,
                "strikes": 2,
                "min_velocity": 95.0,
                "max_velocity": 101.0,
                "limit": 25,
            }
        )

        self.assertEqual(
            query,
            "SELECT * FROM statcast_pitches "
            "WHERE pitcher = ? AND game_year = ? AND pitch_type = ? "
            "AND balls = ? AND strikes = ? AND LOWER(player_name) LIKE ? "
            "AND release_speed >= ? "
            "AND release_speed <= ? ORDER BY game_date DESC LIMIT ?",
        )
        self.assertEqual(
            params,
            [605400, 2024, "FF", 1, 2, "%skubal%", 95.0, 101.0, 25],
        )

    def test_defaults_to_limit_100(self):
        query, params = _build_pitch_query({})

        self.assertEqual(
            query,
            "SELECT * FROM statcast_pitches ORDER BY game_date DESC LIMIT ?",
        )
        self.assertEqual(params, [100])

    def test_can_disable_limit(self):
        query, params = _build_pitch_query({"limit": None})

        self.assertEqual(query, "SELECT * FROM statcast_pitches ORDER BY game_date DESC")
        self.assertEqual(params, [])

    def test_escapes_duckdb_string_literals(self):
        self.assertEqual(
            _duckdb_string_literal("C:/relay/o'clock.parquet"),
            "'C:/relay/o''clock.parquet'",
        )


if __name__ == "__main__":
    unittest.main()
