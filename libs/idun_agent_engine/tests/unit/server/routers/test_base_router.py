"""Tests for base router endpoints (/health, /api, /auth/config)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app


def _minimal_config(tmp_path, **extra) -> dict:
    cfg: dict = {
        "server": {"api": {"port": 0}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Agent",
                "graph_definition": str(tmp_path / "agent.py:graph"),
            },
        },
    }
    cfg.update(extra)
    return cfg


@pytest.mark.unit
class TestAuthConfigDisabled:
    """/auth/config when SSO is absent or disabled."""

    def test_no_sso_block_returns_enabled_false(self, tmp_path) -> None:
        app = create_app(config_dict=_minimal_config(tmp_path))
        client = TestClient(app)

        resp = client.get("/auth/config")
        assert resp.status_code == 200
        assert resp.json() == {"sso": {"enabled": False}}

    def test_sso_block_disabled_returns_enabled_false(self, tmp_path) -> None:
        cfg = _minimal_config(
            tmp_path,
            sso={
                "enabled": False,
                "issuer": "https://accounts.google.com",
                "client_id": "unused.apps.googleusercontent.com",
            },
        )
        app = create_app(config_dict=cfg)
        client = TestClient(app)

        resp = client.get("/auth/config")
        assert resp.status_code == 200
        assert resp.json() == {"sso": {"enabled": False}}


@pytest.mark.unit
class TestAuthConfigEnabled:
    """/auth/config when SSO is enabled."""

    def test_returns_issuer_client_id_audience(self, tmp_path) -> None:
        cfg = _minimal_config(
            tmp_path,
            sso={
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "client_id": "12345.apps.googleusercontent.com",
                "audience": "api://idun",
            },
        )
        app = create_app(config_dict=cfg)
        client = TestClient(app)

        resp = client.get("/auth/config")
        assert resp.status_code == 200
        body = resp.json()
        assert body == {
            "sso": {
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "clientId": "12345.apps.googleusercontent.com",
                "audience": "api://idun",
            }
        }

    def test_audience_falls_back_to_client_id(self, tmp_path) -> None:
        cfg = _minimal_config(
            tmp_path,
            sso={
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "client_id": "12345.apps.googleusercontent.com",
            },
        )
        app = create_app(config_dict=cfg)
        client = TestClient(app)

        resp = client.get("/auth/config")
        assert resp.status_code == 200
        body = resp.json()["sso"]
        assert body["audience"] == "12345.apps.googleusercontent.com"
        assert body["audience"] == body["clientId"]


@pytest.mark.unit
class TestAuthConfigDoesNotLeakACLs:
    """The endpoint must never expose allowedDomains or allowedEmails."""

    def test_acl_fields_not_in_response(self, tmp_path) -> None:
        cfg = _minimal_config(
            tmp_path,
            sso={
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "client_id": "12345.apps.googleusercontent.com",
                "allowed_domains": ["acme.com"],
                "allowed_emails": ["alice@acme.com"],
            },
        )
        app = create_app(config_dict=cfg)
        client = TestClient(app)

        resp = client.get("/auth/config")
        assert resp.status_code == 200
        raw = resp.text
        for leaked in (
            "allowed_domains",
            "allowedDomains",
            "allowed_emails",
            "allowedEmails",
            "acme.com",
            "alice@acme.com",
        ):
            assert leaked not in raw, f"/auth/config leaked {leaked!r}"


@pytest.mark.unit
class TestAuthConfigIsUnauthenticated:
    """The endpoint is the bootstrap for auth; it must not require a token."""

    def test_route_has_no_auth_dependency(self, tmp_path) -> None:
        """The /auth/config route must not declare get_verified_user."""
        from idun_agent_engine.server.auth import get_verified_user

        cfg = _minimal_config(
            tmp_path,
            sso={
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "client_id": "12345.apps.googleusercontent.com",
            },
        )
        app = create_app(config_dict=cfg)

        auth_config_routes = [
            r for r in app.routes if getattr(r, "path", None) == "/auth/config"
        ]
        assert len(auth_config_routes) == 1
        route = auth_config_routes[0]

        def _dependency_fns(dependant) -> list:
            fns = [dependant.call]
            for sub in dependant.dependencies:
                fns.extend(_dependency_fns(sub))
            return fns

        all_fns = _dependency_fns(route.dependant)  # type: ignore[attr-defined]
        assert get_verified_user not in all_fns, (
            "/auth/config must not depend on get_verified_user — "
            "it is the pre-auth bootstrap for the UI"
        )

    def test_returns_200_with_no_authorization_header(self, tmp_path) -> None:
        cfg = _minimal_config(
            tmp_path,
            sso={
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "client_id": "12345.apps.googleusercontent.com",
            },
        )
        app = create_app(config_dict=cfg)
        client = TestClient(app)

        resp = client.get("/auth/config")
        assert resp.status_code == 200

    def test_returns_200_with_bogus_bearer_token(self, tmp_path) -> None:
        """A bad token on the way in must not cause /auth/config to 401."""
        cfg = _minimal_config(
            tmp_path,
            sso={
                "enabled": True,
                "issuer": "https://accounts.google.com",
                "client_id": "12345.apps.googleusercontent.com",
            },
        )
        app = create_app(config_dict=cfg)
        client = TestClient(app)

        resp = client.get(
            "/auth/config",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert resp.status_code == 200
