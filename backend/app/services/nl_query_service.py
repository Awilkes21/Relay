import os
import re
from datetime import date
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.services.pitch_query_service import list_cached_pitchers


PITCH_TYPE_ALIASES = {
    "four seam fastball": "FF",
    "four-seam fastball": "FF",
    "four seam": "FF",
    "four-seamer": "FF",
    "four seamers": "FF",
    "four-seamers": "FF",
    "4 seam": "FF",
    "4-seam": "FF",
    "heaters": "FF",
    "heater": "FF",
    "sinkers": "SI",
    "sinker": "SI",
    "two seam": "SI",
    "two-seam": "SI",
    "2 seam": "SI",
    "2-seam": "SI",
    "sliders": "SL",
    "slider": "SL",
    "sweepers": "ST",
    "sweeper": "ST",
    "curveballs": "CU",
    "curveball": "CU",
    "curves": "CU",
    "curve": "CU",
    "knuckle curves": "KC",
    "knuckle curve": "KC",
    "changeups": "CH",
    "changeup": "CH",
    "change ups": "CH",
    "change up": "CH",
    "cutters": "FC",
    "cutter": "FC",
    "splitters": "FS",
    "splitter": "FS",
    "splits": "FS",
    "split": "FS",
}

PITCH_TYPE_GROUP_ALIASES = {
    "fastballs": "fastball",
    "fastball": "fastball",
    "hard stuff": "fastball",
    "breaking balls": "breaking",
    "breaking ball": "breaking",
    "breaking pitches": "breaking",
    "breaking pitch": "breaking",
    "breaking stuff": "breaking",
    "breakers": "breaking",
    "offspeed pitches": "offspeed",
    "offspeed pitch": "offspeed",
    "offspeed stuff": "offspeed",
    "offspeed": "offspeed",
}

NUMBER_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
}

SEARCH_SKILL = "search_pitches"
HEATMAP_SKILL = "get_pitch_heatmap"
COMPARE_SKILL = "compare_pitcher_periods"
ARSENAL_SKILL = "summarize_arsenal"
MOVEMENT_SKILL = "summarize_movement"
SkillName = Literal[
    "search_pitches",
    "get_pitch_heatmap",
    "compare_pitcher_periods",
    "summarize_arsenal",
    "summarize_movement",
]

COMMON_ARGS = {
    "pitcher_name": "Cached pitcher display name.",
    "pitch_type": "Statcast pitch code, such as FF, SL, CU, CH, SI, FC.",
    "pitch_type_group": "Pitch family: fastball, breaking, or offspeed.",
    "season": "Four-digit season.",
    "balls": "Exact ball count, 0-3.",
    "strikes": "Exact strike count, 0-2.",
    "count_group": "Count bucket: ahead, behind, even, two_strikes, full_count.",
    "min_velocity": "Minimum release velocity in mph.",
    "max_velocity": "Maximum release velocity in mph.",
    "batter_hand": "Batter handedness: L or R.",
    "description": "Statcast pitch result code.",
    "events": "Statcast plate appearance result code.",
    "base_state": "bases_empty or runners_on.",
    "location_filter": "zone or out_of_zone.",
    "focus": "Optional UI result focus: table, heatmap, movement, strike_zone, arsenal, summary.",
}

SKILL_REGISTRY: dict[str, dict[str, Any]] = {
    SEARCH_SKILL: {
        "description": "Find pitch-level rows matching filters.",
        "args": COMMON_ARGS,
    },
    HEATMAP_SKILL: {
        "description": "Build a pitch-location heatmap matching filters.",
        "args": {**COMMON_ARGS, "mode": "Heatmap mode: all, whiffs, hard_contact, in_zone."},
    },
    COMPARE_SKILL: {
        "description": "Compare one pitcher across two periods or a supported preset.",
        "args": {
            "pitcher_name": COMMON_ARGS["pitcher_name"],
            "pitch_type": COMMON_ARGS["pitch_type"],
            "batter_hand": COMMON_ARGS["batter_hand"],
            "preset": "Compare preset such as previous_current_season, previous_current_same_span, or season_first_second.",
            "period_a_season": "Four-digit season for Period 1.",
            "period_b_season": "Four-digit season for Period 2.",
            "period_b_to_date": "True when Period 2 should use available data so far.",
            "focus": "Optional UI result focus: summary, movement_diff, heatmap, location_delta, comparison_table, period_tables.",
        },
    },
    ARSENAL_SKILL: {
        "description": "Summarize pitch usage and arsenal shape for matching filters.",
        "args": COMMON_ARGS,
    },
    MOVEMENT_SKILL: {
        "description": "Summarize movement and pitch-shape metrics for matching filters.",
        "args": COMMON_ARGS,
    },
}


