import sys
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
except ModuleNotFoundError as exc:
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
            "plate_x": -0.2,
            "plate_z": 2.6,
            "balls": 1,
            "strikes": 2,
            "description": "called_strike",
            "events": None,
            "extra_column": "ignored",
        }

        with patch("app.api.pitches.search_pitches", return_value=[row]) as search:
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
                "results": [
                    {
                        "game_date": "2024-04-01",
                        "player_name": "Example Pitcher",
                        "pitcher": 605400,
                        "batter": 123456,
                        "pitch_type": "FF",
                        "release_speed": 97.5,
                        "plate_x": -0.2,
                        "plate_z": 2.6,
                        "balls": 1,
                        "strikes": 2,
                        "description": "called_strike",
                        "events": None,
                    }
                ],
            },
        )
        search.assert_called_once_with(
            {
                "pitcher_id": 605400,
                "pitcher_name": "skubal",
                "season": 2024,
                "pitch_type": "FF",
                "balls": 1,
                "strikes": 2,
                "min_velocity": 95.0,
                "max_velocity": 100.0,
                "limit": 10,
            }
        )

    def test_rejects_invalid_velocity_range(self):
        response = TestClient(app).get(
            "/pitches",
            params={"min_velocity": 100, "max_velocity": 90},
        )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
