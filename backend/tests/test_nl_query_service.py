import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.nl_query_service import RuleBasedQueryIntentParser


PITCHERS = [
    {"pitcher": 694973, "player_name": "Skenes, Paul"},
    {"pitcher": 605400, "player_name": "Nola, Aaron"},
    {"pitcher": 694297, "player_name": "Skubal, Tarik"},
]


class NaturalLanguageQueryServiceTests(unittest.TestCase):
    def parser(self) -> RuleBasedQueryIntentParser:
        return RuleBasedQueryIntentParser(pitcher_provider=lambda: PITCHERS)

    def test_parses_pitcher_pitch_type_velocity_and_strikes(self):
        result = self.parser().parse("show Skenes fastballs over 99 mph with two strikes")

        self.assertEqual(result["skill"], "search_pitches")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Paul Skenes",
                "pitch_type": "FF",
                "min_velocity": 99.0,
                "strikes": 2,
            },
        )
        self.assertEqual(result["warnings"], [])

    def test_parses_count_and_batter_hand(self):
        result = self.parser().parse("Nola cutters in a 3-2 count vs lefties")

        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Aaron Nola",
                "pitch_type": "FC",
                "balls": 3,
                "strikes": 2,
                "batter_hand": "L",
            },
        )

    def test_parses_velocity_range(self):
        result = self.parser().parse("Skubal sliders between 84 and 88 mph")

        self.assertEqual(result["args"]["pitcher_name"], "Tarik Skubal")
        self.assertEqual(result["args"]["pitch_type"], "SL")
        self.assertEqual(result["args"]["min_velocity"], 84.0)
        self.assertEqual(result["args"]["max_velocity"], 88.0)

    def test_reports_missing_unique_pitcher(self):
        result = self.parser().parse("show fastballs over 99")

        self.assertEqual(result["args"], {"pitch_type": "FF", "min_velocity": 99.0})
        self.assertEqual(result["warnings"], ["No unique cached pitcher name was found."])

    def test_routes_heatmap_queries(self):
        result = self.parser().parse("Skenes hard contact heatmap for fastballs vs righties")

        self.assertEqual(result["skill"], "get_pitch_heatmap")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Paul Skenes",
                "pitch_type": "FF",
                "batter_hand": "R",
                "mode": "hard_contact",
            },
        )

    def test_routes_comparison_queries_with_preset(self):
        result = self.parser().parse("compare Nola curveballs previous season vs current season same span")

        self.assertEqual(result["skill"], "compare_pitcher_periods")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Aaron Nola",
                "pitch_type": "CU",
                "preset": "previous_current_same_span",
            },
        )

    def test_routes_arsenal_queries(self):
        result = self.parser().parse("Skubal arsenal usage in 2025 vs lefties")

        self.assertEqual(result["skill"], "summarize_arsenal")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Tarik Skubal",
                "season": 2025,
                "batter_hand": "L",
            },
        )

    def test_routes_movement_queries(self):
        result = self.parser().parse("show Nola sinker movement profile")

        self.assertEqual(result["skill"], "summarize_movement")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Aaron Nola",
                "pitch_type": "SI",
            },
        )


if __name__ == "__main__":
    unittest.main()