class SkillCall(BaseModel):
    skill: SkillName
    args: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    parser: str = "rule_based"

    def __getitem__(self, key: str) -> Any:
        return getattr(self, key)


class QueryContext(BaseModel):
    cached_pitchers: list[dict[str, Any]] = Field(default_factory=list)
    skill_registry: dict[str, dict[str, Any]] = Field(default_factory=lambda: SKILL_REGISTRY)


class IntentParser(Protocol):
    def parse(self, query: str, context: QueryContext | None = None) -> SkillCall:
        ...


def display_player_name(player_name: str) -> str:
    if "," not in player_name:
        return player_name
    last, first = [part.strip() for part in player_name.split(",", 1)]
    return f"{first} {last}".strip()


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower().replace("_", " ")).strip()


def _unique_pitcher_match(query: str, pitchers: list[dict[str, Any]]) -> str | None:
    normalized_query = _normalize(query)
    if not normalized_query:
        return None

    candidates: list[tuple[int, str]] = []
    for pitcher in pitchers:
        raw_name = str(pitcher.get("player_name") or "")
        display_name = display_player_name(raw_name)
        normalized_display = _normalize(display_name)
        tokens = normalized_display.split()

        if normalized_display in normalized_query:
            candidates.append((4, display_name))
        elif any(token in normalized_query for token in tokens if len(token) > 2):
            candidates.append((2, display_name))
        elif any(token.startswith(normalized_query) for token in tokens if len(normalized_query) > 2):
            candidates.append((1, display_name))

    if not candidates:
        return None

    top_score = max(score for score, _ in candidates)
    top_names = sorted({name for score, name in candidates if score == top_score})
    return top_names[0] if len(top_names) == 1 else None


