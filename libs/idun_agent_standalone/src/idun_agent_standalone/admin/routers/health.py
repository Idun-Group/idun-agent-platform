"""Liveness probe for the standalone admin surface."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/admin/api/v1", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
