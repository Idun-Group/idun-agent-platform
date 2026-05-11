"""Unit tests for the trace-detail SPA rewrite + RSC payload routes.

Covers ``_register_trace_detail_routes`` directly so we can exercise the
route precedence (``.txt`` flavor must beat the greedy HTML route) and
the shell/RSC resolution fallbacks (renamed ``_shell/`` → legacy
``__trace__/`` → root) without booting the full standalone or
materialising a real Next export.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import _register_trace_detail_routes


def _write_shell(
    ui_dir: Path,
    *,
    shell_dir: str = "_shell",
    html: str = "<html>shell</html>",
    rsc: str | None = "0:[\"shell-rsc\",null]\n",
) -> None:
    """Materialise a minimal Next export under ``ui_dir``.

    ``shell_dir`` switches between the renamed ``_shell/`` (post
    Make-target rename) and the legacy ``__trace__/`` (raw ``pnpm
    build`` output). ``rsc=None`` simulates a broken build that emits
    HTML without the RSC ``.txt`` flavor.
    """
    traces_dir = ui_dir / "admin" / "traces" / shell_dir
    traces_dir.mkdir(parents=True)
    (traces_dir / "index.html").write_text(html)
    if rsc is not None:
        (traces_dir / "index.txt").write_text(rsc)
    (ui_dir / "index.html").write_text("<html>root</html>")


def _build_app(ui_dir: Path) -> FastAPI:
    app = FastAPI()
    _register_trace_detail_routes(app, ui_dir)
    return app


@pytest.fixture
def shell_ui_dir(tmp_path: Path) -> Path:
    _write_shell(tmp_path)
    return tmp_path


@pytest.mark.asyncio
async def test_html_shell_served_for_unslashed_trace_id(shell_ui_dir: Path) -> None:
    app = _build_app(shell_ui_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/traces/abc123")
    assert response.status_code == 200
    assert response.text == "<html>shell</html>"


@pytest.mark.asyncio
async def test_html_shell_served_for_slashed_trace_id(shell_ui_dir: Path) -> None:
    """The slashed variant covers Slack-unfurl / link-share URLs."""
    app = _build_app(shell_ui_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/traces/abc123/")
    assert response.status_code == 200
    assert response.text == "<html>shell</html>"


@pytest.mark.asyncio
async def test_rsc_payload_served_for_directory_form(shell_ui_dir: Path) -> None:
    """``/admin/traces/<id>/index.txt`` is what Next prefetches on hover."""
    app = _build_app(shell_ui_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/traces/abc123/index.txt")
    assert response.status_code == 200
    assert response.text == "0:[\"shell-rsc\",null]\n"
    assert response.headers["content-type"].startswith("text/x-component")


@pytest.mark.asyncio
async def test_rsc_payload_served_for_file_form(shell_ui_dir: Path) -> None:
    """``/admin/traces/<id>.txt`` is what Next prefetches on query-string nav.

    This route must win over the greedy ``{trace_id}`` HTML route — if
    it doesn't, the HTML shell is served as ``text/html`` and Next bails
    to a hard navigation (page reload).
    """
    app = _build_app(shell_ui_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/traces/abc123.txt")
    assert response.status_code == 200
    assert response.text == "0:[\"shell-rsc\",null]\n"
    assert response.headers["content-type"].startswith("text/x-component")


@pytest.mark.asyncio
async def test_rsc_payload_passes_through_rsc_query_token(shell_ui_dir: Path) -> None:
    """Real RSC prefetches carry ``?_rsc=<build-id>`` plus arbitrary
    other query params (``?span=...``). The route must accept any query
    string and still serve the payload."""
    app = _build_app(shell_ui_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/admin/traces/abc123/index.txt",
            params={"_rsc": "idhyg", "span": "deadbeef"},
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_placeholder_segment_returns_410_for_html(shell_ui_dir: Path) -> None:
    app = _build_app(shell_ui_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/traces/__trace__")
    assert response.status_code == 410


@pytest.mark.asyncio
async def test_placeholder_segment_returns_410_for_rsc(shell_ui_dir: Path) -> None:
    app = _build_app(shell_ui_dir)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/traces/__trace__/index.txt")
    assert response.status_code == 410


@pytest.mark.asyncio
async def test_rsc_route_404s_when_payload_missing(tmp_path: Path) -> None:
    """A build that emits ``index.html`` but no ``index.txt`` returns
    ``404`` for the RSC route rather than fabricating one — serving HTML
    as ``text/x-component`` would silently break the RSC client."""
    _write_shell(tmp_path, rsc=None)
    app = _build_app(tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        rsc = await client.get("/admin/traces/abc123/index.txt")
        html = await client.get("/admin/traces/abc123")
    assert rsc.status_code == 404
    assert html.status_code == 200  # HTML shell still serves


@pytest.mark.asyncio
async def test_legacy_trace_directory_is_resolved(tmp_path: Path) -> None:
    """Unrenamed ``__trace__/`` (raw ``pnpm build`` output) is the
    fallback for direct-build workflows like ``e2e/boot-standalone.sh``."""
    _write_shell(tmp_path, shell_dir="__trace__")
    app = _build_app(tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        html = await client.get("/admin/traces/abc123")
        rsc = await client.get("/admin/traces/abc123/index.txt")
    assert html.status_code == 200
    assert rsc.status_code == 200
    assert rsc.headers["content-type"].startswith("text/x-component")
