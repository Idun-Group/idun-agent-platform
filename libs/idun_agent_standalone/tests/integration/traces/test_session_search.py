"""Phase 3 P3.3: list_sessions ?search= filters by id or title (case-insensitive).

Per ``docs/superpowers/reviews/2026-04-26-standalone-mvp-ui-redesign-review.md``:
the frontend `/traces/` page already exposes a search input and `lib/api.ts`
forwards `?search=`, but the backend `list_sessions` route ignored the
parameter. P3.3 closes the API consistency gap.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.db.models import SessionRow


@pytest.mark.asyncio
async def test_list_sessions_filters_by_search(standalone_app):
    """Search matches case-insensitively on either ``id`` or ``title``.

    With needle ``"alpha"``:
    - ``alpha-1`` matches via id
    - ``gamma-3`` matches via title (``"Alpha review"`` — case-insensitive)
    - ``beta-2`` does not match
    - ``delta-4`` (``title=NULL``) does not match — coalesce-to-empty must
      not silently match every row.
    """
    app, sm = standalone_app
    async with sm() as session:
        for sid, title in [
            ("alpha-1", "First chat"),
            ("beta-2", "Second chat"),
            ("gamma-3", "Alpha review"),
            ("delta-4", None),
        ]:
            session.add(SessionRow(id=sid, title=title))
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as client:
        r = await client.get("/admin/api/v1/traces/sessions?search=alpha")
        assert r.status_code == 200, r.text
        body = r.json()
        ids = sorted([s["id"] for s in body["items"]])
        assert ids == ["alpha-1", "gamma-3"], body
        # ``total`` reflects the filtered count, not the full table.
        assert body["total"] == 2, body


@pytest.mark.asyncio
async def test_list_sessions_no_search_returns_all(standalone_app):
    """Omitting ``?search=`` preserves prior behaviour: all rows return."""
    app, sm = standalone_app
    async with sm() as session:
        for sid in ["a", "b", "c"]:
            session.add(SessionRow(id=sid, title=f"Session {sid}"))
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as client:
        r = await client.get("/admin/api/v1/traces/sessions")
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["items"]) == 3
        assert body["total"] == 3


@pytest.mark.asyncio
async def test_list_sessions_search_is_case_insensitive(standalone_app):
    """Mixed-case needle matches mixed-case stored values."""
    app, sm = standalone_app
    async with sm() as session:
        session.add(SessionRow(id="ABC-123", title="Important Conversation"))
        session.add(SessionRow(id="xyz-456", title="other"))
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as client:
        r = await client.get("/admin/api/v1/traces/sessions?search=IMPORTANT")
        assert r.status_code == 200, r.text
        ids = [s["id"] for s in r.json()["items"]]
        assert ids == ["ABC-123"]
