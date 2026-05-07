from __future__ import annotations

from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from sqlalchemy.exc import IntegrityError


async def test_integrity_error_is_mapped_to_internal_error_envelope():
    app = FastAPI()
    register_admin_exception_handlers(app)

    router = APIRouter(prefix="/admin/api/v1/forced", tags=["test"])

    @router.post("")
    async def _force_integrity_error() -> None:
        raise IntegrityError("INSERT", {}, Exception("duplicate key"))

    app.include_router(router)

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/forced")

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert "unexpected" in body["error"]["message"].lower()


async def test_unhandled_exception_on_non_admin_path_falls_through_to_default():
    app = FastAPI()
    register_admin_exception_handlers(app)

    @app.post("/agent/run")
    async def _crash() -> None:
        raise RuntimeError("engine boom")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/agent/run")

    assert response.status_code == 500
    body = response.json()
    assert body == {"detail": "Internal Server Error"}
