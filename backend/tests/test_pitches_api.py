import sys
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
except (ModuleNotFoundError, RuntimeError) as exc:
    raise unittest.SkipTest(f"FastAPI test dependencies are not installed: {exc}") from exc


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app


class PitchesApiTests(unittest.TestCase):
    def test_get_pitches_returns_count_and_compact_results(self):
        row = {
            "game_date": "2024-04-01",
            "player_name": "Example Pitcher",
            "pitcher": 605400,
            "batter": 123456,
            "pitch_type": "FF",
            "release_speed": 97.5,
            "release_spin_rate": 2450,
            "pfx_x": -0.75,
            "pfx_z": 1.42,
            "plate_x": -0.2,
            "plate_z": 2.6,
            "balls": 1,
            "strikes": 2,
            "description": "called_strike",
            "events": None,
            "extra_column": "ignored",
        }

        with patch(
            "app.api.pitches.search_pitches",
            return_value={"total_count": 42, "results": [row]},
        ) as search:
            response = TestClient(app).get(
                "/pitches",
                params={
                    "pitcher_id": 605400,
                    "pitcher_name": "skubal",
                    "season": 2024,
                    "pitch_type": "FF",
                    "balls": 1,
                    "strikes": 2,
                    "min_velocity": 95,
                    "max_velocity": 100,
                    "limit": 10,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "count": 1,
                "total_count": 42,
                "movement": {
                    "raw_pitch_fields": {
                        "pfx_x": "horizontal movement in feet from Statcast",
                        "pfx_z": "vertical movement in feet from Statcast",
                    },
                    "display": "Relay displays pfx_x and pfx_z as inches by multiplying by 12.",
                },
                "results": [
                    {
                        "game_date": "2024-04-01",
                        "player_name": "Example Pitcher",
                        "pitcher": 605400,
                        "batter": 123456,
                        "batter_name": None,
                        "p_throws": None,
                        "stand": None,
                        "pitch_type": "FF",
                        "release_speed": 97.5,
                        "release_spin_rate": 2450,
                        "release_pos_x": None,
                        "release_pos_z": None,
                        "pfx_x": -0.75,
                        "pfx_z": 1.42,
                        "plate_x": -0.2,
                        "plate_z": 2.6,
                        "launch_speed": None,
                        "launch_angle": None,
                        "bb_type": None,
                        "hit_distance_sc": None,
                        "estimated_ba_using_speedangle": None,
                        "estimated_woba_using_speedangle": None,
                        "woba_value": None,
                        "balls": 1,
                        "strikes": 2,
                        "description": "called_strike",
                        "events": None,
                        "on_1b": None,
                        "on_2b": None,
                        "on_3b": None,
                    }
                ],
            },
        )
        search.assert_called_once_with(
            {
                "pitcher_id": 605400,
                "pitcher_name": "skubal",
                "season": 2024,
                "start_date": None,
                "end_date": None,
                "pitch_type": "FF",
                "balls": 1,
                "strikes": 2,
                "min_velocity": 95.0,
                "max_velocity": 100.0,
                "batter_hand": None,
                "description": None,
                "events": None,
                "base_state": None,
                "location_filter": None,
                "result_order": "latest",
                "limit": 10,
            }
        )

    def test_rejects_invalid_velocity_range(self):
        response = TestClient(app).get(
            "/pitches",
            params={"min_velocity": 100, "max_velocity": 90},
        )

        self.assertEqual(response.status_code, 422)

    def test_get_pitch_heatmap_uses_same_filters(self):
        heatmap = {
            "mode": "whiffs",
            "x_bins": 25,
            "z_bins": 25,
            "domain": {"x_min": -2.5, "x_max": 2.5, "z_min": 0.0, "z_max": 5.0},
            "total_count": 12,
            "max_count": 4,
            "cells": [
                {
                    "x_bin": 10,
                    "z_bin": 14,
                    "x_start": -0.5,
                    "x_end": -0.3,
                    "z_start": 2.8,
                    "z_end": 3.0,
                    "count": 4,
                    "density": 1.0,
                }
            ],
        }

        with patch("app.api.pitches.get_pitch_heatmap", return_value=heatmap) as get_heatmap:
            response = TestClient(app).get(
                "/pitches/heatmap",
                params={
                    "pitcher_id": 605400,
                    "pitcher_name": "skubal",
                    "season": 2024,
                    "pitch_type": "FF",
                    "balls": 1,
                    "strikes": 2,
                    "batter_hand": "R",
                    "x_bins": 25,
                    "z_bins": 25,
                    "mode": "whiffs",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), heatmap)
        get_heatmap.assert_called_once_with(
            {
                "pitcher_id": 605400,
                "pitcher_name": "skubal",
                "season": 2024,
                "start_date": None,
                "end_date": None,
                "pitch_type": "FF",
                "balls": 1,
                "strikes": 2,
                "min_velocity": None,
                "max_velocity": None,
                "batter_hand": "R",
                "description": None,
                "events": None,
                "base_state": None,
                "location_filter": None,
            },
            x_bins=25,
            z_bins=25,
            mode="whiffs",
        )

    def test_pitch_options_use_context_but_ignore_velocity_bounds(self):
        options = {
            "seasons": [2024],
            "game_dates": [],
            "pitch_types": ["FF"],
            "batter_hands": ["R"],
            "descriptions": [],
            "events": [],
            "velocity": {"min": 94.2, "max": 98.7},
        }

        with patch("app.api.pitches.list_pitch_filter_options", return_value=options) as list_options:
            response = TestClient(app).get(
                "/pitch-options",
                params={
                    "pitcher_name": "skubal",
                    "season": 2024,
                    "pitch_type": "FF",
                    "start_date": "2024-04-01",
                    "end_date": "2024-04-15",
                    "min_velocity": 95,
                    "max_velocity": 100,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), options)
        list_options.assert_called_once_with(
            {
                "pitcher_id": None,
                "pitcher_name": "skubal",
                "season": 2024,
                "start_date": "2024-04-01",
                "end_date": "2024-04-15",
                "pitch_type": "FF",
                "balls": None,
                "strikes": None,
                "min_velocity": None,
                "max_velocity": None,
                "batter_hand": None,
                "description": None,
                "events": None,
                "base_state": None,
                "location_filter": None,
            }
        )


if __name__ == "__main__":
    unittest.main()