class RuleBasedQueryIntentParser:
    """Translate limited baseball phrases into Relay skill arguments.

    This parser intentionally emits a small, allow-listed argument set instead
    of SQL or query fragments. A future SLM/LLM adapter should keep this same
    output contract and validation boundary.
    """

    def __init__(self, pitcher_provider=list_cached_pitchers) -> None:
        self.pitcher_provider = pitcher_provider

    def parse(self, query: str, context: QueryContext | None = None) -> SkillCall:
        normalized_query = _normalize(query)
        args: dict[str, Any] = {}
        warnings: list[str] = []

        if not normalized_query:
            return validate_skill_call({
                "skill": SEARCH_SKILL,
                "args": args,
                "warnings": ["Enter a query to translate."],
                "parser": "rule_based",
            })

        skill = self._parse_skill(normalized_query)
        cached_pitchers = context.cached_pitchers if context else self.pitcher_provider()
        pitcher_name = _unique_pitcher_match(normalized_query, cached_pitchers)
        if pitcher_name:
            args["pitcher_name"] = pitcher_name
        else:
            warnings.append("No unique cached pitcher name was found.")

        args.update(self._parse_common_filters(normalized_query))
        focus = self._parse_focus(normalized_query, skill)
        if focus:
            args["focus"] = focus

        if skill == HEATMAP_SKILL:
            args["mode"] = self._parse_heatmap_mode(normalized_query)
        elif skill == COMPARE_SKILL:
            args.update(self._parse_compare_periods(normalized_query))
            preset = self._parse_compare_preset(normalized_query)
            if preset:
                args["preset"] = preset
            elif not ("period_a_season" in args and "period_b_season" in args):
                warnings.append("No supported comparison preset was found.")
            args.pop("season", None)

        return validate_skill_call({
            "skill": skill,
            "args": args,
            "warnings": warnings,
            "parser": "rule_based",
        })

    def _parse_skill(self, query: str) -> str:
        if re.search(r"\b(compare|comparison|versus)\b", query):
            return COMPARE_SKILL
        if re.search(r"\b(heatmap|heat map|location map|zone map)\b", query):
            return HEATMAP_SKILL
        if re.search(r"\b(arsenal|pitch mix|usage|pitch usage)\b", query):
            return ARSENAL_SKILL
        if re.search(r"\b(movement|shape|break profile|pitch shape)\b", query):
            return MOVEMENT_SKILL
        return SEARCH_SKILL

    def _parse_focus(self, query: str, skill: str) -> str | None:
        """Parse the preferred UI surface without changing the data query.

        This is deliberately a display hint, not executable behavior. A future
        model-backed parser can emit the same allow-listed focus values.
        """
        is_compare = skill == COMPARE_SKILL

        if re.search(r"\b(diff table|comparison table|table|rows?|pitch list|pitch table)\b", query):
            return "comparison_table" if is_compare else "table"
        if re.search(r"\b(delta heatmap|delta heat map|location delta|heatmap difference|heat map difference)\b", query):
            return "location_delta"
        if re.search(r"\b(heatmap|heat map|location map|zone map)\b", query):
            return "heatmap"
        if re.search(r"\b(movement|movement chart|shape|break profile|pitch shape)\b", query):
            return "movement_diff" if is_compare else "movement"
        if re.search(r"\b(strike zone|zone chart|location scatter|pitch locations?)\b", query):
            return "strike_zone"
        if re.search(r"\b(arsenal|pitch mix|usage table|usage chart|pitch usage)\b", query):
            return "arsenal"
        if re.search(r"\b(summary|metric cards?|metrics?|data ?points?|datapoints?)\b", query):
            return "summary"
        return None

    def _parse_common_filters(self, query: str) -> dict[str, Any]:
        filters: dict[str, Any] = {}

        filters.update(self._parse_pitch_type_filter(query))

        season = self._parse_season(query)
        if season:
            filters["season"] = season

        filters.update(self._parse_count(query))
        filters.update(self._parse_velocity(query))
        filters.update(self._parse_batter_hand(query))
        filters.update(self._parse_base_state(query))
        filters.update(self._parse_location(query))
        filters.update(self._parse_result_filters(query))

        return filters

    def _parse_pitch_type(self, query: str) -> str | None:
        for phrase in sorted(PITCH_TYPE_ALIASES, key=len, reverse=True):
            if re.search(rf"\b{re.escape(phrase)}\b", query):
                return PITCH_TYPE_ALIASES[phrase]
        return None

    def _parse_pitch_type_filter(self, query: str) -> dict[str, str]:
        pitch_type = self._parse_pitch_type(query)
        if pitch_type:
            return {"pitch_type": pitch_type}

        for phrase in sorted(PITCH_TYPE_GROUP_ALIASES, key=len, reverse=True):
            if re.search(rf"\b{re.escape(phrase)}\b", query):
                return {"pitch_type_group": PITCH_TYPE_GROUP_ALIASES[phrase]}

        return {}

    def _parse_count(self, query: str) -> dict[str, Any]:
        count_match = re.search(r"\b([0-3])\s*[-/]\s*([0-2])\b", query)
        if count_match:
            return {
                "balls": int(count_match.group(1)),
                "strikes": int(count_match.group(2)),
            }

        if "full count" in query:
            return {"balls": 3, "strikes": 2}
        if re.search(r"\b(?:two[-\s]?strike|2[-\s]?strike)\s+counts?\b", query):
            return {"count_group": "two_strikes"}
        if re.search(r"\b(?:ahead|pitcher ahead)\s+(?:in\s+)?(?:the\s+)?count\b", query):
            return {"count_group": "ahead"}
        if re.search(r"\b(?:behind|pitcher behind)\s+(?:in\s+)?(?:the\s+)?count\b", query):
            return {"count_group": "behind"}
        if re.search(r"\beven\s+counts?\b|\beven\s+in\s+(?:the\s+)?count\b", query):
            return {"count_group": "even"}

        parsed: dict[str, int] = {}
        for key, max_value in {"balls": 3, "strikes": 2}.items():
            valid_words = "|".join(
                word for word, number in NUMBER_WORDS.items() if number <= max_value
            )
            singular = key[:-1]
            pattern = rf"\b([0-{max_value}]|{valid_words})\s+(?:{singular}|{key})\b"
            match = re.search(pattern, query)
            if match:
                value = match.group(1)
                parsed[key] = NUMBER_WORDS.get(value, int(value) if value.isdigit() else 0)

        return parsed

    def _parse_velocity(self, query: str) -> dict[str, float]:
        between_match = re.search(
            r"\bbetween\s+(\d+(?:\.\d+)?)\s+(?:and|to)\s+(\d+(?:\.\d+)?)\s*(?:mph)?\b",
            query,
        )
        if between_match:
            low = float(between_match.group(1))
            high = float(between_match.group(2))
            return {"min_velocity": min(low, high), "max_velocity": max(low, high)}

        range_match = re.search(r"\b(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mph\b", query)
        if range_match:
            low = float(range_match.group(1))
            high = float(range_match.group(2))
            return {"min_velocity": min(low, high), "max_velocity": max(low, high)}

        parsed: dict[str, float] = {}
        min_match = re.search(
            r"\b(?:over|above|greater than|at least)\s+(\d+(?:\.\d+)?)\s*(?:mph)?\b",
            query,
        ) or re.search(r"\b(\d+(?:\.\d+)?)\s*\+\s*(?:mph)?\b", query)
        if min_match:
            parsed["min_velocity"] = float(min_match.group(1))

        max_match = re.search(
            r"\b(?:under|below|less than|at most)\s+(\d+(?:\.\d+)?)\s*(?:mph)?\b",
            query,
        )
        if max_match:
            parsed["max_velocity"] = float(max_match.group(1))

        return parsed

    def _parse_batter_hand(self, query: str) -> dict[str, str]:
        left_handed_hitter = (
            r"(?:lefties|lefty|lhh|left[-\s]?handed\s+(?:hitters?|batters?)|"
            r"left[-\s]?handed|left\s+(?:hitters?|batters?))"
        )
        right_handed_hitter = (
            r"(?:righties|righty|rhh|right[-\s]?handed\s+(?:hitters?|batters?)|"
            r"right[-\s]?handed|right\s+(?:hitters?|batters?))"
        )

        if re.search(rf"\b(?:vs|against|to|facing)\s+{left_handed_hitter}\b", query):
            return {"batter_hand": "L"}
        if re.search(rf"\b{left_handed_hitter}\b", query) and re.search(
            r"\b(?:hitters?|batters?|lhh|lefties)\b",
            query,
        ):
            return {"batter_hand": "L"}

        if re.search(rf"\b(?:vs|against|to|facing)\s+{right_handed_hitter}\b", query):
            return {"batter_hand": "R"}
        if re.search(rf"\b{right_handed_hitter}\b", query) and re.search(
            r"\b(?:hitters?|batters?|rhh|righties)\b",
            query,
        ):
            return {"batter_hand": "R"}

        return {}

    def _parse_season(self, query: str) -> int | None:
        season_match = re.search(r"\b(20\d{2})\b", query)
        if season_match:
            return int(season_match.group(1))
        if re.search(r"\b(?:this|current)\s+(?:season|year)\b", query):
            return date.today().year
        if re.search(r"\b(?:last|previous|prior)\s+(?:season|year)\b", query):
            return date.today().year - 1
        return None

    def _parse_result_filters(self, query: str) -> dict[str, str]:
        if re.search(r"\b(whiffs|whiff|misses|swing and miss|swings and misses|swinging strikes|empty swings?)\b", query):
            return {"description": "swinging_strike"}
        if re.search(r"\b(called strikes|called strike|taken strikes|taken strike|takes)\b", query):
            return {"description": "called_strike"}
        if re.search(r"\b(in play|put in play|balls in play|batted balls)\b", query) or (
            re.search(r"\bcontact\b", query)
            and not re.search(r"\bhard[-\s]?contact\b", query)
        ):
            return {"description": "hit_into_play"}
        if re.search(r"\b(strikeouts|strikeout|k's|ks)\b", query):
            return {"events": "strikeout"}
        if re.search(r"\b(home runs|home run|homers|homer)\b", query):
            return {"events": "home_run"}
        if re.search(r"\b(walks|walk|bases on balls)\b", query):
            return {"events": "walk"}
        return {}

    def _parse_base_state(self, query: str) -> dict[str, str]:
        if re.search(r"\b(runners? on|men on|traffic on|with runners)\b", query):
            return {"base_state": "runners_on"}
        if re.search(r"\b(bases empty|empty bases|nobody on|no runners)\b", query):
            return {"base_state": "bases_empty"}
        return {}

    def _parse_location(self, query: str) -> dict[str, str]:
        if re.search(r"\b(in the zone|inside the zone|in zone|zone only)\b", query):
            return {"location_filter": "zone"}
        if re.search(r"\b(out of the zone|outside the zone|out of zone|off the plate)\b", query):
            return {"location_filter": "out_of_zone"}
        return {}

    def _parse_heatmap_mode(self, query: str) -> str:
        if re.search(r"\b(whiffs|swings and misses|swinging strikes)\b", query):
            return "whiffs"
        if re.search(r"\b(hard contact|hard-hit|hard hit)\b", query):
            return "hard_contact"
        if re.search(r"\b(in zone|inside the zone|zone only)\b", query):
            return "in_zone"
        return "all"

    def _parse_compare_periods(self, query: str) -> dict[str, Any]:
        years = [int(year) for year in re.findall(r"\b(20\d{2})\b", query)]
        if len(years) < 2:
            return {}

        return {
            "period_a_season": years[0],
            "period_b_season": years[1],
            **(
                {"period_b_to_date": True}
                if re.search(r"\b(so far|to date|ytd)\b", query)
                else {}
            ),
        }

    def _parse_compare_preset(self, query: str) -> str | None:
        explicit_years = [int(year) for year in re.findall(r"\b(20\d{2})\b", query)]
        if len(explicit_years) >= 2:
            first_year, second_year = explicit_years[0], explicit_years[1]
            current_year = date.today().year
            if first_year == current_year - 1 and second_year == current_year:
                if re.search(r"\b(same span|same stretch|same window)\b", query):
                    return "previous_current_same_span"
                return "previous_current_season"

        if re.search(r"\b(prior|previous|last)\s+season\b", query) and re.search(
            r"\b(current|this)\s+season\b",
            query,
        ):
            if re.search(r"\b(same span|same stretch|same window|to date|ytd)\b", query):
                return "previous_current_same_span"
            return "previous_current_season"
        if re.search(r"\b(first half|1st half)\b", query) and re.search(
            r"\b(second half|2nd half)\b",
            query,
        ):
            return "season_first_second"
        if re.search(r"\b(previous|last)\s+30\b", query) and re.search(r"\blast\s+30\b", query):
            return "last30_previous30"
        if re.search(r"\b(first month|1st month)\b", query) and re.search(
            r"\b(second month|2nd month)\b",
            query,
        ):
            return "month_month"
        if re.search(r"\b(previous|prior)\s+month\b", query) and re.search(
            r"\b(latest|current|this)\s+month\b",
            query,
        ):
            return "latest_month_previous_month"
        return None


