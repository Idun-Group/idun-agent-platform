"""Tests for cookie and log capture test helpers."""

from __future__ import annotations

import logging

import httpx
import pytest

from _helpers.cookies import parsed_set_cookie
from _helpers.logs import captured_logs


def test_parsed_set_cookie_round_trip() -> None:
    response = httpx.Response(
        200,
        headers=[
            (
                "set-cookie",
                "idun_session=abc; HttpOnly; SameSite=Lax; Secure; Max-Age=3600; Path=/",
            )
        ],
    )

    parsed = parsed_set_cookie(response, "idun_session")

    assert parsed == {
        "value": "abc",
        "httponly": True,
        "samesite": "lax",
        "secure": True,
        "max_age": 3600,
        "path": "/",
    }


def test_parsed_set_cookie_missing_raises() -> None:
    response = httpx.Response(
        200,
        headers=[("set-cookie", "other=x; Path=/")],
    )

    with pytest.raises(AssertionError, match="Set-Cookie for 'idun_session' not present"):
        parsed_set_cookie(response, "idun_session")


def test_parsed_set_cookie_picks_match_among_many() -> None:
    response = httpx.Response(
        200,
        headers=[
            ("set-cookie", "other=x; Path=/"),
            ("set-cookie", "idun_session=abc; HttpOnly"),
        ],
    )

    parsed = parsed_set_cookie(response, "idun_session")

    assert parsed["value"] == "abc"
    assert parsed["httponly"] is True


def test_captured_logs_scope() -> None:
    name = "idun_agent_standalone.test_capture_scope"
    logger = logging.getLogger(name)
    logger.info("before block")

    with captured_logs(name, logging.INFO) as records:
        logger.info("inside block")

    logger.info("after block")

    messages = [r.getMessage() for r in records]
    assert messages == ["inside block"]


def test_captured_logs_restores_level() -> None:
    name = "idun_agent_standalone.test_restore"
    logger = logging.getLogger(name)
    logger.setLevel(logging.WARNING)

    try:
        with captured_logs(name, logging.DEBUG):
            assert logger.level == logging.DEBUG

        assert logger.level == logging.WARNING
    finally:
        logger.setLevel(logging.NOTSET)
