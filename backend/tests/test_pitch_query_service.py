import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.pitch_query_service import (
    _build_pitch_heatmap_query,
    _build_pitch_query,
    _duckdb_string_literal,
)


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
            "AND balls = ? AND strikes = ? AND (LOWER(player_name) LIKE ?) "
            "AND release_speed >= ? "
            "AND release_speed <= ? ORDER BY game_date DESC LIMIT ?",
        )
        self.assertEqual(
            params,
            [605400, 2024, "FF", 1, 2, "%skubal%", 95.0, 101.0, 25],
        )

    def test_pitcher_name_filter_matches_display_order(self):
        query, params = _build_pitch_query({"pitcher_name": "Kevin Gausman", "limit": 25})

        self.assertEqual(
            query,
            "SELECT * FROM statcast_pitches "
            "WHERE (LOWER(player_name) LIKE ? OR LOWER(player_name) LIKE ?) "
            "ORDER BY game_date DESC LIMIT ?",
        )
        self.assertEqual(params, ["%kevin gausman%", "%gausman, kevin%", 25])

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

    def test_builds_query_for_count_group(self):
        query, params = _build_pitch_query({"count_group": "ahead", "limit": 25})

        self.assertEqual(
            query,
            "SELECT * FROM statcast_pitches WHERE strikes > balls ORDER BY game_date DESC LIMIT ?",
        )
        self.assertEqual(params, [25])

    def test_builds_query_for_pitch_type_group(self):
        query, params = _build_pitch_query({"pitch_type_group": "fastball", "limit": 25})

        self.assertEqual(
            query,
            "SELECT * FROM statcast_pitches WHERE pitch_type IN (?, ?, ?, ?) "
            "ORDER BY game_date DESC LIMIT ?",
        )
        self.assertEqual(params, ["FF", "SI", "FC", "FA", 25])

    def test_escapes_duckdb_string_literals(self):
        self.assertEqual(
            _duckdb_string_literal("C:/relay/o'clock.parquet"),
            "'C:/relay/o''clock.parquet'",
        )

    def test_builds_heatmap_query_with_supported_filters(self):
        query, params, domain = _build_pitch_heatmap_query(
            {
                "pitcher_id": 605400,
                "pitch_type": "FF",
                "batter_hand": "R",
            },
            x_bins=25,
            z_bins=25,
        )

        self.assertIn("GROUP BY x_bin, z_bin", query)
        self.assertIn("pitcher = ? AND pitch_type = ? AND stand = ?", query)
        self.assertIn("plate_x >= ? AND plate_x < ?", query)
        self.assertEqual(
            params,
            [-2.5, 0.2, 0.0, 0.2, 605400, "FF", "R", -2.5, 2.5, 0.0, 5.0],
        )
        self.assertEqual(domain["x_min"], -2.5)
        self.assertEqual(domain["z_max"], 5.0)

    def test_builds_heatmap_query_for_whiffs_mode(self):
        query, _params, _domain = _build_pitch_heatmap_query({}, x_bins=25, z_bins=25, mode="whiffs")

        self.assertIn(
            "description IN ('swinging_strike', 'swinging_strike_blocked', 'missed_bunt')",
            query,
        )

    def test_builds_heatmap_query_for_hard_contact_mode(self):
        query, _params, _domain = _build_pitch_heatmap_query(
            {},
            x_bins=25,
            z_bins=25,
            mode="hard_contact",
        )

        self.assertIn("launch_speed >= 95", query)


if __name__ == "__main__":
    unittest.main()
