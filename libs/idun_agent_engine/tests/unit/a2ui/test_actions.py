"""Unit tests for idun_agent_engine.a2ui.actions."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from idun_agent_engine.a2ui.actions import (
    A2UIClientAction,
    A2UIClientDataModel,
    A2UIClientMessage,
    A2UIContext,
    _server_to_client_validator,
)


@pytest.mark.unit
class TestA2UIClientAction:
    def test_round_trips_camel_to_snake(self) -> None:
        wire = {
            "name": "submit_form",
            "surfaceId": "showcase",
            "sourceComponentId": "btn_demo",
            "timestamp": "2026-05-05T10:42:13.412Z",
            "context": {"foo": "bar"},
        }
        a = A2UIClientAction.model_validate(wire)
        assert a.name == "submit_form"
        assert a.surface_id == "showcase"
        assert a.source_component_id == "btn_demo"
        assert a.timestamp == "2026-05-05T10:42:13.412Z"
        assert a.context == {"foo": "bar"}

    def test_constructable_via_snake_case_names(self) -> None:
        a = A2UIClientAction(
            name="x",
            surface_id="s",
            source_component_id="c",
            timestamp="2026-05-05T00:00:00Z",
            context={},
        )
        assert a.surface_id == "s"

    def test_extra_field_forbidden(self) -> None:
        with pytest.raises(ValidationError):
            A2UIClientAction.model_validate({
                "name": "x", "surfaceId": "s", "sourceComponentId": "c",
                "timestamp": "2026-05-05T00:00:00Z", "context": {},
                "extra": "rejected",
            })


@pytest.mark.unit
class TestA2UIClientMessage:
    def test_envelope_shape(self) -> None:
        m = A2UIClientMessage.model_validate({
            "version": "v0.9",
            "action": {
                "name": "x", "surfaceId": "s", "sourceComponentId": "c",
                "timestamp": "2026-05-05T00:00:00Z", "context": {},
            },
        })
        assert m.version == "v0.9"
        assert m.action.name == "x"

    def test_wrong_version_literal_rejected(self) -> None:
        with pytest.raises(ValidationError):
            A2UIClientMessage.model_validate({
                "version": "v0.8",
                "action": {
                    "name": "x", "surfaceId": "s", "sourceComponentId": "c",
                    "timestamp": "2026-05-05T00:00:00Z", "context": {},
                },
            })


@pytest.mark.unit
class TestA2UIClientDataModel:
    def test_minimal_shape(self) -> None:
        d = A2UIClientDataModel.model_validate({
            "version": "v0.9",
            "surfaces": {"s1": {"name": "alice", "agreed": True}},
        })
        assert d.surfaces["s1"]["name"] == "alice"

    def test_empty_surfaces_allowed(self) -> None:
        d = A2UIClientDataModel.model_validate({"version": "v0.9", "surfaces": {}})
        assert d.surfaces == {}


@pytest.mark.unit
class TestA2UIContext:
    def _ctx(self, *, with_data: bool) -> object:
        action = A2UIClientAction(
            name="submit_form", surface_id="s1", source_component_id="btn",
            timestamp="2026-05-05T00:00:00Z", context={},
        )
        dm = (
            A2UIClientDataModel(version="v0.9", surfaces={"s1": {"name": "a"}})
            if with_data else None
        )
        return A2UIContext(action=action, data_model=dm)

    def test_data_for_returns_surface_dict(self) -> None:
        ctx = self._ctx(with_data=True)
        assert ctx.data_for("s1") == {"name": "a"}

    def test_data_for_unknown_surface_returns_none(self) -> None:
        ctx = self._ctx(with_data=True)
        assert ctx.data_for("nope") is None

    def test_data_for_no_data_model_returns_none(self) -> None:
        ctx = self._ctx(with_data=False)
        assert ctx.data_for("s1") is None


@pytest.mark.unit
class TestServerToClientValidator:
    """The outbound (server→client) JSON Schema validator wraps the SDK's
    bundled server_to_client.json and is consumed by T6 envelope retrofit."""

    def test_accepts_minimal_create_surface_message(self) -> None:
        v = _server_to_client_validator()
        msg = {
            "version": "v0.9",
            "createSurface": {
                "surfaceId": "s1",
                "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json",
            },
        }
        errors = list(v.iter_errors(msg))
        assert errors == [], f"unexpected schema errors: {errors}"

    def test_rejects_missing_required(self) -> None:
        v = _server_to_client_validator()
        bad = {"version": "v0.9", "createSurface": {}}  # surfaceId/catalogId missing
        errors = list(v.iter_errors(bad))
        assert errors, "expected at least one schema error"

    def test_validator_is_cached(self) -> None:
        assert _server_to_client_validator() is _server_to_client_validator()

    def test_accepts_update_components_with_real_components(self) -> None:
        """Exercises the transitive $ref path:
        server_to_client.json → catalog.json#/$defs/anyComponent → common_types.json
        Without this, T6's mandatory envelope validation would fail with
        RefResolutionError on the first updateComponents envelope."""
        v = _server_to_client_validator()
        msg = {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": "s1",
                "components": [
                    {"id": "title", "component": "Text", "text": "Hi"},
                    {"id": "root", "component": "Card", "child": "title"},
                ],
            },
        }
        errors = list(v.iter_errors(msg))
        assert errors == [], (
            f"unexpected schema errors on transitive ref path: "
            f"{[e.message for e in errors]}"
        )
