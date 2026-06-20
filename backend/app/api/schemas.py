from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class CachedPitchersResponse(BaseModel):
    count: int
    results: list[dict[str, Any]]


class CacheMetadataResponse(BaseModel):
    path: str | None = None
    file_size_bytes: int | None = None
    pitch_count: int
    pitcher_count: int | None = None
    first_game_date: str | None = None
    last_game_date: str | None = None
    seasons: list[int] = Field(default_factory=list)
    pitch_types: list[str] = Field(default_factory=list)
    data_quality: dict[str, Any] | None = None
    source: str | None = None
    manifest: dict[str, Any] | None = None


class PitchFilterOptionsResponse(BaseModel):
    seasons: list[int] = Field(default_factory=list)
    game_dates: list[dict[str, Any]] = Field(default_factory=list)
    pitch_types: list[str] = Field(default_factory=list)
    batter_hands: list[str] = Field(default_factory=list)
    descriptions: list[str] = Field(default_factory=list)
    events: list[str] = Field(default_factory=list)
    velocity: dict[str, float | None]


class PitchSearchResponse(BaseModel):
    count: int
    total_count: int
    movement: dict[str, Any]
    results: list[dict[str, Any]]


class PitchSummaryResponse(BaseModel):
    pitch_count: int
    arsenal: list[dict[str, Any]]


class ProfileSummaryResponse(BaseModel):
    pitch_count: int
    metrics: dict[str, Any]
    arsenal: list[dict[str, Any]]
    bucketed: dict[str, list[dict[str, Any]]]


class PitchDataQualityResponse(BaseModel):
    pitch_count: int
    metrics: list[dict[str, Any]]


class PitchHeatmapResponse(BaseModel):
    mode: str
    x_bins: int
    z_bins: int
    domain: dict[str, float]
    total_count: int
    max_count: int
    cells: list[dict[str, Any]]


class PitcherCompareResponse(BaseModel):
    pitcher_id: int
    pitcher_hand: str | None = None
    filters: dict[str, Any] = Field(default_factory=dict)
    period_a: dict[str, Any]
    period_b: dict[str, Any]
    deltas: dict[str, Any]
    movement: dict[str, Any] | None = None
    chart_data: dict[str, Any] | None = None


class SkillRegistryResponse(BaseModel):
    skills: dict[str, Any]
