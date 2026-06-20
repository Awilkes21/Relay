from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.errors import raise_service_error
from app.api.schemas import SkillRegistryResponse
from app.services.nl_query_service import get_skill_registry, parse_natural_language_query


router = APIRouter()


class NaturalLanguageQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)


class SkillCallResponse(BaseModel):
    skill: Literal[
        "search_pitches",
        "get_pitch_heatmap",
        "compare_pitcher_periods",
        "open_pitcher_profile",
        "summarize_arsenal",
        "summarize_movement",
    ]
    args: dict[str, Any]
    warnings: list[str] = []
    parser: str = "rule_based"


@router.post("/query", response_model=SkillCallResponse)
def query(request: NaturalLanguageQueryRequest) -> dict[str, Any]:
    try:
        return parse_natural_language_query(request.query)
    except Exception as exc:
        raise_service_error(exc)


@router.get("/query/skills", response_model=SkillRegistryResponse)
def query_skills() -> dict[str, Any]:
    return {"skills": get_skill_registry()}
