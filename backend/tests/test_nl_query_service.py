import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.nl_query_service import RuleBasedQueryIntentParser, validate_skill_call


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
                "pitch_type_group": "fastball",
                "min_velocity": 99.0,
                "strikes": 2,
            },
        )
        self.assertEqual(result["warnings"], [])

    def test_parses_left_handed_hitters_phrase(self):
        result = self.parser().parse("Skenes fastballs over 97 to left handed hitters")

        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Paul Skenes",
                "pitch_type_group": "fastball",
                "min_velocity": 97.0,
                "batter_hand": "L",
            },
        )

    def test_parses_batter_hand_variants(self):
        cases = [
            ("Nola sinkers facing left-handed batters", "L"),
            ("Nola sinkers against LHH", "L"),
            ("Nola sinkers to right handed hitters", "R"),
            ("Nola sinkers vs RHH", "R"),
        ]

        for query, expected_hand in cases:
            with self.subTest(query=query):
                self.assertEqual(self.parser().parse(query)["args"]["batter_hand"], expected_hand)

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

    def test_parses_pitch_families_and_specific_fastballs(self):
        self.assertEqual(
            self.parser().parse("Bradish fastballs")["args"].get("pitch_type_group"),
            "fastball",
        )
        self.assertEqual(
            self.parser().parse("Bradish breaking balls")["args"].get("pitch_type_group"),
            "breaking",
        )
        self.assertEqual(
            self.parser().parse("Bradish offspeed")["args"].get("pitch_type_group"),
            "offspeed",
        )
        self.assertEqual(
            self.parser().parse("Bradish four seam fastballs")["args"].get("pitch_type"),
            "FF",
        )

    def test_parses_hyphen_velocity_range_base_state_and_location(self):
        result = self.parser().parse("Nola heaters 94-97 mph with runners on out of the zone")

        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Aaron Nola",
                "pitch_type": "FF",
                "min_velocity": 94.0,
                "max_velocity": 97.0,
                "base_state": "runners_on",
                "location_filter": "out_of_zone",
            },
        )

    def test_parses_count_groups(self):
        cases = [
            ("Skenes heaters ahead in the count", "ahead"),
            ("Skenes heaters behind in the count", "behind"),
            ("Skenes heaters even counts", "even"),
            ("Skenes heaters two-strike counts", "two_strikes"),
        ]

        for query, expected_group in cases:
            with self.subTest(query=query):
                self.assertEqual(self.parser().parse(query)["args"]["count_group"], expected_group)

    def test_parses_more_result_words(self):
        cases = [
            ("Skenes heaters swing and miss", {"description": "swinging_strike"}),
            ("Skenes heaters taken strikes", {"description": "called_strike"}),
            ("Skenes heaters put in play", {"description": "hit_into_play"}),
            ("Skenes heaters walks", {"events": "walk"}),
        ]

        for query, expected in cases:
            with self.subTest(query=query):
                self.assertEqual(self.parser().parse(query)["args"] | expected, self.parser().parse(query)["args"])

    def test_reports_missing_unique_pitcher(self):
        result = self.parser().parse("show fastballs over 99")

        self.assertEqual(result["args"], {"pitch_type_group": "fastball", "min_velocity": 99.0})
        self.assertEqual(result["warnings"], ["No unique cached pitcher name was found."])

    def test_routes_heatmap_queries(self):
        result = self.parser().parse("Skenes hard contact heatmap for fastballs vs righties")

        self.assertEqual(result["skill"], "get_pitch_heatmap")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Paul Skenes",
                "pitch_type_group": "fastball",
                "batter_hand": "R",
                "focus": "heatmap",
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

    def test_routes_explicit_year_so_far_comparison(self):
        current_year = __import__("datetime").date.today().year
        previous_year = current_year - 1
        result = self.parser().parse(
            f"Compare tarik skubal in {previous_year} to {current_year} so far"
        )

        self.assertEqual(result["skill"], "compare_pitcher_periods")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Tarik Skubal",
                "period_a_season": previous_year,
                "period_b_season": current_year,
                "period_b_to_date": True,
                "preset": "previous_current_season",
            },
        )
        self.assertEqual(result["warnings"], [])

    def test_routes_arsenal_queries(self):
        result = self.parser().parse("Skubal arsenal usage in 2025 vs lefties")

        self.assertEqual(result["skill"], "summarize_arsenal")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Tarik Skubal",
                "season": 2025,
                "batter_hand": "L",
                "focus": "arsenal",
            },
        )

    def test_parses_relative_season_words(self):
        this_season = self.parser().parse("Skenes fastballs this season")["args"]["season"]
        this_year = self.parser().parse("Skenes fastballs this year")["args"]["season"]
        last_season = self.parser().parse("Skenes fastballs last season")["args"]["season"]
        last_year = self.parser().parse("Skenes fastballs last year")["args"]["season"]

        self.assertEqual(this_year, this_season)
        self.assertEqual(last_season, this_season - 1)
        self.assertEqual(last_year, this_season - 1)

    def test_parses_this_year_heatmap_query(self):
        result = self.parser().parse("heatmap for Skenes curveballs this year")

        self.assertEqual(result["skill"], "get_pitch_heatmap")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Paul Skenes",
                "pitch_type": "CU",
                "season": __import__("datetime").date.today().year,
                "focus": "heatmap",
                "mode": "all",
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
                "focus": "movement",
            },
        )

    def test_routes_profile_queries(self):
        result = self.parser().parse("show Skubal 2024 slider profile")

        self.assertEqual(result["skill"], "open_pitcher_profile")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Tarik Skubal",
                "pitch_type": "SL",
                "season": 2024,
            },
        )

    def test_routes_pitcher_only_queries_to_profile(self):
        result = self.parser().parse("Skubal")

        self.assertEqual(result["skill"], "open_pitcher_profile")
        self.assertEqual(result["args"], {"pitcher_name": "Tarik Skubal"})

    def test_routes_pitcher_overview_queries_to_profile(self):
        result = self.parser().parse("give me a general overview for Nola in 2024")

        self.assertEqual(result["skill"], "open_pitcher_profile")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Aaron Nola",
                "season": 2024,
            },
        )

    def test_keeps_pitch_location_queries_in_explorer(self):
        result = self.parser().parse("show Skubal pitch locations")

        self.assertEqual(result["skill"], "search_pitches")
        self.assertEqual(
            result["args"],
            {
                "pitcher_name": "Tarik Skubal",
                "focus": "strike_zone",
            },
        )

    def test_parses_result_focus_for_search_views(self):
        table_result = self.parser().parse("show Skenes fastballs over 99 as a table")
        strike_zone_result = self.parser().parse("show Skenes pitch locations")
        arsenal_result = self.parser().parse("show Skubal pitch mix")

        self.assertEqual(table_result["args"]["focus"], "table")
        self.assertEqual(strike_zone_result["args"]["focus"], "strike_zone")
        self.assertEqual(arsenal_result["args"]["focus"], "arsenal")

    def test_parses_result_focus_for_compare_views(self):
        movement_result = self.parser().parse("compare Nola previous season vs current season movement")
        table_result = self.parser().parse("compare Nola previous season vs current season diff table")
        heatmap_result = self.parser().parse("compare Nola previous season vs current season delta heatmap")

        self.assertEqual(movement_result["args"]["focus"], "movement_diff")
        self.assertEqual(table_result["args"]["focus"], "comparison_table")
        self.assertEqual(heatmap_result["args"]["focus"], "location_delta")

    def test_validation_drops_unsupported_args(self):
        result = validate_skill_call(
            {
                "skill": "search_pitches",
                "args": {
                    "pitcher_name": "Paul Skenes",
                    "raw_sql": "select * from statcast_pitches",
                },
                "warnings": [],
                "parser": "model",
            }
        )

        self.assertEqual(result.skill, "search_pitches")
        self.assertEqual(result.args, {"pitcher_name": "Paul Skenes"})
        self.assertEqual(
            result.warnings,
            ["Ignored unsupported args for search_pitches: raw_sql."],
        )


if __name__ == "__main__":
    unittest.main()
