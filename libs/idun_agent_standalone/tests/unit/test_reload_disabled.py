"""Unit tests for the ``reload_disabled`` engine /reload guard."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from idun_agent_standalone.api.v1.deps import reload_disabled


async def test_reload_disabled_raises_403() -> None:
    """Standalone forces admin reloads through ``/admin/api/v1/*``."""
    with pytest.raises(HTTPException) as excinfo:
        await reload_disabled(request=None)  # type: ignore[arg-type]
    assert excinfo.value.status_code == 403
    assert "/admin/api/v1/" in excinfo.value.detail
