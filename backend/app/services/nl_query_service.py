import re
from typing import Any, Protocol

from app.services.pitch_query_service import list_cached_pitchers


PITCH_TYPE_ALIASES = {
    "four seam fastball": "FF",
    "four-seam fastball": "FF",
    "four seam": "FF",
    "four-seamer": "FF",
    "4 seam": "FF",
    "4-seam": "FF",
    "fastballs": "FF",
    "fastball": "FF",
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


class IntentParser(Protocol):
    def parse(self, query: str) -> dict[str, Any]:
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

    def parse(self, query: str) -> dict[str, Any]:
        normalized_query = _normalize(query)
        args: dict[str, Any] = {}
        warnings: list[str] = []

        if not normalized_query:
            return {
                "skill": SEARCH_SKILL,
                "args": args,
                "warnings": ["Enter a query to translate."],
            }

        skill = self._parse_skill(normalized_query)
        pitcher_name = _unique_pitcher_match(normalized_query, self.pitcher_provider())
        if pitcher_name:
            args["pitcher_name"] = pitcher_name
        else:
            warnings.append("No unique cached pitcher name was found.")

        args.update(self._parse_common_filters(normalized_query))
        if skill == HEATMAP_SKILL:
            args["mode"] = self._parse_heatmap_mode(normalized_query)
        elif skill == COMPARE_SKILL:
            preset = self._parse_compare_preset(normalized_query)
            if preset:
                args["preset"] = preset
            else:
                warnings.append("No supported comparison preset was found.")

        return {
            "skill": skill,
            "args": args,
            "warnings": warnings,
        }

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

    def _parse_common_filters(self, query: str) -> dict[str, Any]:
        filters: dict[str, Any] = {}

        pitch_type = self._parse_pitch_type(query)
        if pitch_type:
            filters["pitch_type"] = pitch_type

        season = self._parse_season(query)
        if season:
            filters["season"] = season

        filters.update(self._parse_count(query))
        filters.update(self._parse_velocity(query))
        filters.update(self._parse_batter_hand(query))
        filters.update(self._parse_result_filters(query))

        return filters

    def _parse_pitch_type(self, query: str) -> str | None:
        for phrase in sorted(PITCH_TYPE_ALIASES, key=len, reverse=True):
            if re.search(rf"\b{re.escape(phrase)}\b", query):
                return PITCH_TYPE_ALIASES[phrase]
        return None

    def _parse_count(self, query: str) -> dict[str, int]:
        count_match = re.search(r"\b([0-3])\s*[-/]\s*([0-2])\b", query)
        if count_match:
            return {
                "balls": int(count_match.group(1)),
                "strikes": int(count_match.group(2)),
            }

        if "full count" in query:
            return {"balls": 3, "strikes": 2}

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
        if re.search(r"\b(?:vs|against)\s+(?:lefties|lefty|lhh|left handed|left-handed)\b", query):
            return {"batter_hand": "L"}
        if re.search(r"\b(?:vs|against)\s+(?:righties|righty|rhh|right handed|right-handed)\b", query):
            return {"batter_hand": "R"}
        return {}

    def _parse_season(self, query: str) -> int | None:
        season_match = re.search(r"\b(20\d{2})\b", query)
        return int(season_match.group(1)) if season_match else None

    def _parse_result_filters(self, query: str) -> dict[str, str]:
        if re.search(r"\b(whiffs|swings and misses|swinging strikes)\b", query):
            return {"description": "swinging_strike"}
        if re.search(r"\b(called strikes|called strike)\b", query):
            return {"description": "called_strike"}
        if re.search(r"\b(in play|balls in play|batted balls)\b", query):
            return {"description": "hit_into_play"}
        if re.search(r"\b(strikeouts|strikeout|ks)\b", query):
            return {"events": "strikeout"}
        if re.search(r"\b(home runs|home run|homers|homer)\b", query):
            return {"events": "home_run"}
        return {}

    def _parse_heatmap_mode(self, query: str) -> str:
        if re.search(r"\b(whiffs|swings and misses|swinging strikes)\b", query):
            return "whiffs"
        if re.search(r"\b(hard contact|hard-hit|hard hit)\b", query):
            return "hard_contact"
        if re.search(r"\b(in zone|inside the zone|zone only)\b", query):
            return "in_zone"
        return "all"

    def _parse_compare_preset(self, query: str) -> str | None:
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
            return "first_second"
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


def parse_natural_language_query(query: str) -> dict[str, Any]:
    return RuleBasedQueryIntentParser().parse(query)