class ModelIntentParser:
    """Placeholder adapter for a future SLM/LLM-backed parser.

    A model adapter should return JSON shaped like SkillCall. Relay should
    always run that JSON through validate_skill_call before the UI or services
    see it, so the model never gets to invent executable behavior.
    """

    def parse(self, query: str, context: QueryContext | None = None) -> SkillCall:
        raise NotImplementedError("Model-backed natural language parsing is not configured yet.")


def validate_skill_call(raw_call: dict[str, Any]) -> SkillCall:
    call = SkillCall.model_validate(raw_call)
    allowed_args = set(SKILL_REGISTRY[call.skill]["args"])
    cleaned_args = {
        key: value
        for key, value in call.args.items()
        if key in allowed_args and value is not None and value != ""
    }
    dropped_args = sorted(set(call.args) - allowed_args)
    warnings = list(call.warnings)

    if dropped_args:
        warnings.append(f"Ignored unsupported args for {call.skill}: {', '.join(dropped_args)}.")

    return SkillCall(
        skill=call.skill,
        args=cleaned_args,
        warnings=warnings,
        parser=call.parser,
    )


def get_skill_registry() -> dict[str, dict[str, Any]]:
    return SKILL_REGISTRY


def create_intent_parser() -> IntentParser:
    provider = os.getenv("RELAY_NL_PARSER", "rule_based").strip().lower()
    if provider in {"model", "llm", "slm"}:
        return ModelIntentParser()
    return RuleBasedQueryIntentParser()


def parse_natural_language_query(query: str) -> dict[str, Any]:
    context = QueryContext(cached_pitchers=list_cached_pitchers())
    return create_intent_parser().parse(query, context).model_dump()
