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


class NaturalLanguageQueryApiTests(unittest.TestCase):
    def test_post_query_returns_skill_call(self):
        payload = {
            "skill": "get_pitch_heatmap",
            "args": {
                "pitcher_name": "Paul Skenes",
                "pitch_type": "FF",
                "mode": "whiffs",
            },
            "warnings": [],
            "parser": "rule_based",
        }

        with patch("app.api.nl_query.parse_natural_language_query", return_value=payload) as parse:
            response = TestClient(app).post(
                "/query",
                json={"query": "show Skenes fastball whiff heatmap"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)
        parse.assert_called_once_with("show Skenes fastball whiff heatmap")

    def test_query_requires_text(self):
        response = TestClient(app).post("/query", json={"query": ""})

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
