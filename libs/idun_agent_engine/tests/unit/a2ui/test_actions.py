"""Unit tests for idun_agent_engine.a2ui.actions."""
from __future__ import annotations

import pytest
from pydantic import ValidationError


@pytest.mark.unit
class TestA2UIClientAction:
    def test_round_trips_camel_to_snake(self) -> None:
        from idun_agent_engine.a2ui.actions import A2UIClientAction
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
        from idun_agent_engine.a2ui.actions import A2UIClientAction
        a = A2UIClientAction(
            name="x",
            surface_id="s",
            source_component_id="c",
            timestamp="2026-05-05T00:00:00Z",
            context={},
        )
        assert a.surface_id == "s"

    def test_extra_field_forbidden(self) -> None:
        from idun_agent_engine.a2ui.actions import A2UIClientAction
        with pytest.raises(ValidationError):
            A2UIClientAction.model_validate({
                "name": "x", "surfaceId": "s", "sourceComponentId": "c",
                "timestamp": "2026-05-05T00:00:00Z", "context": {},
                "extra": "rejected",
            })


@pytest.mark.unit
class TestA2UIClientMessage:
    def test_envelope_shape(self) -> None:
        from idun_agent_engine.a2ui.actions import A2UIClientMessage
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
        from idun_agent_engine.a2ui.actions import A2UIClientMessage
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
        from idun_agent_engine.a2ui.actions import A2UIClientDataModel
        d = A2UIClientDataModel.model_validate({
            "version": "v0.9",
            "surfaces": {"s1": {"name": "alice", "agreed": True}},
        })
        assert d.surfaces["s1"]["name"] == "alice"

    def test_empty_surfaces_allowed(self) -> None:
        from idun_agent_engine.a2ui.actions import A2UIClientDataModel
        d = A2UIClientDataModel.model_validate({"version": "v0.9", "surfaces": {}})
        assert d.surfaces == {}


@pytest.mark.unit
class TestA2UIContext:
    def _ctx(self, *, with_data: bool) -> object:
        from idun_agent_engine.a2ui.actions import (
            A2UIClientAction,
            A2UIClientDataModel,
            A2UIContext,
        )
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
