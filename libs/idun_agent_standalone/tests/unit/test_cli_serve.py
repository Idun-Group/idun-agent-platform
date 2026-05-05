"""Regression test for the ``serve`` CLI single-loop refactor.

The original code did ``app = asyncio.run(create_standalone_app(...))``
followed by ``uvicorn.run(app, ...)``, which created two distinct event
loops; async resources bound to the first crashed when uvicorn served
requests on the second. The fix replaces both with one coroutine that
runs under a single ``asyncio.run``.

This test reads the ``cli.py`` source directly to guarantee:
  1. ``async def _serve`` exists.
  2. The cross-loop antipattern is gone (no ``asyncio.run(create_standalone_app``,
     no ``uvicorn.run(app``).

Importing ``cli`` would transitively pull the engine app, which is
heavy and provides no extra signal — the bug class is structural.
"""

from __future__ import annotations

from pathlib import Path

import idun_agent_standalone


def _cli_source() -> str:
    cli_path = Path(idun_agent_standalone.__file__).parent / "cli.py"
    return cli_path.read_text()


def test_serve_is_a_coroutine() -> None:
    """The serve path must be async so build + serve share one loop."""
    assert "async def _serve" in _cli_source()


def test_no_cross_loop_antipattern() -> None:
    """Re-introducing the asyncio.run/uvicorn.run split is the regression."""
    src = _cli_source()
    assert "asyncio.run(create_standalone_app" not in src
    assert "uvicorn.run(app" not in src


def test_serve_uses_uvicorn_server() -> None:
    """The fix uses ``uvicorn.Server.serve`` so we stay on one loop."""
    src = _cli_source()
    assert "uvicorn.Server" in src
    assert "server.serve()" in src
