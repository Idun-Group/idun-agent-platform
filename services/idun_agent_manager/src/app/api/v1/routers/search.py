"""Global search endpoint — searches across agents and config resources."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
from app.infrastructure.db.models.managed_observability import ManagedObservabilityModel

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class SearchResultItem(BaseModel):
    id: UUID
    name: str
    resource_type: str
    meta: str
    project_id: UUID


class SearchResultGroup(BaseModel):
    resource_type: str
    label: str
    total: int
    items: list[SearchResultItem]


class SearchResponse(BaseModel):
    groups: list[SearchResultGroup]


# ---------------------------------------------------------------------------
# Per-model configuration
# ---------------------------------------------------------------------------

_SEARCH_TARGETS: list[dict[str, Any]] = [
    {
        "model": ManagedAgentModel,
        "resource_type": "agent",
        "label": "Agents",
        "config_field": "engine_config",
        "meta_extractor": lambda cfg: (cfg.get("agent", {}) or {}).get("type", ""),
    },
    {
        "model": ManagedObservabilityModel,
        "resource_type": "observability",
        "label": "Observability",
        "config_field": "observability_config",
        "meta_extractor": lambda cfg: cfg.get("provider", ""),
    },
    {
        "model": ManagedMemoryModel,
        "resource_type": "memory",
        "label": "Memory",
        "config_field": "memory_config",
        "meta_extractor": lambda cfg: cfg.get("type", ""),
    },
    {
        "model": ManagedMCPServerModel,
        "resource_type": "mcp_server",
        "label": "MCP Servers",
        "config_field": "mcp_server_config",
        "meta_extractor": lambda cfg: cfg.get("transport", ""),
    },
    {
        "model": ManagedGuardrailModel,
        "resource_type": "guardrail",
        "label": "Guardrails",
        "config_field": "guardrail_config",
        "meta_extractor": lambda cfg: cfg.get("config_id", ""),
    },
]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=SearchResponse,
    summary="Search across all resource types",
)
async def search_resources(
    q: str = Query(..., min_length=1, description="Search query (case-insensitive substring)"),
    project_ids: list[UUID] | None = Query(None, description="Filter to specific projects"),
    limit: int = Query(5, ge=1, le=50, description="Max results per category"),
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> SearchResponse:
    """Search across agents, observability, memory, MCP servers, and guardrails.

    Returns results grouped by resource type, with only non-empty groups included.
    """
    pattern = f"%{q}%"

    async def _query_model(target: dict[str, Any]) -> SearchResultGroup | None:
        model = target["model"]
        config_field_name: str = target["config_field"]

        # Base filter: workspace + ILIKE on name
        base_where = [
            model.workspace_id == workspace_id,
            model.name.ilike(pattern),
        ]

        # Optional project filter
        if project_ids:
            base_where.append(model.project_id.in_(project_ids))

        # Count query
        count_stmt = select(func.count()).select_from(model).where(*base_where)
        total = (await session.execute(count_stmt)).scalar_one()

        if total == 0:
            return None

        # Items query
        items_stmt = (
            select(model)
            .where(*base_where)
            .order_by(model.name)
            .limit(limit)
        )
        rows = (await session.execute(items_stmt)).scalars().all()

        meta_extractor = target["meta_extractor"]
        items = [
            SearchResultItem(
                id=row.id,
                name=row.name,
                resource_type=target["resource_type"],
                meta=meta_extractor(getattr(row, config_field_name) or {}),
                project_id=row.project_id,
            )
            for row in rows
        ]

        return SearchResultGroup(
            resource_type=target["resource_type"],
            label=target["label"],
            total=total,
            items=items,
        )

    groups: list[SearchResultGroup] = []
    for target in _SEARCH_TARGETS:
        group = await _query_model(target)
        if group is not None:
            groups.append(group)

    return SearchResponse(groups=groups)
