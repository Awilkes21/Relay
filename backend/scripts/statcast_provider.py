from __future__ import annotations

from datetime import date
from typing import Any, Protocol


class StatcastProvider(Protocol):
    def resolve_pitcher_id(self, pitcher_name: str) -> int:
        """Resolve a display/search name to the canonical MLBAM player ID."""

    def fetch_pitcher_pitches(self, start_date: date, end_date: date, pitcher_id: int) -> Any:
        """Fetch pitch-level Statcast rows for one pitcher and date range."""


def parse_pitcher_name(pitcher_name: str) -> tuple[str, str]:
    normalized_name = " ".join(pitcher_name.strip().split())
    if not normalized_name:
        raise ValueError("pitcher name cannot be empty")

    if "," in normalized_name:
        last_name, first_name = [part.strip() for part in normalized_name.split(",", 1)]
    else:
        name_parts = normalized_name.split()
        if len(name_parts) < 2:
            raise ValueError("pitcher name must include first and last name")
        first_name = " ".join(name_parts[:-1])
        last_name = name_parts[-1]

    if not first_name or not last_name:
        raise ValueError("pitcher name must include first and last name")

    return last_name, first_name


class PybaseballStatcastProvider:
    name = "pybaseball"

    def resolve_pitcher_id(self, pitcher_name: str) -> int:
        try:
            from pybaseball import playerid_lookup
        except ImportError as exc:
            raise RuntimeError(
                "pybaseball is not installed. Run `pip install -r backend/requirements.txt`."
            ) from exc

        last_name, first_name = parse_pitcher_name(pitcher_name)
        players = playerid_lookup(last_name, first_name)
        if players.empty:
            raise RuntimeError(f"no MLBAM player found for pitcher name: {pitcher_name}")

        players = players.dropna(subset=["key_mlbam"])
        if players.empty:
            raise RuntimeError(f"no MLBAM ID found for pitcher name: {pitcher_name}")

        active_players = players[players.get("mlb_played_last", 0).fillna(0) >= 2015]
        match = active_players.iloc[0] if not active_players.empty else players.iloc[0]

        return int(match["key_mlbam"])

    def fetch_pitcher_pitches(self, start_date: date, end_date: date, pitcher_id: int) -> Any:
        try:
            from pybaseball import statcast_pitcher
        except ImportError as exc:
            raise RuntimeError(
                "pybaseball is not installed. Run `pip install -r backend/requirements.txt`."
            ) from exc

        return statcast_pitcher(
            start_dt=start_date.isoformat(),
            end_dt=end_date.isoformat(),
            player_id=pitcher_id,
        )


def get_statcast_provider(provider_name: str = "pybaseball") -> StatcastProvider:
    normalized_name = provider_name.strip().lower()
    if normalized_name == "pybaseball":
        return PybaseballStatcastProvider()
    raise ValueError(f"unsupported Statcast provider: {provider_name}")
