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


class CompareApiTests(unittest.TestCase):
    def test_compare_pitcher_calls_service(self):
        payload = {
            "pitcher_id": 605400,
            "filters": {},
            "period_a": {"start": "2024-04-01", "end": "2024-04-07", "metrics": {}},
            "period_b": {"start": "2024-05-01", "end": "2024-05-07", "metrics": {}},
            "deltas": {},
        }

        with patch(
            "app.api.compare.compare_pitcher_periods",
            return_value=payload,
        ) as compare:
            response = TestClient(app).get(
                "/compare/pitcher",
                params={
                    "pitcher_id": 605400,
                    "a_start": "2024-04-01",
                    "a_end": "2024-04-07",
                    "b_start": "2024-05-01",
                    "b_end": "2024-05-07",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)
        compare.assert_called_once()

    def test_compare_pitcher_resolves_pitcher_name(self):
        payload = {
            "pitcher_id": 605400,
            "filters": {},
            "period_a": {"start": "2024-04-01", "end": "2024-04-07", "metrics": {}},
            "period_b": {"start": "2024-05-01", "end": "2024-05-07", "metrics": {}},
            "deltas": {},
        }

        with (
            patch("app.api.compare.resolve_pitcher_id_from_cache", return_value=605400),
            patch("app.api.compare.compare_pitcher_periods", return_value=payload),
        ):
            response = TestClient(app).get(
                "/compare/pitcher",
                params={
                    "pitcher_name": "Nola",
                    "a_start": "2024-04-01",
                    "a_end": "2024-04-07",
                    "b_start": "2024-05-01",
                    "b_end": "2024-05-07",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_compare_pitcher_requires_id_or_name(self):
        response = TestClient(app).get(
            "/compare/pitcher",
            params={
                "a_start": "2024-04-01",
                "a_end": "2024-04-07",
                "b_start": "2024-05-01",
                "b_end": "2024-05-07",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_compare_pitcher_rejects_reversed_period(self):
        response = TestClient(app).get(
            "/compare/pitcher",
            params={
                "pitcher_id": 605400,
                "a_start": "2024-04-07",
                "a_end": "2024-04-01",
                "b_start": "2024-05-01",
                "b_end": "2024-05-07",
            },
        )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
