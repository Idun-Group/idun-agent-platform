# WS3 — A2UI v0.9 Actions Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the A2UI loop — wire user actions emitted from a v0.9 surface in the standalone-UI back to the LangGraph agent over `/agent/run` `forwardedProps`, with mandatory JSON Schema validation backed by `a2ui-agent-sdk`.

**Architecture:** Frontend's `MessageProcessor` global `actionHandler` calls a new `useChat.sendAction` which POSTs `forwardedProps.idun.a2uiClientMessage` (+ optional `a2uiClientDataModel`) to `/agent/run`. Engine reads it via a typed `read_a2ui_context(state)` helper that validates against A2UI's bundled JSON Schemas before returning a Pydantic `A2UIContext`. WS2 envelope builders are retrofitted with mandatory outbound validation against the same schemas.

**Tech Stack:** Python 3.12 / FastAPI / LangGraph / `ag-ui-langgraph==0.0.35` / `a2ui-agent-sdk==0.2.1` / `jsonschema` / Pydantic 2 — Next.js 15 / React 19 / TypeScript / Vitest / `@a2ui/react/v0_9` / `@a2ui/web_core/v0_9` — Gemini Flash via `langchain-google-genai`.

**Spec:** `docs/superpowers/specs/2026-05-05-ws3-a2ui-actions-design.md`

---

## File Structure

### Engine (Python)
- `libs/idun_agent_engine/pyproject.toml` — MOD: `+a2ui-agent-sdk==0.2.1`, `+[examples]` extra
- `libs/idun_agent_engine/src/idun_agent_engine/a2ui/__init__.py` — MOD: re-export new public API
- `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py` — NEW: validators + Pydantic + `read_a2ui_context`
- `libs/idun_agent_engine/src/idun_agent_engine/a2ui/envelope.py` — MOD: mandatory validation + `sendDataModel` default
- `libs/idun_agent_engine/src/idun_agent_engine/a2ui/helpers.py` — MOD: `send_data_model` kwarg passthrough
- `libs/idun_agent_engine/CLAUDE.md` — MOD: document `read_a2ui_context` + action ingest path

### Engine tests
- `libs/idun_agent_engine/tests/unit/a2ui/fixtures/valid_action.json` — NEW
- `libs/idun_agent_engine/tests/unit/a2ui/fixtures/valid_data_model.json` — NEW
- `libs/idun_agent_engine/tests/unit/a2ui/test_actions.py` — NEW
- `libs/idun_agent_engine/tests/unit/a2ui/test_envelope_validation.py` — NEW
- `libs/idun_agent_engine/tests/integration/test_a2ui_action_passthrough.py` — NEW
- `libs/idun_agent_engine/tests/integration/test_a2ui_smoke_actions.py` — NEW

### Frontend (TypeScript)
- `services/idun_agent_standalone_ui/lib/agui.ts` — MOD: `IdunForwardedProps`, `runAgent` accepts forwarded-props
- `services/idun_agent_standalone_ui/lib/use-chat.ts` — MOD: `+sendAction`, `+useChatActions`
- `services/idun_agent_standalone_ui/components/chat/MessageView.tsx` — MOD: thread `isInteractive` down
- `services/idun_agent_standalone_ui/components/chat/a2ui/A2UISurfaceWrapper.tsx` — MOD: `+actionHandler`, `+isInteractive`
- `services/idun_agent_standalone_ui/CLAUDE.md` — MOD: document new sendAction + interactivity rules

### Frontend tests
- `services/idun_agent_standalone_ui/__tests__/agui.run-agent.test.ts` — NEW
- `services/idun_agent_standalone_ui/__tests__/use-chat.send-action.test.ts` — NEW
- `services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.action.test.tsx` — NEW
- `services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.test.tsx` — MOD: +pointer-events test

### Examples
- `examples/a2ui-smoke/agent.py` — MOD: `+acknowledge` node, conditional entry, branching components, action-wired buttons
- `examples/a2ui-smoke/README.md` — MOD: actions section
- `examples/a2ui-llm-picker/agent.py` — NEW
- `examples/a2ui-llm-picker/config.yaml` — NEW
- `examples/a2ui-llm-picker/README.md` — NEW
- `examples/a2ui-llm-picker/tests/test_proposal_surface.py` — NEW
- `examples/a2ui-llm-picker/tests/test_routing.py` — NEW
- `examples/a2ui-llm-picker/tests/test_acknowledge_with_fake_llm.py` — NEW

---

## Phase A — Engine SDK foundation

### Task 1: Add `a2ui-agent-sdk` dependency + verify schema bundle

**Files:**
- Modify: `libs/idun_agent_engine/pyproject.toml`
- Test: ad-hoc one-liner

- [ ] **Step 1: Add the dependency**

Open `libs/idun_agent_engine/pyproject.toml`, find the `[project] dependencies = [...]` block, and append (alphabetical order if maintained):

```toml
"a2ui-agent-sdk==0.2.1",
```

Also add an `[examples]` optional extra at the end of the optional-dependencies section (or create the section if absent):

```toml
[project.optional-dependencies]
examples = [
    "langchain-google-genai>=2.0.0",
]
```

- [ ] **Step 2: Sync deps**

Run from repo root:

```bash
chflags nohidden /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.venv/lib/python3.12/site-packages/_editable_impl_*.pth 2>/dev/null || true
uv sync --all-groups
```

Expected: `a2ui-agent-sdk`, `a2a-sdk`, `jsonschema` (and pre-existing `google-adk`, `google-genai`) appear in the resolved set with no conflicts.

- [ ] **Step 3: Verify the schema files are bundled in the wheel**

`a2ui-agent-sdk==0.2.1` ships THREE v0.9 schemas at `a2ui/assets/0.9/`: `server_to_client.json`, `common_types.json`, `basic_catalog.json`. It does NOT ship `client_to_server.json` or `client_data_model.json` (the SDK uses Pydantic/Zod for client→server, not JSON Schema — we follow the same stance). Run:

```bash
uv run --no-sync python -c "
from importlib.resources import files
pkg = files('a2ui').joinpath('assets/0.9')
for fname in ('server_to_client.json', 'common_types.json', 'basic_catalog.json'):
    p = pkg.joinpath(fname)
    print(fname, p.is_file(), p.stat().st_size if p.is_file() else 'MISSING')
"
```

Expected: all three lines say `True <size>` (a few KB to ~50 KB each). If any prints `MISSING`, STOP and escalate via BLOCKED — the SDK pin is broken and we need to either bump or vendor.

- [ ] **Step 4: Commit**

```bash
git add libs/idun_agent_engine/pyproject.toml uv.lock
git commit -m "$(cat <<'EOF'
chore(engine): pin a2ui-agent-sdk==0.2.1 + add examples extra

Adds a2ui-agent-sdk for canonical A2UI v0.9 JSON Schemas. Verified the
SDK ships server_to_client.json + common_types.json + basic_catalog.json
as wheel assets at a2ui/assets/0.9/ (the SDK does NOT ship JSON Schemas
for client_to_server.json or client_data_model.json — by design, it
uses Pydantic/Zod for client→server validation). Adds an [examples]
optional extra for langchain-google-genai used by the upcoming WS3
travel-picker example.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pydantic mirror models for A2UI client schemas

**Files:**
- Create: `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py`
- Test: `libs/idun_agent_engine/tests/unit/a2ui/test_actions.py`

- [ ] **Step 1: Create the test file with Pydantic-only tests**

Create `libs/idun_agent_engine/tests/unit/a2ui/test_actions.py`:

```python
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
            A2UIClientAction, A2UIClientDataModel, A2UIContext,
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
chflags nohidden /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.venv/lib/python3.12/site-packages/_editable_impl_*.pth 2>/dev/null || true
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_actions.py -v
```

Expected: all 9 tests FAIL with `ModuleNotFoundError: No module named 'idun_agent_engine.a2ui.actions'` (module doesn't exist yet).

- [ ] **Step 3: Create the actions module with Pydantic models only (no validators yet)**

Create `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py`:

```python
"""A2UI v0.9 client→server action ingest.

Pydantic mirrors of A2UI's client_to_server.json + client_data_model.json
schemas so agent code reads native A2UI types. Validation against the
canonical JSON Schemas is layered on top in this module's read_a2ui_context
(see Task 4).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class A2UIClientAction(BaseModel):
    """Mirrors specification/v0_9/json/client_to_server.json#/properties/action."""

    name: str
    surface_id: str = Field(alias="surfaceId")
    source_component_id: str = Field(alias="sourceComponentId")
    timestamp: str
    context: dict[str, Any]

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class A2UIClientMessage(BaseModel):
    """Envelope wrapper for the action variant of client_to_server.json."""

    version: Literal["v0.9"]
    action: A2UIClientAction

    model_config = ConfigDict(extra="forbid")


class A2UIClientDataModel(BaseModel):
    """Mirrors specification/v0_9/json/client_data_model.json."""

    version: Literal["v0.9"]
    surfaces: dict[str, dict[str, Any]]

    model_config = ConfigDict(extra="forbid")


class A2UIContext(BaseModel):
    """Bundle of an A2UI action plus the surfaces' dataModel snapshot."""

    action: A2UIClientAction
    data_model: A2UIClientDataModel | None = None

    def data_for(self, surface_id: str) -> dict[str, Any] | None:
        """Return the bound dataModel dict for a surface, or None if absent."""
        if self.data_model is None:
            return None
        return self.data_model.surfaces.get(surface_id)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_actions.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py \
        libs/idun_agent_engine/tests/unit/a2ui/test_actions.py
git commit -m "$(cat <<'EOF'
feat(engine): add A2UI v0.9 action Pydantic mirror models

Adds A2UIClientAction, A2UIClientMessage, A2UIClientDataModel, A2UIContext
mirroring A2UI v0.9's client_to_server.json and client_data_model.json
schemas. Pydantic ConfigDict uses populate_by_name + extra="forbid" so
the wire shape (camelCase) and Python attribute access (snake_case)
both work, while unknown fields raise loudly. data_for(surface_id)
sugar for the typical agent call site.

JSON Schema validation lands in a follow-up task (read_a2ui_context).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Outbound JSON Schema validator + fixtures

**Note on scope after install-time discovery:** `a2ui-agent-sdk==0.2.1` ships JSON Schemas only for the **outbound** (server→client) direction — `server_to_client.json`, `common_types.json`, `basic_catalog.json`. It does NOT ship `client_to_server.json` or `client_data_model.json`, mirroring the SDK's own design where client→server is Pydantic/Zod-validated only. We adopt the same stance: outbound validation uses JSON Schema (this task + T6), inbound validation uses Pydantic with `extra="forbid"` (T4 already gives us that via the mirror models from T2).

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py`
- Test: `libs/idun_agent_engine/tests/unit/a2ui/test_actions.py` (extend)
- Create: `libs/idun_agent_engine/tests/unit/a2ui/fixtures/valid_action.json`
- Create: `libs/idun_agent_engine/tests/unit/a2ui/fixtures/valid_data_model.json`

- [ ] **Step 1: Add fixture files**

Create `libs/idun_agent_engine/tests/unit/a2ui/fixtures/valid_action.json`:

```json
{
  "version": "v0.9",
  "action": {
    "name": "submit_form",
    "surfaceId": "a2ui_showcase",
    "sourceComponentId": "btn_demo",
    "timestamp": "2026-05-05T10:42:13.412Z",
    "context": {}
  }
}
```

Create `libs/idun_agent_engine/tests/unit/a2ui/fixtures/valid_data_model.json`:

```json
{
  "version": "v0.9",
  "surfaces": {
    "a2ui_showcase": {
      "name": "alice",
      "agreed": true,
      "color": "blue",
      "volume": 50,
      "when": "2026-06-01T09:00:00Z"
    }
  }
}
```

These fixtures power the inbound Pydantic tests in T4. They are not paired with JSON-Schema tests because the SDK ships no inbound schemas.

- [ ] **Step 2: Append outbound-validator tests to `test_actions.py`**

Append at the end of `libs/idun_agent_engine/tests/unit/a2ui/test_actions.py`:

```python


@pytest.mark.unit
class TestServerToClientValidator:
    """The outbound (server→client) JSON Schema validator wraps the SDK's
    bundled server_to_client.json and is consumed by T6 envelope retrofit."""

    def test_accepts_minimal_create_surface_message(self) -> None:
        from idun_agent_engine.a2ui.actions import _server_to_client_validator
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
        from idun_agent_engine.a2ui.actions import _server_to_client_validator
        v = _server_to_client_validator()
        bad = {"version": "v0.9", "createSurface": {}}  # surfaceId/catalogId missing
        errors = list(v.iter_errors(bad))
        assert errors, "expected at least one schema error"

    def test_validator_is_cached(self) -> None:
        from idun_agent_engine.a2ui.actions import _server_to_client_validator
        assert _server_to_client_validator() is _server_to_client_validator()
```

- [ ] **Step 3: Run extended tests to verify they fail**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_actions.py -v
```

Expected: 9 existing tests still PASS, 3 new tests FAIL with `ImportError: cannot import name '_server_to_client_validator' from 'idun_agent_engine.a2ui.actions'`.

- [ ] **Step 4: Add the outbound validator to `actions.py`**

Open `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py` and prepend these imports under the existing `from __future__ import annotations`:

```python
import json
import logging
from functools import cache
from importlib.resources import files

from jsonschema import Draft202012Validator
from jsonschema.validators import RefResolver
```

Add the following block immediately after the imports and before the `class A2UIClientAction` declaration:

```python
log = logging.getLogger(__name__)


# a2ui-agent-sdk 0.2.1 ships v0.9 JSON Schemas under a2ui/assets/0.9/.
# Only server→client schemas are bundled (server_to_client.json,
# common_types.json, basic_catalog.json). The SDK's own design treats
# client→server messages as Pydantic/Zod-validated, so we mirror that:
# outbound validation goes through the validator below; inbound uses the
# Pydantic models in this module.
_A2UI_SCHEMA_DIR = files("a2ui").joinpath("assets/0.9")


def _load_schema(filename: str) -> dict:
    return json.loads(_A2UI_SCHEMA_DIR.joinpath(filename).read_text())


@cache
def _server_to_client_validator() -> Draft202012Validator:
    """Validator for v0.9 server→client envelopes (createSurface,
    updateComponents, updateDataModel). Resolves $ref to common_types."""
    s2c = _load_schema("server_to_client.json")
    common = _load_schema("common_types.json")
    resolver = RefResolver.from_schema(
        s2c, store={"common_types.json": common},
    )
    return Draft202012Validator(s2c, resolver=resolver)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_actions.py -v
```

Expected: all tests PASS (9 from Task 2 + 3 outbound-validator tests = 12 total).

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py \
        libs/idun_agent_engine/tests/unit/a2ui/test_actions.py \
        libs/idun_agent_engine/tests/unit/a2ui/fixtures/
git commit -m "$(cat <<'EOF'
feat(engine): add A2UI v0.9 outbound JSON Schema validator

Loads server_to_client.json + common_types.json from a2ui-agent-sdk's
bundled assets at a2ui/assets/0.9/. Wraps Draft202012Validator with a
RefResolver pinning common_types so $ref resolution stays local.
Validator is a functools.cached singleton, consumed by the envelope
retrofit in T6.

Inbound (client→server) actions/data-model are not validated here —
the SDK does not ship those JSON Schemas (its own client→server path
relies on Pydantic/Zod). We follow the same stance; T4 covers inbound
validation via Pydantic mirrors with extra="forbid".

Adds fixture files used by T4's Pydantic tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `read_a2ui_context` ingest helper

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py`
- Test: `libs/idun_agent_engine/tests/unit/a2ui/test_actions.py` (extend)

- [ ] **Step 1: Append soft-fail tests to `test_actions.py`**

Append:

```python


@pytest.mark.unit
class TestReadA2UIContext:
    def _state_with_action(self, *, with_dm: bool = False) -> dict:
        import json
        from pathlib import Path
        fx = Path(__file__).parent / "fixtures"
        msg = json.loads((fx / "valid_action.json").read_text())
        state: dict = {"messages": [], "idun": {"a2uiClientMessage": msg}}
        if with_dm:
            state["idun"]["a2uiClientDataModel"] = json.loads(
                (fx / "valid_data_model.json").read_text()
            )
        return state

    def test_returns_typed_view(self) -> None:
        from idun_agent_engine.a2ui.actions import (
            read_a2ui_context, A2UIContext,
        )
        ctx = read_a2ui_context(self._state_with_action(with_dm=True))
        assert isinstance(ctx, A2UIContext)
        assert ctx.action.name == "submit_form"
        assert ctx.action.surface_id == "a2ui_showcase"
        assert ctx.action.source_component_id == "btn_demo"
        assert ctx.data_for("a2ui_showcase") == {
            "name": "alice", "agreed": True,
            "color": "blue", "volume": 50,
            "when": "2026-06-01T09:00:00Z",
        }

    def test_text_mode_returns_none(self) -> None:
        from idun_agent_engine.a2ui.actions import read_a2ui_context
        assert read_a2ui_context({"messages": []}) is None
        assert read_a2ui_context({}) is None

    def test_idun_present_but_no_message_returns_none(self) -> None:
        from idun_agent_engine.a2ui.actions import read_a2ui_context
        assert read_a2ui_context({"idun": {}}) is None

    def test_data_model_optional(self) -> None:
        from idun_agent_engine.a2ui.actions import read_a2ui_context
        ctx = read_a2ui_context(self._state_with_action(with_dm=False))
        assert ctx is not None
        assert ctx.data_model is None
        assert ctx.data_for("a2ui_showcase") is None

    def test_malformed_action_returns_none_and_logs(self, caplog) -> None:
        import logging
        from idun_agent_engine.a2ui.actions import read_a2ui_context
        bad = self._state_with_action()
        del bad["idun"]["a2uiClientMessage"]["action"]["timestamp"]
        with caplog.at_level(logging.WARNING):
            ctx = read_a2ui_context(bad)
        assert ctx is None
        assert any(
            "a2ui payload failed validation" in rec.getMessage()
            for rec in caplog.records
        )

    def test_extra_field_rejected_by_pydantic(self, caplog) -> None:
        # Pydantic with extra="forbid" must reject unknown fields. This is
        # our mandatory inbound validation layer (the SDK does not ship
        # client_to_server JSON Schemas, so Pydantic IS the schema).
        import logging
        from idun_agent_engine.a2ui.actions import read_a2ui_context
        bad = self._state_with_action()
        bad["idun"]["a2uiClientMessage"]["action"]["unknownField"] = "x"
        with caplog.at_level(logging.WARNING):
            ctx = read_a2ui_context(bad)
        assert ctx is None

    def test_malformed_data_model_returns_none(self, caplog) -> None:
        import logging
        from idun_agent_engine.a2ui.actions import read_a2ui_context
        bad = self._state_with_action(with_dm=True)
        bad["idun"]["a2uiClientDataModel"]["surfaces"] = "not-a-dict"
        with caplog.at_level(logging.WARNING):
            ctx = read_a2ui_context(bad)
        assert ctx is None

    def test_state_with_non_dict_idun_returns_none(self) -> None:
        from idun_agent_engine.a2ui.actions import read_a2ui_context
        assert read_a2ui_context({"idun": "scalar"}) is None
        assert read_a2ui_context({"idun": [1, 2, 3]}) is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_actions.py -v
```

Expected: existing tests pass; new ones FAIL with `ImportError: cannot import name 'read_a2ui_context' from 'idun_agent_engine.a2ui.actions'`.

- [ ] **Step 3: Append `read_a2ui_context` to `actions.py`**

At the end of `libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py`:

```python


from typing import Mapping  # noqa: E402  — placed after class defs for docstring coherence


def read_a2ui_context(state: Mapping[str, Any]) -> A2UIContext | None:
    """Read + Pydantic-validate + box the A2UI action+dataModel from state.

    ag-ui-langgraph spreads the request's ``forwarded_props`` into the
    initial LangGraph input via ``stream_input = {**forwarded_props,
    **payload_input}`` (see ag_ui_langgraph/agent.py:540), so
    ``state["idun"]["a2uiClientMessage"]`` and (optionally)
    ``state["idun"]["a2uiClientDataModel"]`` are visible to nodes.

    Validation is mandatory and Pydantic-backed (the SDK does not ship
    JSON Schemas for client→server messages, matching its own design).
    Pydantic models use ``extra="forbid"`` so malformed payloads fail
    loudly. Soft-fails to None on missing or malformed payload (logs a
    WARNING). Text-mode turns (no idun.a2uiClientMessage) return None
    silently — designed so a frontend bug in the action path can never
    crash a text-mode turn.
    """
    from pydantic import ValidationError

    if not isinstance(state, Mapping):
        return None
    idun = state.get("idun")
    if not isinstance(idun, Mapping):
        return None
    raw_msg = idun.get("a2uiClientMessage")
    raw_dm = idun.get("a2uiClientDataModel")
    if raw_msg is None:
        return None

    try:
        msg = A2UIClientMessage.model_validate(raw_msg)
        dm = (
            A2UIClientDataModel.model_validate(raw_dm)
            if raw_dm is not None
            else None
        )
    except ValidationError as e:
        log.warning("a2ui payload failed validation: %s", e)
        return None
    return A2UIContext(action=msg.action, data_model=dm)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_actions.py -v
```

Expected: all tests PASS (12 from Tasks 2-3 + 8 new = 20 total).

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py \
        libs/idun_agent_engine/tests/unit/a2ui/test_actions.py
git commit -m "$(cat <<'EOF'
feat(engine): add read_a2ui_context helper for action ingest

Reads idun.a2uiClientMessage + (optional) idun.a2uiClientDataModel
from LangGraph state, validates via the Pydantic mirror models
(extra="forbid"), and boxes into typed A2UIContext.

Validation is mandatory and Pydantic-backed — a2ui-agent-sdk does not
ship JSON Schemas for client→server (the SDK's own design treats this
direction as Pydantic/Zod-validated; we follow the same stance).

Soft-fail design: text-mode turns and malformed payloads both return
None — agents that mix text + action turns won't crash if the frontend
ever ships a stray idun key. Validation errors are logged at WARNING.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Re-export new public API from `a2ui/__init__.py`

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/a2ui/__init__.py`

- [ ] **Step 1: Inspect current exports**

```bash
cat libs/idun_agent_engine/src/idun_agent_engine/a2ui/__init__.py
```

Expected to find existing `__all__` with at minimum: `BASIC_CATALOG_V09`, `emit_surface`, `update_components`.

- [ ] **Step 2: Add the new imports + extend `__all__`**

Edit `libs/idun_agent_engine/src/idun_agent_engine/a2ui/__init__.py`. Add new imports (alphabetical):

```python
from idun_agent_engine.a2ui.actions import (
    A2UIClientAction,
    A2UIClientDataModel,
    A2UIClientMessage,
    A2UIContext,
    read_a2ui_context,
)
```

Update `__all__` to include the new names alphabetically:

```python
__all__ = [
    "A2UIClientAction",
    "A2UIClientDataModel",
    "A2UIClientMessage",
    "A2UIContext",
    "BASIC_CATALOG_V09",
    "emit_surface",
    "read_a2ui_context",
    "update_components",
]
```

- [ ] **Step 3: Smoke-test the public import path**

```bash
uv run --no-sync python -c "
from idun_agent_engine.a2ui import (
    A2UIClientAction, A2UIClientDataModel, A2UIClientMessage,
    A2UIContext, BASIC_CATALOG_V09, emit_surface,
    read_a2ui_context, update_components,
)
print('OK')
"
```

Expected: `OK`. Any `ImportError` means the module path is wrong — fix and retry.

- [ ] **Step 4: Run all engine tests to confirm no regression**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/ -v
```

Expected: 23 actions tests + WS2 tests (envelope + helpers) all PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/a2ui/__init__.py
git commit -m "$(cat <<'EOF'
feat(engine): re-export A2UI action types and read_a2ui_context

Exposes A2UIClientAction, A2UIClientDataModel, A2UIClientMessage,
A2UIContext, and read_a2ui_context from idun_agent_engine.a2ui so
agent authors can import the typed view in one line.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — WS2 envelope retrofit

### Task 6: Mandatory schema validation in `build_emit_envelope`

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/a2ui/envelope.py`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/a2ui/helpers.py`
- Test: `libs/idun_agent_engine/tests/unit/a2ui/test_envelope_validation.py` (NEW)

- [ ] **Step 1: Inspect current envelope module**

```bash
sed -n '1,80p' libs/idun_agent_engine/src/idun_agent_engine/a2ui/envelope.py
```

Identify the signature of `build_emit_envelope` and `build_update_envelope`. Note that `build_emit_envelope` already accepts a `data` kwarg added in WS2 fix-ups.

- [ ] **Step 2: Add validation tests (red phase)**

Create `libs/idun_agent_engine/tests/unit/a2ui/test_envelope_validation.py`:

```python
"""Mandatory JSON Schema validation tests for build_emit/update_envelope.

WS3 retrofit: every envelope produced by these builders is validated
against A2UI v0.9's server_to_client.json before returning. Malformed
envelopes raise ValueError with the JSON-Schema error path.
"""
from __future__ import annotations

import pytest


def _basic_components() -> list[dict]:
    return [
        {"id": "title", "component": "Text", "text": "Hi"},
        {"id": "root", "component": "Card", "child": "title"},
    ]


@pytest.mark.unit
class TestBuildEmitEnvelopeValidation:
    def test_happy_path_validates(self) -> None:
        from idun_agent_engine.a2ui.envelope import build_emit_envelope
        env = build_emit_envelope(
            surface_id="s1", components=_basic_components(),
        )
        # No exception means validation passed.
        assert "messages" in env
        assert env["surfaceId"] == "s1"

    def test_typo_component_key_raises(self) -> None:
        from idun_agent_engine.a2ui.envelope import build_emit_envelope
        bad = [
            {"id": "title", "compoonent": "Text", "text": "Hi"},  # typo
            {"id": "root", "component": "Card", "child": "title"},
        ]
        with pytest.raises(ValueError, match="schema"):
            build_emit_envelope(surface_id="s1", components=bad)

    def test_unknown_component_type_raises(self) -> None:
        from idun_agent_engine.a2ui.envelope import build_emit_envelope
        bad = [
            {"id": "x", "component": "TableThatDoesntExist"},
            {"id": "root", "component": "Card", "child": "x"},
        ]
        with pytest.raises(ValueError, match="schema"):
            build_emit_envelope(surface_id="s1", components=bad)

    def test_send_data_model_default_true(self) -> None:
        from idun_agent_engine.a2ui.envelope import build_emit_envelope
        env = build_emit_envelope(
            surface_id="s1", components=_basic_components(),
        )
        # Find the createSurface message and assert sendDataModel true.
        create_msg = next(
            m for m in env["messages"] if "createSurface" in m
        )
        assert create_msg["createSurface"]["sendDataModel"] is True

    def test_send_data_model_can_be_disabled(self) -> None:
        from idun_agent_engine.a2ui.envelope import build_emit_envelope
        env = build_emit_envelope(
            surface_id="s1", components=_basic_components(),
            send_data_model=False,
        )
        create_msg = next(
            m for m in env["messages"] if "createSurface" in m
        )
        assert create_msg["createSurface"]["sendDataModel"] is False


@pytest.mark.unit
class TestBuildUpdateEnvelopeValidation:
    def test_happy_path_validates(self) -> None:
        from idun_agent_engine.a2ui.envelope import build_update_envelope
        env = build_update_envelope(
            surface_id="s1", components=_basic_components(),
        )
        assert "messages" in env

    def test_invalid_components_raise(self) -> None:
        from idun_agent_engine.a2ui.envelope import build_update_envelope
        bad = [
            {"id": "x", "component": "NotARealComponent"},
            {"id": "root", "component": "Card", "child": "x"},
        ]
        with pytest.raises(ValueError, match="schema"):
            build_update_envelope(surface_id="s1", components=bad)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_envelope_validation.py -v
```

Expected: tests FAIL — happy paths pass (validation not yet wired) but the typo/unknown tests don't raise, and `sendDataModel` field doesn't exist yet.

- [ ] **Step 4: (no-op — `_server_to_client_validator` already exists)**

The outbound validator was added in Task 3. Verify it imports cleanly:

```bash
uv run --no-sync python -c "from idun_agent_engine.a2ui.actions import _server_to_client_validator; print(_server_to_client_validator())"
```

Expected: prints a `Draft202012Validator` repr. Skip this step's "append code" portion entirely — the validator is already in place.

- [ ] **Step 5: Wire validation + `send_data_model` into `envelope.py`**

Open `libs/idun_agent_engine/src/idun_agent_engine/a2ui/envelope.py`. At the top, add:

```python
from idun_agent_engine.a2ui.actions import _server_to_client_validator
```

Modify `build_emit_envelope` signature to add `send_data_model: bool = True` and inject the field into the `createSurface` message. Then validate the assembled envelope. The function body becomes (replace the existing implementation):

```python
def build_emit_envelope(
    *,
    surface_id: str,
    components: list[dict[str, Any]],
    fallback_text: str | None = None,
    catalog_id: str = BASIC_CATALOG_V09,
    metadata: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    send_data_model: bool = True,
) -> dict[str, Any]:
    """Build a complete A2UI v0.9 surface-emit envelope.

    Validates the produced envelope against server_to_client.json before
    returning. Raises ValueError on validation failure with the JSON-Schema
    error path so the agent author sees malformed components at agent side
    instead of silent placeholder rendering.

    sendDataModel defaults to True so the surface's dataModel is forwarded
    on every action click (powers form-submit flows).
    """
    create_surface: dict[str, Any] = {
        "surfaceId": surface_id,
        "catalogId": catalog_id,
        "sendDataModel": send_data_model,
    }
    if fallback_text is not None:
        create_surface["fallbackText"] = fallback_text
    if metadata is not None:
        create_surface["metadata"] = dict(metadata)

    messages: list[dict[str, Any]] = [
        {"version": "v0.9", "createSurface": create_surface},
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": surface_id,
                "components": list(components),
            },
        },
    ]
    if data is not None:
        messages.append({
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": surface_id,
                "data": dict(data),
            },
        })

    envelope = {
        "a2uiVersion": "v0.9",
        "surfaceId": surface_id,
        "fallbackText": fallback_text,
        "messages": messages,
        "metadata": dict(metadata) if metadata is not None else None,
    }

    _validate_messages(messages)
    return envelope
```

Modify `build_update_envelope` to also validate. Replace its body with:

```python
def build_update_envelope(
    *,
    surface_id: str,
    components: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build an updateComponents-only envelope for an existing surface.

    Validates against server_to_client.json before returning.
    """
    messages = [
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": surface_id,
                "components": list(components),
            },
        },
    ]
    _validate_messages(messages)
    return {
        "a2uiVersion": "v0.9",
        "surfaceId": surface_id,
        "messages": messages,
    }
```

Add the validator helper at module level (just below the existing imports / `BASIC_CATALOG_V09` definition):

```python
def _validate_messages(messages: list[dict[str, Any]]) -> None:
    """Validate each envelope message against server_to_client.json.

    The schema is per-message (one of createSurface, updateComponents,
    updateDataModel), so we iterate. Raises ValueError on the first
    schema error with the JSON Pointer path to the offending node.
    """
    validator = _server_to_client_validator()
    for i, msg in enumerate(messages):
        errors = list(validator.iter_errors(msg))
        if errors:
            err = errors[0]
            path = "/".join(str(p) for p in err.absolute_path)
            raise ValueError(
                f"a2ui envelope message {i} failed schema "
                f"validation at /{path}: {err.message}"
            )
```

- [ ] **Step 6: Update `helpers.py` to forward `send_data_model`**

Open `libs/idun_agent_engine/src/idun_agent_engine/a2ui/helpers.py`. Modify `emit_surface` signature to add the kwarg and forward it. The change is a one-line addition:

```python
async def emit_surface(
    config: RunnableConfig,
    *,
    surface_id: str,
    components: list[dict[str, Any]],
    fallback_text: str | None = None,
    catalog_id: str = BASIC_CATALOG_V09,
    metadata: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    send_data_model: bool = True,
) -> None:
    envelope = build_emit_envelope(
        surface_id=surface_id,
        components=components,
        fallback_text=fallback_text,
        catalog_id=catalog_id,
        metadata=metadata,
        data=data,
        send_data_model=send_data_model,
    )
    await adispatch_custom_event(CUSTOM_EVENT_NAME, envelope, config=config)
```

(The docstring already mentions `data=`. Add a line: ```send_data_model`` controls whether the surface's dataModel is forwarded to the agent on action clicks; default True.`)

- [ ] **Step 7: Run validation tests to verify they pass**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/test_envelope_validation.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 8: Run all WS2 tests to confirm no regression**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/unit/a2ui/ libs/idun_agent_engine/tests/integration/test_a2ui_passthrough.py -v
```

Expected: existing envelope/helpers/integration tests still PASS — the existing envelopes are valid by construction, so adding validation is non-breaking.

- [ ] **Step 9: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/a2ui/envelope.py \
        libs/idun_agent_engine/src/idun_agent_engine/a2ui/helpers.py \
        libs/idun_agent_engine/src/idun_agent_engine/a2ui/actions.py \
        libs/idun_agent_engine/tests/unit/a2ui/test_envelope_validation.py
git commit -m "$(cat <<'EOF'
feat(engine): WS2 envelope retrofit — mandatory schema validation

build_emit_envelope and build_update_envelope now validate every
message against A2UI v0.9 server_to_client.json before returning.
Malformed components raise ValueError with the JSON Pointer path to
the bad node — catches typos at agent side instead of silent
placeholder rendering on the frontend.

Adds send_data_model: bool = True kwarg to build_emit_envelope and
emit_surface. Defaults on so dataModel travels with action clicks
(powers form-submit flows in WS3).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Engine integration tests for action passthrough

**Files:**
- Create: `libs/idun_agent_engine/tests/integration/test_a2ui_action_passthrough.py`

- [ ] **Step 1: Inspect existing integration test for the passthrough harness**

```bash
sed -n '1,60p' libs/idun_agent_engine/tests/integration/test_a2ui_passthrough.py
```

Note the pattern: Pydantic `RunAgentInput` body, `TestClient` POST to `/agent/run`, parse SSE frames.

- [ ] **Step 2: Create the action-passthrough test file**

Create `libs/idun_agent_engine/tests/integration/test_a2ui_action_passthrough.py`:

```python
"""End-to-end integration: forwardedProps.idun.a2uiClientMessage round-trips
to a LangGraph node via /agent/run, where read_a2ui_context returns a typed
A2UIContext.

Uses an inline LangGraph fixture (no external file) so the test is fully
self-contained and doesn't depend on the smoke-test agent.
"""
from __future__ import annotations

import json
from typing import Annotated, Any, TypedDict
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from idun_agent_engine.a2ui import emit_surface, read_a2ui_context
from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig


class _State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


async def _node(state: _State, config: RunnableConfig) -> _State:
    ctx = read_a2ui_context(state)
    if ctx is None:
        return {"messages": [AIMessage(content="text-mode")]}
    text = (
        f"got name={ctx.action.name} "
        f"src={ctx.action.source_component_id} "
        f"surface={ctx.action.surface_id}"
    )
    if ctx.data_model is not None:
        text += f" data_keys={sorted(ctx.data_for(ctx.action.surface_id) or {})}"
    return {"messages": [AIMessage(content=text)]}


def _build_graph():
    builder = StateGraph(_State)
    builder.add_node("respond", _node)
    builder.set_entry_point("respond")
    builder.add_edge("respond", END)
    return builder.compile(checkpointer=InMemorySaver())


@pytest.fixture
def client(monkeypatch):
    """A FastAPI TestClient with an in-process LangGraph fixture."""
    graph = _build_graph()
    cfg = EngineConfig.model_validate({
        "server": {"api": {"port": 8080}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "ws3-action-fixture",
                # Bypass file/module loading by injecting via a monkey-patch
                # on the dynamic loader the engine uses. The cleanest hook
                # is to set the resolved graph via an env-var-style override
                # supported by the LANGGRAPH adapter — see existing
                # tests/integration/test_a2ui_passthrough.py for the pattern.
                "graph_definition": "INLINE",
                "checkpointer": {"type": "memory"},
            },
        },
    })
    monkeypatch.setattr(
        "idun_agent_engine.agent.langgraph.langgraph._resolve_graph",
        lambda *_args, **_kwargs: graph,
    )
    app = create_app(engine_config=cfg)
    return TestClient(app)


def _post_run(client, *, forwarded_props: dict | None, message: str | None):
    body: dict[str, Any] = {
        "threadId": str(uuid4()),
        "runId": str(uuid4()),
        "messages": (
            [{"id": "u1", "role": "user", "content": message}] if message else []
        ),
        "state": {},
        "tools": [],
        "context": [],
        "forwardedProps": forwarded_props or {},
    }
    return client.post("/agent/run", json=body, headers={"accept": "text/event-stream"})


def _assistant_text(response) -> str:
    """Pull the final assistant message text out of the SSE stream."""
    final = ""
    for line in response.text.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            evt = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if evt.get("type") in ("MESSAGES_SNAPSHOT", "MessagesSnapshot"):
            msgs = evt.get("messages") or []
            for m in msgs:
                if (m.get("role") or "").lower() in ("assistant", "ai"):
                    final = str(m.get("content") or "")
        elif evt.get("type") in ("TEXT_MESSAGE_CONTENT", "TextMessageContent"):
            final += str(evt.get("delta") or "")
    return final


@pytest.mark.integration
class TestActionPassthrough:
    def test_run_with_action_lands_typed_at_node(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {
                        "name": "submit_form",
                        "surfaceId": "s1",
                        "sourceComponentId": "btn_demo",
                        "timestamp": "2026-05-05T00:00:00Z",
                        "context": {},
                    },
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        assert res.status_code == 200
        text = _assistant_text(res)
        assert "got name=submit_form" in text
        assert "src=btn_demo" in text
        assert "surface=s1" in text

    def test_run_with_action_and_data_model(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {
                        "name": "submit_form",
                        "surfaceId": "s1",
                        "sourceComponentId": "btn",
                        "timestamp": "2026-05-05T00:00:00Z",
                        "context": {},
                    },
                },
                "a2uiClientDataModel": {
                    "version": "v0.9",
                    "surfaces": {"s1": {"name": "alice", "agreed": True}},
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        assert res.status_code == 200
        text = _assistant_text(res)
        assert "data_keys=['agreed', 'name']" in text

    def test_run_without_idun_falls_through_to_text_mode(self, client):
        res = _post_run(client, forwarded_props={}, message="hi")
        assert res.status_code == 200
        assert "text-mode" in _assistant_text(res)

    def test_run_with_malformed_action_does_not_500(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {"name": "x"},  # missing required fields
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        assert res.status_code == 200, (
            f"expected 200 (soft-fail), got {res.status_code}: {res.text[:500]}"
        )
        assert "text-mode" in _assistant_text(res)

    def test_camel_case_nested_keys_preserved(self, client):
        # Ensures ag-ui-langgraph's snake_case-only-top-level rule didn't
        # rename a2uiClientMessage / surfaceId / sourceComponentId.
        forwarded = {
            "idun": {
                "a2uiClientMessage": {
                    "version": "v0.9",
                    "action": {
                        "name": "n",
                        "surfaceId": "S",
                        "sourceComponentId": "C",
                        "timestamp": "2026-05-05T00:00:00Z",
                        "context": {"camelKey": "preserved"},
                    },
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded, message=None)
        text = _assistant_text(res)
        assert "src=C" in text
        assert "surface=S" in text
```

- [ ] **Step 3: Run the integration tests**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/integration/test_a2ui_action_passthrough.py -v
```

Expected: all 5 tests PASS. If `_resolve_graph` monkey-patch path is wrong, inspect `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py` for the actual loader function name and adjust.

- [ ] **Step 4: Run all engine tests to confirm no regression**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/ -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q
```

Expected: full engine suite PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/idun_agent_engine/tests/integration/test_a2ui_action_passthrough.py
git commit -m "$(cat <<'EOF'
test(engine): integration coverage for A2UI action passthrough

End-to-end /agent/run + forwardedProps.idun.a2uiClientMessage tests:
typed action lands at node, dataModel preserved across the snake-case
top-level boundary, text-mode falls through, malformed payloads
soft-fail (no 500), nested camelCase keys reach the agent intact.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Frontend wiring

### Task 8: `runAgent` accepts `forwardedProps` option

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/agui.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/agui.run-agent.test.ts` (NEW)

- [ ] **Step 1: Create the test file (red phase)**

Create `services/idun_agent_standalone_ui/__tests__/agui.run-agent.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { runAgent } from "@/lib/agui";

const _origFetch = global.fetch;
const _stubBody = (text: string) =>
  new Response(new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });

describe("runAgent body shape", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("includes user message when message option is set", async () => {
    const captured: { body: string } = { body: "" };
    vi.spyOn(global, "fetch").mockImplementation(
      async (_url, init) => {
        captured.body = String(init?.body ?? "");
        return _stubBody("data: {\"type\":\"RUN_FINISHED\"}\n\n");
      },
    );
    await runAgent({
      threadId: "t1", runId: "r1", message: "hello",
      onEvent: () => {},
    });
    const body = JSON.parse(captured.body);
    expect(body.messages).toEqual([
      { id: "r1-u", role: "user", content: "hello" },
    ]);
    expect(body.forwardedProps).toEqual({});
  });

  it("forwardedProps option overrides default empty forwardedProps", async () => {
    const captured: { body: string } = { body: "" };
    vi.spyOn(global, "fetch").mockImplementation(
      async (_url, init) => {
        captured.body = String(init?.body ?? "");
        return _stubBody("data: {\"type\":\"RUN_FINISHED\"}\n\n");
      },
    );
    await runAgent({
      threadId: "t1", runId: "r1",
      forwardedProps: {
        idun: {
          a2uiClientMessage: {
            version: "v0.9",
            action: {
              name: "submit_form", surfaceId: "s1",
              sourceComponentId: "btn", timestamp: "2026-05-05T00:00:00Z",
              context: {},
            },
          },
        },
      },
      onEvent: () => {},
    });
    const body = JSON.parse(captured.body);
    expect(body.forwardedProps?.idun?.a2uiClientMessage?.action?.name)
      .toBe("submit_form");
  });

  it("omits the user message when only forwardedProps is provided", async () => {
    const captured: { body: string } = { body: "" };
    vi.spyOn(global, "fetch").mockImplementation(
      async (_url, init) => {
        captured.body = String(init?.body ?? "");
        return _stubBody("data: {\"type\":\"RUN_FINISHED\"}\n\n");
      },
    );
    await runAgent({
      threadId: "t1", runId: "r1",
      forwardedProps: { idun: {} },
      onEvent: () => {},
    });
    const body = JSON.parse(captured.body);
    expect(body.messages).toEqual([]);
  });
});

afterAll(() => {
  global.fetch = _origFetch;
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run __tests__/agui.run-agent.test.ts
```

Expected: tests FAIL — `RunOptions.message` is required, `forwardedProps` not accepted.

- [ ] **Step 3: Update `RunOptions` and `runAgent` in `lib/agui.ts`**

Open `services/idun_agent_standalone_ui/lib/agui.ts`. Modify the `RunOptions` type and `runAgent` body construction:

```ts
export type RunOptions = {
  threadId: string;
  runId: string;
  /** Text turn — append a user message to the history. Mutually
   *  exclusive in practice with forwardedProps but both can be set
   *  if a future flow needs it. */
  message?: string;
  /** Action / metadata turn — carry idun.a2uiClientMessage etc. */
  forwardedProps?: Record<string, unknown>;
  signal?: AbortSignal;
  onEvent: (event: AGUIEvent) => void;
};

export async function runAgent(opts: RunOptions): Promise<void> {
  const messages = opts.message
    ? [{ id: opts.runId + "-u", role: "user", content: opts.message }]
    : [];
  const res = await fetch("/agent/run", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      threadId: opts.threadId,
      runId: opts.runId,
      messages,
      state: {},
      tools: [],
      context: [],
      forwardedProps: opts.forwardedProps ?? {},
    }),
    signal: opts.signal,
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => null);
    const detail = (body as { detail?: string } | null)?.detail;
    throw new GuardrailRejectedError(detail ?? "Blocked by a guardrail.");
  }
  if (!res.ok || !res.body) {
    throw new Error(`agent run failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      const dataLine = chunk
        .split("\n")
        .map((l) => (l.startsWith("data:") ? l.slice(5).trim() : null))
        .filter(Boolean)
        .join("");
      if (!dataLine) continue;
      try {
        opts.onEvent(JSON.parse(dataLine));
      } catch {
        // ignore malformed event chunks
      }
    }
  }
}
```

- [ ] **Step 4: Add the `IdunForwardedProps` type at the end of the WS2 types section**

Add immediately after the existing `A2UISurfaceState` type:

```ts
import type { A2uiClientAction, A2uiClientDataModel } from "@a2ui/web_core/v0_9";

/** Action wire shape sent from the standalone-UI to the engine via
 *  forwardedProps. Mirrors A2UI v0.9 client_to_server.json#/properties/action
 *  carried inside an idun-namespaced sub-tree so other Idun features can
 *  add fields without colliding. */
export type IdunForwardedProps = {
  idun: {
    a2uiClientMessage: { version: "v0.9"; action: A2uiClientAction };
    a2uiClientDataModel?: A2uiClientDataModel;
  };
};
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run __tests__/agui.run-agent.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Run full standalone-UI test suite to confirm no regression**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run
```

Expected: existing tests (use-chat, a2ui-surface-wrapper, etc.) still PASS — the change is purely additive (`message` and `forwardedProps` both optional, defaults preserve old behaviour).

- [ ] **Step 7: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/agui.ts \
        services/idun_agent_standalone_ui/__tests__/agui.run-agent.test.ts
git commit -m "$(cat <<'EOF'
feat(standalone-ui): runAgent accepts forwardedProps for action turns

Adds optional forwardedProps to RunOptions so action turns can POST
/agent/run without a synthetic user message. Existing text-turn
callers are unaffected (message option remains optional with same
default behaviour).

Adds IdunForwardedProps type aliasing @a2ui/web_core/v0_9's
A2uiClientAction and A2uiClientDataModel inside an idun-namespaced
sub-tree.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `useChat.sendAction` + `useChatActions` hook

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/use-chat.ts`
- Test: `services/idun_agent_standalone_ui/__tests__/use-chat.send-action.test.ts` (NEW)

- [ ] **Step 1: Create the test file (red phase)**

Create `services/idun_agent_standalone_ui/__tests__/use-chat.send-action.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/agui", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agui")>("@/lib/agui");
  return {
    ...actual,
    runAgent: vi.fn(async (opts) => {
      // Simulate one tick of the run terminating cleanly.
      opts.onEvent({ type: "RUN_FINISHED" });
    }),
  };
});

import { runAgent } from "@/lib/agui";
import { useChat } from "@/lib/use-chat";

describe("useChat.sendAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const _action = {
    name: "submit_form",
    surfaceId: "s1",
    sourceComponentId: "btn",
    timestamp: "2026-05-05T00:00:00Z",
    context: {},
  };

  it("POSTs forwardedProps with idun.a2uiClientMessage", async () => {
    const { result } = renderHook(() => useChat("t1"));
    await act(async () => { await result.current.sendAction(_action, undefined); });
    expect(runAgent).toHaveBeenCalledTimes(1);
    const opts = (runAgent as any).mock.calls[0][0];
    expect(opts.forwardedProps?.idun?.a2uiClientMessage?.action?.name)
      .toBe("submit_form");
    expect(opts.message).toBeUndefined();
  });

  it("includes a2uiClientDataModel when provided", async () => {
    const { result } = renderHook(() => useChat("t1"));
    const dm = {
      version: "v0.9" as const,
      surfaces: { s1: { name: "alice" } },
    };
    await act(async () => { await result.current.sendAction(_action, dm); });
    const opts = (runAgent as any).mock.calls[0][0];
    expect(opts.forwardedProps?.idun?.a2uiClientDataModel).toEqual(dm);
  });

  it("omits a2uiClientDataModel when undefined", async () => {
    const { result } = renderHook(() => useChat("t1"));
    await act(async () => { await result.current.sendAction(_action, undefined); });
    const opts = (runAgent as any).mock.calls[0][0];
    expect(opts.forwardedProps?.idun).not.toHaveProperty("a2uiClientDataModel");
  });

  it("does not append a synthetic user message", async () => {
    const { result } = renderHook(() => useChat("t1"));
    await act(async () => { await result.current.sendAction(_action, undefined); });
    const userMessages = result.current.messages.filter(m => m.role === "user");
    expect(userMessages).toEqual([]);
  });

  it("appends an assistant placeholder for the streaming response", async () => {
    const { result } = renderHook(() => useChat("t1"));
    await act(async () => { await result.current.sendAction(_action, undefined); });
    const assistants = result.current.messages.filter(m => m.role === "assistant");
    expect(assistants).toHaveLength(1);
  });

  it("flips status to streaming and back to idle", async () => {
    const { result } = renderHook(() => useChat("t1"));
    expect(result.current.status).toBe("idle");
    await act(async () => { await result.current.sendAction(_action, undefined); });
    await waitFor(() => expect(result.current.status).toBe("idle"));
  });

  it("is a no-op when status is not idle", async () => {
    const { result } = renderHook(() => useChat("t1"));
    // Force status into a non-idle state by sending a stuck text turn first
    // — easiest reproduction: spy on runAgent the first time to never resolve.
    let resolveFirst: () => void = () => {};
    (runAgent as any).mockImplementationOnce(
      (opts: any) => new Promise<void>((r) => {
        resolveFirst = () => { opts.onEvent({ type: "RUN_FINISHED" }); r(); };
      }),
    );
    void act(() => { result.current.send("hello"); });
    await waitFor(() => expect(result.current.status).toBe("streaming"));
    (runAgent as any).mockClear();
    await act(async () => { await result.current.sendAction(_action, undefined); });
    expect(runAgent).not.toHaveBeenCalled();
    resolveFirst();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run __tests__/use-chat.send-action.test.ts
```

Expected: tests FAIL — `result.current.sendAction` is undefined (function doesn't exist yet).

- [ ] **Step 3: Add `sendAction` and `useChatActions` to `use-chat.ts`**

Open `services/idun_agent_standalone_ui/lib/use-chat.ts`. Add the import alongside the existing imports:

```ts
import type { A2uiClientAction, A2uiClientDataModel } from "@a2ui/web_core/v0_9";
import type { IdunForwardedProps } from "@/lib/agui";
```

In the `useChat` function (after the existing `send` callback definition), add a new `sendAction` callback:

```ts
const sendAction = useCallback(
  async (
    action: A2uiClientAction,
    dataModel: A2uiClientDataModel | undefined,
  ): Promise<void> => {
    // Belt-and-braces guard. The wrapper already gates click delivery
    // via isInteractive; this stops a programmatic call mid-stream.
    if (status !== "idle") return;

    hydratableRef.current = false;
    const runId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: runId + "-a",
      role: "assistant",
      text: "",
      toolCalls: [],
      thinking: [],
      opener: "",
      plan: "",
      thoughts: "",
      streaming: true,
    };
    setMessages((m) => [...m, assistantMsg]);
    setStatus("streaming");
    setError(null);

    abortRef.current = new AbortController();
    const snapshotRef: SnapshotRef = { current: null };

    const forwardedProps: IdunForwardedProps = {
      idun: {
        a2uiClientMessage: { version: "v0.9", action },
        ...(dataModel ? { a2uiClientDataModel: dataModel } : {}),
      },
    };

    try {
      await runAgent({
        threadId,
        runId,
        forwardedProps: forwardedProps as unknown as Record<string, unknown>,
        signal: abortRef.current.signal,
        onEvent: (e) => {
          const captured: ChatEvent = {
            ...e,
            _id: ++eventIdRef.current,
            _at: Date.now(),
          };
          setEvents((prev) => {
            const next = [...prev, captured];
            return next.length > MAX_EVENTS
              ? next.slice(next.length - MAX_EVENTS)
              : next;
          });
          applyEvent(setMessages, setStatus, setError, snapshotRef, e);
        },
      });
    } catch (e: unknown) {
      const name = (e as { name?: string }).name;
      if (e instanceof GuardrailRejectedError) {
        setStatus("idle");
        setError(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.role === "assistant" && m.id === assistantMsg.id
              ? { ...m, text: e.reason, streaming: false }
              : m,
          ),
        );
      } else if (name !== "AbortError") {
        setStatus("error");
        setError((e as Error).message ?? "stream failed");
      } else {
        setStatus("idle");
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" && m.id === assistantMsg.id && m.streaming
            ? { ...m, streaming: false, currentStep: undefined }
            : m,
        ),
      );
    }
  },
  [threadId, status],
);
```

Update the `useChat` return value to include `sendAction`:

```ts
return { messages, events, status, error, send, sendAction, stop };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run __tests__/use-chat.send-action.test.ts
```

Expected: 7 tests PASS. The "no-op when status is not idle" test relies on the `runAgent` mock not resolving — if it hangs indefinitely, instrument with `vi.useFakeTimers()` or shorten the wait window.

- [ ] **Step 5: Run full standalone-UI test suite**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run
```

Expected: pre-existing tests (incl. 11 use-chat tests, 7 a2ui-surface-wrapper tests) still PASS.

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/use-chat.ts \
        services/idun_agent_standalone_ui/__tests__/use-chat.send-action.test.ts
git commit -m "$(cat <<'EOF'
feat(standalone-ui): useChat.sendAction for A2UI action turns

Adds sendAction(action, dataModel?) to the useChat API. POSTs /agent/run
with forwardedProps.idun.a2uiClientMessage (+ optional client data
model) — no synthetic user message bubble. Status flips to streaming,
abort handling matches the existing send(text) flow.

No-op when status is not idle, so a stray click during a run doesn't
fire a duplicate request.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `A2UISurfaceWrapper` actionHandler + `isInteractive`

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/a2ui/A2UISurfaceWrapper.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.action.test.tsx` (NEW)
- Test: `services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.test.tsx` (extend)

- [ ] **Step 1: Create the action wiring test (red phase)**

Create `services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.action.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { A2UISurfaceWrapper } from "@/components/chat/a2ui/A2UISurfaceWrapper";
import type { A2UISurfaceState } from "@/lib/agui";

const _capturedHandlers: Array<(a: any) => void> = [];
const _stubProcessor = {
  model: { dispose: vi.fn() },
  processMessages: vi.fn(),
  onSurfaceCreated: vi.fn((handler: (s: { id: string }) => void) => {
    queueMicrotask(() => handler({ id: "s1" }));
    return { unsubscribe: vi.fn() };
  }),
  getClientDataModel: vi.fn(() => ({
    version: "v0.9",
    surfaces: { s1: { name: "alice" } },
  })),
};

vi.mock("@a2ui/web_core/v0_9", () => ({
  MessageProcessor: vi.fn().mockImplementation(
    (_catalogs: unknown[], handler?: (a: any) => void) => {
      if (handler) _capturedHandlers.push(handler);
      return _stubProcessor;
    },
  ),
}));

vi.mock("@a2ui/react/v0_9", async () => {
  const React = await import("react");
  return {
    A2uiSurface: ({ surface }: { surface: { id: string } | null }) => (
      <div data-testid="a2ui-surface" data-surface-id={surface?.id} />
    ),
    basicCatalog: { id: "basic" },
    MarkdownContext: React.createContext<unknown>(undefined),
  };
});

vi.mock("@a2ui/markdown-it", () => ({
  renderMarkdown: vi.fn(async (t: string) => `<p>${t}</p>`),
}));

const _sendAction = vi.fn();
vi.mock("@/lib/use-chat", async () => {
  const actual = await vi.importActual<any>("@/lib/use-chat");
  return {
    ...actual,
    useChatActions: () => ({ sendAction: _sendAction }),
  };
});

const _surface: A2UISurfaceState = {
  surfaceId: "s1",
  catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
  messages: [],
};
const _action = {
  name: "submit_form", surfaceId: "s1", sourceComponentId: "btn",
  timestamp: "2026-05-05T00:00:00Z", context: {},
};

describe("A2UISurfaceWrapper action wiring", () => {
  beforeEach(() => {
    _capturedHandlers.length = 0;
    _sendAction.mockClear();
    _stubProcessor.processMessages.mockClear();
    _stubProcessor.getClientDataModel.mockClear();
  });

  it("forwards action to sendAction with dataModel snapshot when interactive", () => {
    render(<A2UISurfaceWrapper surface={_surface} isInteractive={true} />);
    expect(_capturedHandlers).toHaveLength(1);
    act(() => { _capturedHandlers[0](_action); });
    expect(_sendAction).toHaveBeenCalledTimes(1);
    expect(_sendAction).toHaveBeenCalledWith(_action, expect.objectContaining({
      version: "v0.9",
    }));
  });

  it("no-ops when not interactive", () => {
    render(<A2UISurfaceWrapper surface={_surface} isInteractive={false} />);
    expect(_capturedHandlers).toHaveLength(1);
    act(() => { _capturedHandlers[0](_action); });
    expect(_sendAction).not.toHaveBeenCalled();
  });

  it("applies pointer-events-none class when not interactive", () => {
    const { container } = render(
      <A2UISurfaceWrapper surface={_surface} isInteractive={false} />,
    );
    // Wait for the surface to render after onSurfaceCreated fires.
    return Promise.resolve().then(() => {
      const root = container.querySelector(".a2ui-surface");
      expect(root?.className).toContain("pointer-events-none");
    });
  });

  it("does not apply pointer-events-none when interactive", () => {
    const { container } = render(
      <A2UISurfaceWrapper surface={_surface} isInteractive={true} />,
    );
    return Promise.resolve().then(() => {
      const root = container.querySelector(".a2ui-surface");
      expect(root?.className).not.toContain("pointer-events-none");
    });
  });
});
```

- [ ] **Step 2: Add a `useChatActions` hook to `use-chat.ts`**

In `services/idun_agent_standalone_ui/lib/use-chat.ts`, after the `useChat` definition, add a small subscription hook so the wrapper can pull `sendAction` without re-rendering on unrelated chat state changes:

```ts
/**
 * Lightweight action accessor for components nested deep in the chat tree
 * (e.g., A2UISurfaceWrapper). Composes onto useChat by living in the same
 * file. Currently a thin pass-through; if performance becomes a concern,
 * promote to a context provider.
 */
import { createContext, useContext } from "react";

type ChatActionsContextValue = {
  sendAction: (
    action: import("@a2ui/web_core/v0_9").A2uiClientAction,
    dataModel: import("@a2ui/web_core/v0_9").A2uiClientDataModel | undefined,
  ) => Promise<void>;
};

export const ChatActionsContext = createContext<ChatActionsContextValue | null>(null);

export function useChatActions(): ChatActionsContextValue {
  const ctx = useContext(ChatActionsContext);
  if (ctx === null) {
    throw new Error("useChatActions called outside <ChatActionsContext.Provider>");
  }
  return ctx;
}
```

(The `<ChatActionsContext.Provider>` is wired in the chat page in Task 11; tests mock `useChatActions` directly, bypassing the provider.)

- [ ] **Step 3: Update `A2UISurfaceWrapper.tsx` with actionHandler + interactivity**

Open `services/idun_agent_standalone_ui/components/chat/a2ui/A2UISurfaceWrapper.tsx`. Replace the file content with:

```tsx
"use client";

import "./A2UISurface.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "@a2ui/markdown-it";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import type {
  A2uiClientAction,
  A2uiMessage,
  SurfaceModel,
} from "@a2ui/web_core/v0_9";
import {
  A2uiSurface,
  MarkdownContext,
  basicCatalog,
} from "@a2ui/react/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";

import type { A2UISurfaceState } from "@/lib/agui";
import { useChatActions } from "@/lib/use-chat";

type Props = {
  surface: A2UISurfaceState;
  /** True when this surface lives on the latest assistant message AND
   *  chat status is "idle". Drives both CSS pointer-events and the
   *  actionHandler no-op guard (defence in depth). */
  isInteractive: boolean;
};

export function A2UISurfaceWrapper({ surface, isInteractive }: Props) {
  const { sendAction } = useChatActions();
  // Closure on a ref so the actionHandler can read the latest sendAction
  // and isInteractive without recreating the MessageProcessor on each
  // render (the processor is intentionally per-surface, lifetime-bound
  // to the assistant message — see WS2 design Q2).
  const handlerRef = useRef<(a: A2uiClientAction) => void>(() => {});
  const processor = useMemo(
    () => new MessageProcessor<ReactComponentImplementation>(
      [basicCatalog],
      (action) => handlerRef.current(action),
    ),
    [],
  );
  handlerRef.current = (action) => {
    if (!isInteractive) return;
    sendAction(action, processor.getClientDataModel());
  };

  const [model, setModel] =
    useState<SurfaceModel<ReactComponentImplementation> | null>(null);
  const lastSeenLength = useRef(0);

  // Reset the replay cursor when the processor identity changes (e.g.,
  // React StrictMode remount). See bc380042 — fix for C1 in WS2 review.
  useEffect(() => {
    lastSeenLength.current = 0;
  }, [processor]);

  useEffect(() => {
    const sub = processor.onSurfaceCreated((s) => {
      if (s.id === surface.surfaceId) setModel(s);
    });
    return () => {
      sub.unsubscribe();
      processor.model.dispose();
    };
  }, [processor, surface.surfaceId]);

  useEffect(() => {
    const next = surface.messages.slice(lastSeenLength.current);
    if (next.length === 0) return;
    try {
      processor.processMessages(next as A2uiMessage[]);
    } catch (err) {
      console.error("[a2ui] processMessages failed", err);
    }
    // Advance past a failing batch unconditionally so a single bad batch
    // doesn't permanently block subsequent messages.
    lastSeenLength.current = surface.messages.length;
  }, [processor, surface.messages]);

  if (!model) return null;

  return (
    <div
      className={[
        "a2ui-surface",
        isInteractive ? "" : "pointer-events-none opacity-60",
        "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:my-2",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2",
        "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1.5",
        "[&_h4]:text-base [&_h4]:font-semibold [&_h4]:my-1.5",
        "[&_h5]:text-sm [&_h5]:font-semibold [&_h5]:my-1",
        "[&_p]:my-1",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_ul]:list-disc [&_ul]:ml-5",
        "[&_ol]:list-decimal [&_ol]:ml-5",
        "[&_a]:underline [&_a]:text-foreground",
      ].filter(Boolean).join(" ")}
      aria-disabled={!isInteractive || undefined}
    >
      <MarkdownContext.Provider value={renderMarkdown}>
        <A2uiSurface surface={model} />
      </MarkdownContext.Provider>
    </div>
  );
}
```

- [ ] **Step 4: Update the existing wrapper test for the new `isInteractive` prop**

Open `services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.test.tsx`. Add an `isInteractive={true}` prop to every `<A2UISurfaceWrapper>` render call. Add this mock at the top of the file (after the existing mocks):

```ts
vi.mock("@/lib/use-chat", async () => {
  const actual = await vi.importActual<any>("@/lib/use-chat");
  return {
    ...actual,
    useChatActions: () => ({ sendAction: vi.fn() }),
  };
});
```

Modify the renders. Find each `render(<A2UISurfaceWrapper surface={surface} />)` and replace with `render(<A2UISurfaceWrapper surface={surface} isInteractive={true} />)`. There are five such call sites in the existing test — update all of them.

- [ ] **Step 5: Run the wrapper tests to verify both files pass**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run \
  __tests__/a2ui-surface-wrapper.test.tsx \
  __tests__/a2ui-surface-wrapper.action.test.tsx
```

Expected: existing 7 wrapper tests + 4 new action wiring tests all PASS.

- [ ] **Step 6: Run full standalone-UI test suite**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run
```

Expected: full pass.

- [ ] **Step 7: Commit**

```bash
git add services/idun_agent_standalone_ui/components/chat/a2ui/A2UISurfaceWrapper.tsx \
        services/idun_agent_standalone_ui/lib/use-chat.ts \
        services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.test.tsx \
        services/idun_agent_standalone_ui/__tests__/a2ui-surface-wrapper.action.test.tsx
git commit -m "$(cat <<'EOF'
feat(standalone-ui): A2UI surface wrapper wires actionHandler + isInteractive

A2UISurfaceWrapper now passes a global actionHandler to MessageProcessor
that forwards A2uiClientAction + processor.getClientDataModel() to
useChat.sendAction. isInteractive (true iff the surface is on the latest
assistant message AND chat is idle) gates clicks via two layers: CSS
pointer-events-none + a handler-side no-op guard.

useChatActions hook (Context-backed, no provider yet — wired in
MessageView in the next task) gives wrapper access to sendAction without
prop-drilling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `MessageView` threads `isInteractive` + provides `ChatActionsContext`

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/MessageView.tsx`
- Modify: the chat page that renders `MessageView` (typically `app/page.tsx` or a chat container) to wrap in `<ChatActionsContext.Provider>`

- [ ] **Step 1: Find the chat container that owns useChat**

```bash
grep -rn "useChat(" services/idun_agent_standalone_ui/app services/idun_agent_standalone_ui/components | grep -v __tests__
```

Identify the file calling `useChat(threadId)`. This is where the `ChatActionsContext.Provider` must wrap.

- [ ] **Step 2: Wrap with `ChatActionsContext.Provider`**

In the file from Step 1, import the context and wrap the chat tree (the part that contains `MessageView`s):

```tsx
import { ChatActionsContext, useChat } from "@/lib/use-chat";

// inside the component:
const chat = useChat(threadId);
// ...
return (
  <ChatActionsContext.Provider value={{ sendAction: chat.sendAction }}>
    {/* existing render: messages list, composer, etc. */}
  </ChatActionsContext.Provider>
);
```

- [ ] **Step 3: Compute `latestAssistantMessageId` and thread `isInteractive` down**

In the same component or `MessageView`'s parent (whichever maps over `chat.messages`):

```tsx
const latestAssistantMessageId = useMemo(
  () => [...chat.messages].reverse().find(m => m.role === "assistant")?.id,
  [chat.messages],
);
// when rendering:
chat.messages.map((m) => (
  <MessageView
    key={m.id}
    message={m}
    isInteractive={
      m.role === "assistant"
      && m.id === latestAssistantMessageId
      && chat.status === "idle"
    }
  />
))
```

- [ ] **Step 4: Update `MessageView.tsx` to accept and forward `isInteractive`**

Open `services/idun_agent_standalone_ui/components/chat/MessageView.tsx`. Add `isInteractive: boolean` to the `Props` type. Find the `<A2UISurfaceWrapper>` invocation and pass `isInteractive`:

```tsx
{message.a2uiSurfaces?.map((surface) => (
  <A2UISurfaceErrorBoundary key={surface.surfaceId}>
    <A2UISurfaceWrapper
      surface={surface}
      isInteractive={isInteractive}
    />
  </A2UISurfaceErrorBoundary>
))}
```

- [ ] **Step 5: Build the standalone-UI to surface any TS errors**

```bash
cd services/idun_agent_standalone_ui && pnpm build 2>&1 | tail -30
```

Expected: build succeeds (or only fails on pre-existing typecheck errors documented in CLAUDE.md). Any new TS error related to `isInteractive` or `ChatActionsContext` must be fixed before proceeding.

- [ ] **Step 6: Run all UI tests**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add services/idun_agent_standalone_ui/components/chat/MessageView.tsx \
        $(git diff --name-only HEAD | grep -v __tests__)
git commit -m "$(cat <<'EOF'
feat(standalone-ui): thread isInteractive through MessageView + provide ChatActionsContext

MessageView now accepts isInteractive (parent-computed: only the latest
assistant message's surfaces are interactive when chat is idle). The
chat page wraps in ChatActionsContext.Provider so A2UISurfaceWrapper
can pull sendAction without prop-drilling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Smoke agent extension

### Task 12: Smoke agent — add branching components + action wiring

**Files:**
- Modify: `examples/a2ui-smoke/agent.py`

- [ ] **Step 1: Open and read the existing agent**

```bash
cat examples/a2ui-smoke/agent.py | head -250
```

Confirm the existing `_COMPONENTS` list, `respond` async function, and `builder = StateGraph(State)` block are present.

- [ ] **Step 2: Add `action.event` to the existing `btn_demo` and add new branching components**

Find the existing `btn_demo` entry in `_COMPONENTS` and replace it with:

```python
    {
        "id": "btn_demo",
        "component": "Button",
        "child": "btn_label",
        "action": {"event": {"name": "submit_form", "context": {}}},
    },
```

After the `div_5` divider entry but BEFORE the `h_tabs` heading entry, insert:

```python
    # ---- Branching menu ----------------------------------------------------
    {"id": "h_branch", "component": "Text", "text": "Branching menu", "variant": "h2"},
    {"id": "lab_a", "component": "Text", "text": "Option A"},
    {"id": "lab_b", "component": "Text", "text": "Option B"},
    {"id": "lab_c", "component": "Text", "text": "Option C"},
    {
        "id": "btn_a", "component": "Button", "child": "lab_a",
        "action": {"event": {"name": "option_a", "context": {}}},
    },
    {
        "id": "btn_b", "component": "Button", "child": "lab_b",
        "action": {"event": {"name": "option_b", "context": {}}},
    },
    {
        "id": "btn_c", "component": "Button", "child": "lab_c",
        "action": {"event": {"name": "option_c", "context": {}}},
    },
    {
        "id": "row_branch", "component": "Row",
        "children": ["btn_a", "btn_b", "btn_c"],
        "justify": "spaceBetween",
    },
    {"id": "div_branch", "component": "Divider"},
```

Find the `showcase_column` entry's `children` list and insert `"h_branch"`, `"row_branch"`, `"div_branch"` between `"div_5"` and `"h_tabs"`:

```python
        "children": [
            "h_typo", "t_h1", "t_h2", "t_h3", "t_h4", "t_h5", "t_body", "t_caption",
            "div_1",
            "h_layout", "row_demo",
            "div_2",
            "h_visuals", "img_demo", "icon_demo",
            "div_3",
            "h_inputs", "input_text", "input_check", "input_choice",
            "input_slider", "input_date",
            "div_4",
            "h_action", "btn_demo",
            "div_5",
            "h_branch", "row_branch", "div_branch",   # NEW
            "h_tabs", "tabs_demo",
        ],
```

- [ ] **Step 3: Run the smoke-test integration test (verify envelope still validates)**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/integration/test_a2ui_passthrough.py -v
```

Expected: pass — these tests don't load the smoke agent itself, but if WS2 envelope validation (Task 6) catches any malformed addition, this run will surface it.

- [ ] **Step 4: Commit**

```bash
git add examples/a2ui-smoke/agent.py
git commit -m "$(cat <<'EOF'
feat(smoke-agent): wire submit_form + branching menu actions on showcase

Adds action.event.name="submit_form" to the existing demo Button.
Adds three new option_a/b/c buttons in a Row with their own action
events for the branching demo.

Showcase still emits as a single Card-wrapped Column; new section
slots in between the action divider and the Tabs section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Smoke agent — `acknowledge` node + conditional entry routing

**Files:**
- Modify: `examples/a2ui-smoke/agent.py`

- [ ] **Step 1: Update the import line to pull in `read_a2ui_context`**

Find:

```python
from idun_agent_engine.a2ui import emit_surface
```

Replace with:

```python
from idun_agent_engine.a2ui import emit_surface, read_a2ui_context
```

- [ ] **Step 2: Add the `acknowledge` async function**

Insert immediately after the existing `respond` async function:

```python
async def acknowledge(state: State, config: RunnableConfig) -> State:
    """Branch on the A2UI action that triggered this turn and emit a response.

    submit_form -> confirmation Card with the form values + Reset button
    reset       -> re-emit the original showcase
    option_a/b/c -> small per-option confirmation Card
    anything else -> degraded text-only response (no surface emitted)
    """
    ctx = read_a2ui_context(state)
    if ctx is None:
        # Router shouldn't reach this path without an action; defend anyway.
        return {"messages": [AIMessage(content="No A2UI action in state.")]}

    name = ctx.action.name

    if name == "submit_form":
        values = ctx.data_for(ctx.action.surface_id) or {}
        await emit_surface(
            config=config,
            surface_id="submit_confirmation",
            fallback_text=f"Form submitted with {len(values)} fields.",
            components=[
                {"id": "h", "component": "Text", "text": "Form submitted!", "variant": "h2"},
                {"id": "f_name", "component": "Text", "text": f"Name: {values.get('name') or '—'}"},
                {"id": "f_color", "component": "Text", "text": f"Color: {values.get('color') or '—'}"},
                {"id": "f_volume", "component": "Text", "text": f"Volume: {values.get('volume', '—')}"},
                {"id": "f_agreed", "component": "Text", "text": f"Subscribe: {values.get('agreed', False)}"},
                {"id": "f_when", "component": "Text", "text": f"When: {values.get('when') or '—'}"},
                {"id": "reset_label", "component": "Text", "text": "Reset"},
                {
                    "id": "reset_btn",
                    "component": "Button",
                    "child": "reset_label",
                    "action": {"event": {"name": "reset", "context": {}}},
                },
                {
                    "id": "col",
                    "component": "Column",
                    "children": [
                        "h", "f_name", "f_color", "f_volume",
                        "f_agreed", "f_when", "reset_btn",
                    ],
                },
                {"id": "root", "component": "Card", "child": "col"},
            ],
        )
        return {"messages": [AIMessage(content="Submitted — see confirmation surface.")]}

    if name == "reset":
        await emit_surface(
            config=config,
            surface_id="a2ui_showcase",
            components=_COMPONENTS,
            fallback_text=_FALLBACK,
            metadata={"source": "smoke_test", "shape": "showcase"},
            data={
                "name": "",
                "agreed": False,
                "color": "blue",
                "volume": 50,
                "when": "",
            },
        )
        return {"messages": [AIMessage(content="Reset. Try again.")]}

    if name in ("option_a", "option_b", "option_c"):
        letter = name.split("_", 1)[1].upper()
        await emit_surface(
            config=config,
            surface_id=f"branch_{name}",
            fallback_text=f"You picked Option {letter}.",
            components=[
                {"id": "h", "component": "Text", "text": f"Option {letter} picked", "variant": "h2"},
                {"id": "src", "component": "Text",
                 "text": f"Source: {ctx.action.source_component_id}"},
                {"id": "col", "component": "Column", "children": ["h", "src"]},
                {"id": "root", "component": "Card", "child": "col"},
            ],
        )
        return {"messages": [AIMessage(content=f"Option {letter} acknowledged.")]}

    return {"messages": [AIMessage(content=f"Unknown action: {name}")]}
```

- [ ] **Step 3: Replace the linear `respond → END` graph with conditional entry**

Find at the bottom of the file:

```python
builder = StateGraph(State)
builder.add_node("respond", respond)
builder.set_entry_point("respond")
builder.add_edge("respond", END)
graph = builder.compile()
```

Replace with:

```python
def _route_entry(state: State) -> str:
    """Route to acknowledge() iff the turn carries an A2UI action."""
    state_dict = state if isinstance(state, dict) else dict(state)
    idun = state_dict.get("idun")
    has_action = isinstance(idun, dict) and "a2uiClientMessage" in idun
    return "acknowledge" if has_action else "respond"


builder = StateGraph(State)
builder.add_node("respond", respond)
builder.add_node("acknowledge", acknowledge)
builder.set_conditional_entry_point(
    _route_entry,
    {"respond": "respond", "acknowledge": "acknowledge"},
)
builder.add_edge("respond", END)
builder.add_edge("acknowledge", END)
graph = builder.compile()
```

- [ ] **Step 4: Sanity-check the graph still imports cleanly**

```bash
uv run --no-sync python -c "from examples.a2ui_smoke.agent import graph; print('graph nodes:', list(graph.nodes.keys()))"
```

Expected: prints `graph nodes: ['__start__', 'respond', 'acknowledge', '__end__']` (or similar). Any `ImportError` or syntax error must be fixed before proceeding.

If the import path doesn't work because `examples` isn't on `sys.path`, run instead:

```bash
uv run --no-sync python -c "
import importlib.util as u, sys
spec = u.spec_from_file_location('smoke_agent', 'examples/a2ui-smoke/agent.py')
m = u.module_from_spec(spec); sys.modules['smoke_agent'] = m
spec.loader.exec_module(m)
print('graph nodes:', list(m.graph.nodes.keys()))
"
```

- [ ] **Step 5: Commit**

```bash
git add examples/a2ui-smoke/agent.py
git commit -m "$(cat <<'EOF'
feat(smoke-agent): add acknowledge node + conditional entry routing

acknowledge() reads the A2UI action via read_a2ui_context and branches
on action.name: submit_form (echo dataModel as confirmation Card),
reset (re-emit original showcase), option_a/b/c (per-option Card with
source-component traceability).

Conditional entry point routes on whether state carries an a2ui
action, so the same graph handles both text-mode initial turns and
action-driven follow-ups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Smoke agent — README update + integration test

**Files:**
- Modify: `examples/a2ui-smoke/README.md`
- Create: `libs/idun_agent_engine/tests/integration/test_a2ui_smoke_actions.py`

- [ ] **Step 1: Update README's "What you'll see" section**

Open `examples/a2ui-smoke/README.md`. Replace the existing "What you'll see" section (the bullets describing the showcase) with:

```markdown
## What you'll see

After sending any message in the chat:

- A short text summary in the assistant bubble (the markdown body)
- An A2UI **Basic Catalog showcase** rendered inside a Card: typography
  (h1–h5, body, caption), layout (Column, Row, Divider), inputs
  (TextField, CheckBox, Slider, DateTimeInput, ChoicePicker), visuals
  (Image, Icon), a Button labelled "Submit", a branching menu (Option A
  / B / C), and a Tabs component. Inputs are interactive and round-trip
  user edits via the surface dataModel.

After clicking **Submit** (action `submit_form`):

- A Confirmation Card showing the dataModel values you entered, plus a
  **Reset** button (action `reset`) that re-emits the original showcase.

After clicking **Option A / B / C** in the branching menu:

- A small per-option Card naming the action and the source-component id,
  read off the typed `A2UIContext` returned by `read_a2ui_context`.

Only the latest assistant message's surfaces are interactive; older
showcases in chat history render but their buttons are disabled
(visual: dimmed, no click cursor).
```

- [ ] **Step 2: Create the integration test file**

Create `libs/idun_agent_engine/tests/integration/test_a2ui_smoke_actions.py`:

```python
"""Integration tests for the smoke-agent's three action flavors.

Loads the smoke agent's compiled graph directly (the same graph the
engine would resolve via graph_definition) and drives it through the
engine's /agent/run handler with each action's wire payload.
"""
from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.engine_config import EngineConfig

_AGENT_PATH = (
    Path(__file__).parent.parent.parent.parent / "examples" / "a2ui-smoke" / "agent.py"
).resolve()


def _load_graph():
    import importlib.util as u
    spec = u.spec_from_file_location("a2ui_smoke_agent", _AGENT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {_AGENT_PATH}")
    mod = u.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.graph


@pytest.fixture
def client(monkeypatch):
    graph = _load_graph()
    cfg = EngineConfig.model_validate({
        "server": {"api": {"port": 8080}},
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "smoke-actions-fixture",
                "graph_definition": "INLINE",
                "checkpointer": {"type": "memory"},
            },
        },
    })
    monkeypatch.setattr(
        "idun_agent_engine.agent.langgraph.langgraph._resolve_graph",
        lambda *_a, **_kw: graph,
    )
    app = create_app(engine_config=cfg)
    return TestClient(app)


def _post_run(client, *, forwarded_props=None, message=None, thread_id=None):
    body = {
        "threadId": thread_id or str(uuid4()),
        "runId": str(uuid4()),
        "messages": (
            [{"id": "u1", "role": "user", "content": message}] if message else []
        ),
        "state": {},
        "tools": [],
        "context": [],
        "forwardedProps": forwarded_props or {},
    }
    return client.post(
        "/agent/run", json=body, headers={"accept": "text/event-stream"},
    )


def _custom_events(response):
    """Yield parsed CUSTOM idun.a2ui.messages event values from the SSE stream."""
    for line in response.text.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            evt = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if (
            evt.get("type") in ("CUSTOM", "CustomEvent")
            and evt.get("name") == "idun.a2ui.messages"
        ):
            yield evt.get("value")


def _action_msg(name, *, surface_id="a2ui_showcase", source="src", context=None):
    return {
        "version": "v0.9",
        "action": {
            "name": name,
            "surfaceId": surface_id,
            "sourceComponentId": source,
            "timestamp": "2026-05-05T00:00:00Z",
            "context": context or {},
        },
    }


@pytest.mark.integration
class TestSmokeActions:
    def test_initial_turn_emits_showcase(self, client):
        res = _post_run(client, message="hi")
        assert res.status_code == 200
        events = list(_custom_events(res))
        assert events, "expected at least one CUSTOM idun.a2ui.messages event"
        ids = [e.get("surfaceId") for e in events]
        assert "a2ui_showcase" in ids

    def test_submit_form_emits_confirmation(self, client):
        forwarded = {
            "idun": {
                "a2uiClientMessage": _action_msg("submit_form"),
                "a2uiClientDataModel": {
                    "version": "v0.9",
                    "surfaces": {"a2ui_showcase": {
                        "name": "alice", "agreed": True,
                        "color": "blue", "volume": 50,
                        "when": "2026-06-01T09:00:00Z",
                    }},
                },
            },
        }
        res = _post_run(client, forwarded_props=forwarded)
        assert res.status_code == 200
        events = list(_custom_events(res))
        ids = [e.get("surfaceId") for e in events]
        assert "submit_confirmation" in ids
        # Walk the confirmation envelope and find the Name text.
        conf = next(e for e in events if e.get("surfaceId") == "submit_confirmation")
        update = next(
            m["updateComponents"]["components"]
            for m in conf["messages"] if "updateComponents" in m
        )
        name_text = next(
            c["text"] for c in update if c.get("id") == "f_name"
        )
        assert "Name: alice" in name_text

    def test_reset_re_emits_showcase(self, client):
        forwarded = {
            "idun": {"a2uiClientMessage": _action_msg("reset", surface_id="submit_confirmation")},
        }
        res = _post_run(client, forwarded_props=forwarded)
        assert res.status_code == 200
        events = list(_custom_events(res))
        ids = [e.get("surfaceId") for e in events]
        assert "a2ui_showcase" in ids

    @pytest.mark.parametrize("opt,letter", [
        ("option_a", "A"),
        ("option_b", "B"),
        ("option_c", "C"),
    ])
    def test_branching_menu(self, client, opt, letter):
        forwarded = {
            "idun": {"a2uiClientMessage": _action_msg(opt, source=f"btn_{opt[-1]}")},
        }
        res = _post_run(client, forwarded_props=forwarded)
        assert res.status_code == 200
        events = list(_custom_events(res))
        ids = [e.get("surfaceId") for e in events]
        assert f"branch_{opt}" in ids
        env = next(e for e in events if e.get("surfaceId") == f"branch_{opt}")
        update = next(
            m["updateComponents"]["components"]
            for m in env["messages"] if "updateComponents" in m
        )
        h_text = next(c["text"] for c in update if c.get("id") == "h")
        assert f"Option {letter} picked" == h_text
```

- [ ] **Step 3: Run the smoke action integration tests**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/integration/test_a2ui_smoke_actions.py -v
```

Expected: 6 tests PASS (initial + submit + reset + 3× parametrized branch).

- [ ] **Step 4: Run all engine tests**

```bash
uv run --no-sync pytest libs/idun_agent_engine/tests/ -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q
```

Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/a2ui-smoke/README.md \
        libs/idun_agent_engine/tests/integration/test_a2ui_smoke_actions.py
git commit -m "$(cat <<'EOF'
test(smoke-agent): integration coverage for submit/reset/branch actions

Drives the smoke agent's three action flavors through /agent/run
end-to-end. Verifies submit_confirmation contains the dataModel
values, reset re-emits the showcase, and each branching option
emits a per-option Card with correct source-component id.

README "What you'll see" updated to describe the actions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — LLM travel-picker example

### Task 15: Scaffold `examples/a2ui-llm-picker/` folder

**Files:**
- Create: `examples/a2ui-llm-picker/__init__.py`
- Create: `examples/a2ui-llm-picker/agent.py` (skeleton — fleshed out in Tasks 16-18)
- Create: `examples/a2ui-llm-picker/config.yaml`
- Create: `examples/a2ui-llm-picker/README.md`
- Create: `examples/a2ui-llm-picker/tests/__init__.py`

- [ ] **Step 1: Verify `langchain-google-genai` is installed via the examples extra**

```bash
uv sync --extra examples
uv run --no-sync python -c "from langchain_google_genai import ChatGoogleGenerativeAI; print('OK')"
```

Expected: `OK`. If not installed, ensure Task 1's pyproject change includes the `[examples]` extra and re-sync.

- [ ] **Step 2: Create the agent.py skeleton with imports + state + `_llm()` factory + Pydantic shapes**

Create `examples/a2ui-llm-picker/__init__.py` (empty file):

```bash
touch examples/a2ui-llm-picker/__init__.py
```

Create `examples/a2ui-llm-picker/agent.py`:

```python
"""WS3 A2UI LLM travel-picker example.

A 2-node LangGraph agent that uses Gemini Flash to:

1. Propose 3 distinct travel destinations (as A2UI v0.9 Buttons inside Cards).
2. Acknowledge the user's pick by calling the LLM again for a 2-paragraph pitch
   and emitting a follow-up A2UI surface.

Run via the engine:
    idun agent serve --source file --path examples/a2ui-llm-picker/config.yaml
"""

import os
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

from idun_agent_engine.a2ui import emit_surface, read_a2ui_context

# ----------------------------------------------------------------------------
# State
# ----------------------------------------------------------------------------


class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# ----------------------------------------------------------------------------
# LLM factory
# ----------------------------------------------------------------------------

MODEL_ID = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")


def _llm() -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Set GEMINI_API_KEY (or GOOGLE_API_KEY) before running this example. "
            "See examples/a2ui-llm-picker/README.md for setup."
        )
    return ChatGoogleGenerativeAI(
        model=MODEL_ID,
        google_api_key=api_key,
        temperature=0.6,
    )


# ----------------------------------------------------------------------------
# Structured output for the proposal step
# ----------------------------------------------------------------------------


class TravelOption(BaseModel):
    id: str = Field(description="Short slug, lowercase, e.g. 'bali' or 'kyoto'")
    name: str = Field(description="Display name with country, e.g. 'Bali, Indonesia'")
    tagline: str = Field(description="One-line pitch, 8 to 16 words, no clichés")


class TravelProposal(BaseModel):
    intro: str = Field(description="One short sentence introducing the suggestions.")
    options: list[TravelOption] = Field(min_length=3, max_length=3)


# ----------------------------------------------------------------------------
# Graph (nodes + routing land in Tasks 16-17)
# ----------------------------------------------------------------------------


# Placeholders so the file imports cleanly while we wire the graph.
async def propose(state: State, config: RunnableConfig) -> State:
    raise NotImplementedError("propose: implemented in Task 16")


async def acknowledge(state: State, config: RunnableConfig) -> State:
    raise NotImplementedError("acknowledge: implemented in Task 17")


def _route_entry(state: State) -> str:
    raise NotImplementedError("_route_entry: implemented in Task 18")


builder = StateGraph(State)
builder.add_node("propose", propose)
builder.add_node("acknowledge", acknowledge)
# set_conditional_entry_point wired in Task 18 once _route_entry exists.
builder.set_entry_point("propose")
builder.add_edge("propose", END)
builder.add_edge("acknowledge", END)
graph = builder.compile()
```

- [ ] **Step 3: Create the config**

Create `examples/a2ui-llm-picker/config.yaml`:

```yaml
# WS3 A2UI LLM travel-picker config.
#
# 2-node LangGraph that uses Gemini Flash for both propose and acknowledge.
# Set GEMINI_API_KEY before running.

server:
  api:
    port: 8002

agent:
  type: "LANGGRAPH"
  config:
    name: "A2UI LLM Travel Picker"
    graph_definition: "examples/a2ui-llm-picker/agent.py:graph"
    checkpointer:
      type: "memory"
```

- [ ] **Step 4: Create the README**

Create `examples/a2ui-llm-picker/README.md`:

```markdown
# A2UI LLM Travel Picker (WS3)

A LangGraph agent that uses Gemini Flash to propose 3 travel destinations as
A2UI v0.9 buttons; user picks one; agent acknowledges with an LLM-generated
two-paragraph pitch in a follow-up surface.

## Prerequisites

```bash
uv sync --extra examples         # installs langchain-google-genai
export GEMINI_API_KEY=<your-key>  # or GOOGLE_API_KEY
```

Optional: `export GEMINI_MODEL=gemini-2.5-flash` (or another available model)
to override the default.

## Run

Two terminals.

**1. Engine** (runs on port 8002):

```bash
idun agent serve --source file --path examples/a2ui-llm-picker/config.yaml
```

**2. Standalone-UI** — point it at the engine on `:8002`. The simplest path
mirrors the WS2 smoke test's `serve_smoke.py`; copy or adapt with the new
port. Or set the standalone wheel's `IDUN_AGENT_BASE_URL` to
`http://localhost:8002` and start the standalone server normally.

## Flow

1. Type a preference like "warm beach under $1500" or "city break with great
   food, mid-October".
2. The agent emits a Card with three Buttons (the LLM-generated options).
3. Click a destination → the agent emits a follow-up Card with a short pitch
   and an "Ask another question" button to start over.

## What it demonstrates

- LLM-generated A2UI surfaces (`with_structured_output(TravelProposal)`).
- Action round-trip with `name = "pick_destination"` and `context.destination`
  carrying the chosen option's full payload.
- Conditional entry-point routing (`propose` vs `acknowledge`) read off the
  typed `A2UIContext` returned by `idun_agent_engine.a2ui.read_a2ui_context`.

## Customize

- Change `GEMINI_MODEL` to swap LLM variants.
- Edit the system prompts in `agent.py` to retarget the picker to recipes,
  learning topics, or any other domain — the wire shape stays the same.
```

- [ ] **Step 5: Create the tests directory placeholder**

```bash
mkdir -p examples/a2ui-llm-picker/tests
touch examples/a2ui-llm-picker/tests/__init__.py
```

- [ ] **Step 6: Verify the agent module imports cleanly (NotImplementedError on call is OK)**

```bash
uv run --no-sync python -c "
import importlib.util as u
spec = u.spec_from_file_location('llm_picker', 'examples/a2ui-llm-picker/agent.py')
m = u.module_from_spec(spec); spec.loader.exec_module(m)
print('graph nodes:', list(m.graph.nodes.keys()))
print('TravelProposal fields:', list(m.TravelProposal.model_fields))
"
```

Expected: nodes include `propose` + `acknowledge`; TravelProposal lists `intro` + `options`.

- [ ] **Step 7: Commit**

```bash
git add examples/a2ui-llm-picker/
git commit -m "$(cat <<'EOF'
feat(llm-picker): scaffold A2UI travel-picker example folder

Skeleton agent.py with State, Pydantic TravelOption/TravelProposal,
_llm() factory reading GEMINI_API_KEY (fallback GOOGLE_API_KEY), and
graph compiled with linear propose -> END for now (acknowledge wired
in Task 17, conditional routing in Task 18).

config.yaml on port 8002 (parallel to smoke at 8001). README documents
prerequisites + run flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: LLM picker — `propose` node + proposal-surface helper test

**Files:**
- Modify: `examples/a2ui-llm-picker/agent.py`
- Create: `examples/a2ui-llm-picker/tests/test_proposal_surface.py`

- [ ] **Step 1: Write the proposal-surface helper test (red phase)**

Create `examples/a2ui-llm-picker/tests/test_proposal_surface.py`:

```python
"""Unit tests for the A2UI travel-picker proposal-surface helper.

No LLM calls — the helper is pure and consumes a TravelProposal.
"""
from __future__ import annotations

import importlib.util as _u
import sys
from pathlib import Path

import pytest

_AGENT = (
    Path(__file__).resolve().parent.parent / "agent.py"
).resolve()
_spec = _u.spec_from_file_location("a2ui_llm_picker_agent", _AGENT)
_mod = _u.module_from_spec(_spec)
sys.modules["a2ui_llm_picker_agent"] = _mod
_spec.loader.exec_module(_mod)


@pytest.mark.unit
def test_proposal_surface_components_validates_against_basic_catalog():
    from idun_agent_engine.a2ui.actions import _server_to_client_validator

    proposal = _mod.TravelProposal(
        intro="Three destinations for warm-beach lovers.",
        options=[
            _mod.TravelOption(id="bali", name="Bali, Indonesia",
                              tagline="Volcanoes, surf, and warm rice paddies."),
            _mod.TravelOption(id="zanzibar", name="Zanzibar, Tanzania",
                              tagline="Spice-island markets and turquoise water."),
            _mod.TravelOption(id="palawan", name="Palawan, Philippines",
                              tagline="Limestone karsts rising out of glassy seas."),
        ],
    )
    components = _mod._proposal_surface_components(proposal)

    # Build a synthetic envelope so we can run it through validation.
    msg = {
        "version": "v0.9",
        "updateComponents": {
            "surfaceId": "travel_proposal",
            "components": components,
        },
    }
    errors = list(_server_to_client_validator().iter_errors(msg))
    assert errors == [], f"unexpected schema errors: {[e.message for e in errors]}"


@pytest.mark.unit
def test_proposal_surface_components_emits_three_pick_buttons():
    proposal = _mod.TravelProposal(
        intro="x",
        options=[
            _mod.TravelOption(id=f"opt{i}", name=f"Opt {i}", tagline="ok ok ok ok ok ok ok ok")
            for i in range(3)
        ],
    )
    components = _mod._proposal_surface_components(proposal)

    buttons = [
        c for c in components
        if c.get("component") == "Button" and "action" in c
    ]
    assert len(buttons) == 3
    for i, btn in enumerate(buttons):
        evt = btn["action"]["event"]
        assert evt["name"] == "pick_destination"
        assert evt["context"]["destination"]["id"] == f"opt{i}"
        assert evt["context"]["destination"]["name"] == f"Opt {i}"


@pytest.mark.unit
def test_proposal_surface_includes_root_column():
    proposal = _mod.TravelProposal(
        intro="x",
        options=[
            _mod.TravelOption(id="a", name="A", tagline="aaaaaaaa aaaaaaaa")
            for _ in range(3)
        ],
    )
    components = _mod._proposal_surface_components(proposal)
    root = next(c for c in components if c.get("id") == "root")
    assert root["component"] == "Column"
    assert "intro" in root["children"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run --no-sync pytest examples/a2ui-llm-picker/tests/test_proposal_surface.py -v
```

Expected: tests FAIL — `_proposal_surface_components` does not exist yet.

- [ ] **Step 3: Implement `_proposal_surface_components` and `propose` in `agent.py`**

In `examples/a2ui-llm-picker/agent.py`, replace the `propose` placeholder with the real implementation. Insert near the bottom of the file (before the `builder = ...` block), replacing both the helper-stub function and the propose stub:

```python
# ----------------------------------------------------------------------------
# Surface builder for the proposal step
# ----------------------------------------------------------------------------


def _proposal_surface_components(p: TravelProposal) -> list[dict]:
    """Card column with intro text + per-option Card[Title, Tagline, Button].

    Each option Button carries the full `TravelOption.model_dump()` in its
    action.event.context.destination so the acknowledge node has all info
    without consulting state — clean separation of turn concerns.
    """
    children: list[str] = ["intro"]
    out: list[dict] = [
        {"id": "intro", "component": "Text", "text": p.intro, "variant": "h3"},
    ]
    for i, opt in enumerate(p.options):
        title_id = f"opt{i}_title"
        tag_id = f"opt{i}_tag"
        lbl_id = f"opt{i}_lbl"
        btn_id = f"opt{i}_btn"
        col_id = f"opt{i}_col"
        card_id = f"opt{i}_card"
        out.extend([
            {"id": title_id, "component": "Text", "text": opt.name, "variant": "h4"},
            {"id": tag_id, "component": "Text", "text": opt.tagline},
            {"id": lbl_id, "component": "Text", "text": "Choose this destination"},
            {
                "id": btn_id, "component": "Button", "child": lbl_id,
                "action": {"event": {
                    "name": "pick_destination",
                    "context": {"destination": opt.model_dump()},
                }},
            },
            {
                "id": col_id, "component": "Column",
                "children": [title_id, tag_id, btn_id],
            },
            {"id": card_id, "component": "Card", "child": col_id},
        ])
        children.append(card_id)
    out.append({"id": "root", "component": "Column", "children": children})
    return out


# ----------------------------------------------------------------------------
# propose
# ----------------------------------------------------------------------------


_PROPOSE_SYSTEM = (
    "You are a travel concierge. The user describes their preferences;"
    " you propose exactly THREE destinations that fit. Each must be"
    " distinct (different region, climate, or vibe), realistic, and"
    " short enough to render as a button. Avoid 'top 10' clichés."
)


async def propose(state: State, config: RunnableConfig) -> State:
    last_user = next(
        (m for m in reversed(state["messages"]) if m.type == "human"),
        None,
    )
    prompt = (
        last_user.content
        if last_user is not None
        else "I want a relaxing trip somewhere warm under $1500."
    )

    proposal: TravelProposal = (
        await _llm()
        .with_structured_output(TravelProposal)
        .ainvoke([
            SystemMessage(_PROPOSE_SYSTEM),
            HumanMessage(prompt),
        ])
    )

    components = _proposal_surface_components(proposal)
    await emit_surface(
        config=config,
        surface_id="travel_proposal",
        components=components,
        fallback_text=(
            proposal.intro + " " + ", ".join(o.name for o in proposal.options)
        ),
    )
    return {"messages": [AIMessage(content=proposal.intro)]}
```

- [ ] **Step 4: Run the proposal-surface tests to verify they pass**

```bash
uv run --no-sync pytest examples/a2ui-llm-picker/tests/test_proposal_surface.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/a2ui-llm-picker/agent.py \
        examples/a2ui-llm-picker/tests/test_proposal_surface.py
git commit -m "$(cat <<'EOF'
feat(llm-picker): propose node + proposal-surface helper

Implements _proposal_surface_components: Card-wrapped column of three
per-option Cards, each with title + tagline + Button. The Button's
action.event.context.destination carries the full TravelOption payload
so the acknowledge node can pitch without re-querying state.

propose() reads the latest user message, calls
ChatGoogleGenerativeAI.with_structured_output(TravelProposal), and
emits the surface.

Tests: validates the helper output against A2UI server_to_client.json
schema and asserts three pick_destination buttons with correct
context.destination payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: LLM picker — `acknowledge` node with mocked-LLM test

**Files:**
- Modify: `examples/a2ui-llm-picker/agent.py`
- Create: `examples/a2ui-llm-picker/tests/test_acknowledge_with_fake_llm.py`

- [ ] **Step 1: Write the acknowledge test (red phase)**

Create `examples/a2ui-llm-picker/tests/test_acknowledge_with_fake_llm.py`:

```python
"""Acknowledge-node tests with patched LLM (no real Gemini calls)."""
from __future__ import annotations

import importlib.util as _u
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

_AGENT = (
    Path(__file__).resolve().parent.parent / "agent.py"
).resolve()
_spec = _u.spec_from_file_location("a2ui_llm_picker_agent", _AGENT)
_mod = _u.module_from_spec(_spec)
sys.modules["a2ui_llm_picker_agent"] = _mod
_spec.loader.exec_module(_mod)


def _state_with_action(name: str, *, destination: dict | None = None) -> dict:
    return {
        "messages": [],
        "idun": {
            "a2uiClientMessage": {
                "version": "v0.9",
                "action": {
                    "name": name,
                    "surfaceId": "travel_proposal",
                    "sourceComponentId": "opt0_btn",
                    "timestamp": "2026-05-05T00:00:00Z",
                    "context": {"destination": destination or {
                        "id": "bali",
                        "name": "Bali, Indonesia",
                        "tagline": "Volcanoes, surf, and warm rice paddies.",
                    }},
                },
            },
        },
    }


@pytest.mark.unit
@pytest.mark.asyncio
async def test_acknowledge_emits_surface_with_destination_name():
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(return_value=AIMessage(
        content=(
            "Bali sits between volcanic ridges and turquoise sea, with "
            "intricate rice terraces and warm humid air. Days move slowly. "
            "The food is brilliant. Surfers and yogis share the coves.\n\n"
            "Wake up in Ubud at sunrise. Cycle through Tegallalang. "
            "Lunch at a warung. Late afternoon at a Canggu beach club."
        ),
    ))
    emitted: list[dict] = []

    async def _stub_emit(**kwargs):
        emitted.append(kwargs)

    state = _state_with_action("pick_destination")
    config = {"configurable": {"thread_id": "t1"}}

    with patch.object(_mod, "_llm", return_value=fake_llm), \
         patch.object(_mod, "emit_surface", side_effect=_stub_emit):
        result = await _mod.acknowledge(state, config)

    assert emitted, "expected at least one emit_surface call"
    surface = emitted[0]
    assert "Bali, Indonesia" in str(surface["fallback_text"]) or \
           "Bali" in str(surface["fallback_text"])
    components = surface["components"]
    h_text = next(c for c in components if c.get("id") == "h")["text"]
    assert h_text == "Bali, Indonesia"
    paragraphs = [c for c in components if c.get("id", "").startswith("p")]
    assert len(paragraphs) == 2
    assert isinstance(result["messages"][0], AIMessage)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_acknowledge_with_no_action_returns_message():
    state = {"messages": []}  # no idun
    result = await _mod.acknowledge(state, {})
    assert "No destination" in result["messages"][0].content
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run --no-sync pytest examples/a2ui-llm-picker/tests/test_acknowledge_with_fake_llm.py -v
```

Expected: tests FAIL — `acknowledge` is `NotImplementedError`.

- [ ] **Step 3: Implement `acknowledge` in `agent.py`**

Replace the `acknowledge` placeholder in `examples/a2ui-llm-picker/agent.py` with:

```python
_ACK_SYSTEM = (
    "The user just chose a travel destination. Write a 2-paragraph pitch:"
    " paragraph 1 (4-6 sentences) describes the destination; paragraph 2"
    " (3-5 sentences) suggests one perfect day. Concrete, sensory, no"
    " marketing-speak."
)


async def acknowledge(state: State, config: RunnableConfig) -> State:
    ctx = read_a2ui_context(state)
    if ctx is None or ctx.action.name != "pick_destination":
        return {"messages": [AIMessage(content="No destination selected.")]}

    chosen = ctx.action.context.get("destination") or {}
    name = chosen.get("name", "your destination")
    tagline = chosen.get("tagline", "")

    pitch_msg = await _llm().ainvoke([
        SystemMessage(_ACK_SYSTEM),
        HumanMessage(f"Destination: {name}.\nTagline: {tagline}."),
    ])
    pitch = (
        pitch_msg.content
        if isinstance(pitch_msg.content, str)
        else str(pitch_msg.content)
    )
    paragraphs = [p.strip() for p in pitch.split("\n\n") if p.strip()][:2]

    components = [
        {"id": "h", "component": "Text", "text": name, "variant": "h2"},
        {"id": "tag", "component": "Text", "text": tagline, "variant": "caption"},
        *[
            {"id": f"p{i}", "component": "Text", "text": para}
            for i, para in enumerate(paragraphs)
        ],
        {"id": "again_lbl", "component": "Text", "text": "Ask another question"},
        {
            "id": "again_btn",
            "component": "Button",
            "child": "again_lbl",
            "action": {"event": {"name": "ask_again", "context": {}}},
        },
        {
            "id": "col",
            "component": "Column",
            "children": [
                "h", "tag",
                *[f"p{i}" for i in range(len(paragraphs))],
                "again_btn",
            ],
        },
        {"id": "root", "component": "Card", "child": "col"},
    ]
    await emit_surface(
        config=config,
        surface_id=f"travel_pitch_{chosen.get('id', 'x')}",
        fallback_text=f"Pitch for {name}.",
        components=components,
    )
    return {"messages": [AIMessage(content=name)]}
```

- [ ] **Step 4: Run the acknowledge tests to verify they pass**

```bash
uv run --no-sync pytest examples/a2ui-llm-picker/tests/test_acknowledge_with_fake_llm.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/a2ui-llm-picker/agent.py \
        examples/a2ui-llm-picker/tests/test_acknowledge_with_fake_llm.py
git commit -m "$(cat <<'EOF'
feat(llm-picker): acknowledge node + LLM-mocked tests

Reads the chosen destination from ctx.action.context.destination, asks
the LLM for a 2-paragraph pitch, and emits a follow-up surface
(travel_pitch_<id>) with title + tagline + paragraphs + ask_again
button.

Tests use unittest.mock.patch to substitute _llm() and emit_surface so
the suite stays deterministic and never calls real Gemini.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: LLM picker — routing + integration

**Files:**
- Modify: `examples/a2ui-llm-picker/agent.py`
- Create: `examples/a2ui-llm-picker/tests/test_routing.py`

- [ ] **Step 1: Write the routing test (red phase)**

Create `examples/a2ui-llm-picker/tests/test_routing.py`:

```python
"""_route_entry tests for the LLM travel-picker.

Routing rules:
  - no idun key                    -> propose
  - idun.a2uiClientMessage.action.name == 'ask_again'      -> propose
  - idun.a2uiClientMessage.action.name == 'pick_destination' -> acknowledge
  - any other action.name          -> acknowledge (fall-through)
"""
from __future__ import annotations

import importlib.util as _u
import sys
from pathlib import Path

import pytest

_AGENT = (
    Path(__file__).resolve().parent.parent / "agent.py"
).resolve()
_spec = _u.spec_from_file_location("a2ui_llm_picker_agent", _AGENT)
_mod = _u.module_from_spec(_spec)
sys.modules["a2ui_llm_picker_agent"] = _mod
_spec.loader.exec_module(_mod)


def _state(action_name: str | None) -> dict:
    if action_name is None:
        return {"messages": []}
    return {
        "messages": [],
        "idun": {
            "a2uiClientMessage": {
                "version": "v0.9",
                "action": {
                    "name": action_name,
                    "surfaceId": "x", "sourceComponentId": "y",
                    "timestamp": "2026-05-05T00:00:00Z", "context": {},
                },
            },
        },
    }


@pytest.mark.unit
@pytest.mark.parametrize("action,expected", [
    (None,                "propose"),
    ("ask_again",         "propose"),
    ("pick_destination",  "acknowledge"),
    ("unknown_event",     "acknowledge"),
])
def test_route_entry(action, expected):
    assert _mod._route_entry(_state(action)) == expected
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run --no-sync pytest examples/a2ui-llm-picker/tests/test_routing.py -v
```

Expected: tests FAIL — `_route_entry` is `NotImplementedError`.

- [ ] **Step 3: Implement `_route_entry` and wire conditional entry point**

In `examples/a2ui-llm-picker/agent.py`, replace the `_route_entry` placeholder and the `builder` block with:

```python
def _route_entry(state: State) -> str:
    state_dict = state if isinstance(state, dict) else dict(state)
    idun = state_dict.get("idun")
    if not (isinstance(idun, dict) and "a2uiClientMessage" in idun):
        return "propose"
    msg = idun["a2uiClientMessage"]
    name = (msg.get("action") or {}).get("name") if isinstance(msg, dict) else None
    return "propose" if name == "ask_again" else "acknowledge"


builder = StateGraph(State)
builder.add_node("propose", propose)
builder.add_node("acknowledge", acknowledge)
builder.set_conditional_entry_point(
    _route_entry,
    {"propose": "propose", "acknowledge": "acknowledge"},
)
builder.add_edge("propose", END)
builder.add_edge("acknowledge", END)
graph = builder.compile()
```

- [ ] **Step 4: Run all LLM-picker tests**

```bash
uv run --no-sync pytest examples/a2ui-llm-picker/tests/ -v
```

Expected: all 4 routing tests + 2 acknowledge tests + 3 proposal tests = 9 PASS.

- [ ] **Step 5: Verify the agent module still imports and graph is wired correctly**

```bash
uv run --no-sync python -c "
import importlib.util as u
spec = u.spec_from_file_location('llm_picker', 'examples/a2ui-llm-picker/agent.py')
m = u.module_from_spec(spec); spec.loader.exec_module(m)
print('graph nodes:', list(m.graph.nodes.keys()))
print('entry routing:', m._route_entry({}))
"
```

Expected: prints `graph nodes: ['__start__', 'propose', 'acknowledge', '__end__']` and `entry routing: propose`.

- [ ] **Step 6: Commit**

```bash
git add examples/a2ui-llm-picker/agent.py \
        examples/a2ui-llm-picker/tests/test_routing.py
git commit -m "$(cat <<'EOF'
feat(llm-picker): conditional entry routing + complete the graph

_route_entry inspects state.idun.a2uiClientMessage.action.name and
picks: no idun -> propose, ask_again -> propose, anything else ->
acknowledge.

Wires set_conditional_entry_point so the graph handles initial text
turns (propose) and action-driven follow-ups (acknowledge) in one
compiled graph.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — Documentation

### Task 19: CLAUDE.md updates

**Files:**
- Modify: `libs/idun_agent_engine/CLAUDE.md`
- Modify: `services/idun_agent_standalone_ui/CLAUDE.md`

- [ ] **Step 1: Update engine CLAUDE.md**

Open `libs/idun_agent_engine/CLAUDE.md`. Find the existing "## A2UI" section (added in WS2 — covers `emit_surface`). Append a new sub-section for actions:

```markdown
### Reading actions (WS3)

Surfaces with `sendDataModel: True` (the default since WS3) and components
that fire actions (e.g., `Button` with `action.event.name = "submit_form"`)
round-trip back to the agent over `/agent/run` `forwardedProps`. The agent
reads the typed action via:

```python
from idun_agent_engine.a2ui import read_a2ui_context

async def my_node(state, config: RunnableConfig):
    ctx = read_a2ui_context(state)
    if ctx is None:
        # Text-mode turn — no action this run.
        ...
    else:
        # Typed view via Pydantic mirror of A2UI v0.9
        # client_to_server.json + client_data_model.json:
        ctx.action.name                       # str, e.g., "submit_form"
        ctx.action.surface_id                 # str
        ctx.action.source_component_id        # str (the Button's id)
        ctx.action.timestamp                  # str (ISO 8601)
        ctx.action.context                    # dict[str, Any]
        ctx.data_for(ctx.action.surface_id)   # dict | None — surface dataModel
```

Validation is mandatory and backed by A2UI's bundled JSON Schemas
(`a2ui-agent-sdk` package). Malformed payloads return `None` from
`read_a2ui_context` (logged at WARNING) so a frontend bug in the action
path can never crash a text-mode turn.

The wire shape is:

```jsonc
forwardedProps: {
  idun: {
    a2uiClientMessage: { version: "v0.9", action: A2uiClientAction },
    a2uiClientDataModel: { version: "v0.9", surfaces: {...} } | undefined
  }
}
```

ag-ui-langgraph snake-cases only top-level `forwardedProps` keys, so
nested keys (`a2uiClientMessage`, `surfaceId`, etc.) reach the agent
camelCase — `read_a2ui_context` handles the casing internally.

Worked examples: `examples/a2ui-smoke/agent.py` (deterministic) and
`examples/a2ui-llm-picker/agent.py` (Gemini-driven).
```

- [ ] **Step 2: Update standalone-UI CLAUDE.md**

Open `services/idun_agent_standalone_ui/CLAUDE.md`. Find the existing "## AG-UI" section (covers WS2 surface rendering). Append:

```markdown
### A2UI actions (WS3)

`@a2ui/web_core/v0_9`'s `MessageProcessor` accepts a global `actionHandler`
at construction; `A2UISurfaceWrapper` installs one that calls
`useChat.sendAction(action, processor.getClientDataModel())`. The wrapper's
`isInteractive` prop (parent-computed: latest assistant message AND chat
status idle) gates clicks via two layers — CSS `pointer-events-none` and
a handler-side no-op guard.

`useChat.sendAction(action, dataModel?)` POSTs `/agent/run` with
`forwardedProps.idun.a2uiClientMessage` (+ optional
`a2uiClientDataModel`). No synthetic user message bubble is appended;
the existing streaming indicator gives feedback. Reentrancy is rejected
(no-op when `status !== "idle"`).

The `ChatActionsContext` provider in the chat page exposes `sendAction`
to deeply nested wrappers without prop-drilling.
```

- [ ] **Step 3: Commit**

```bash
git add libs/idun_agent_engine/CLAUDE.md services/idun_agent_standalone_ui/CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(ws3): document A2UI action ingest path in CLAUDE.md

Engine CLAUDE.md gains a "Reading actions (WS3)" sub-section under
A2UI: read_a2ui_context, A2UIContext, wire shape, validation guarantees,
and worked example pointers.

Standalone-UI CLAUDE.md gains an "A2UI actions (WS3)" sub-section under
AG-UI: actionHandler wiring, isInteractive layers, sendAction contract,
ChatActionsContext provider.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Step 1: Run the full engine test suite**

```bash
chflags nohidden /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.venv/lib/python3.12/site-packages/_editable_impl_*.pth 2>/dev/null || true
uv run --no-sync pytest libs/idun_agent_engine/tests/ examples/a2ui-llm-picker/tests/ \
  -m "not requires_langfuse and not requires_phoenix and not requires_postgres" -q
```

Expected: full pass.

- [ ] **Step 2: Run the full standalone-UI vitest suite**

```bash
cd services/idun_agent_standalone_ui && pnpm vitest run
```

Expected: full pass.

- [ ] **Step 3: Type-check the engine**

```bash
uv run --no-sync mypy libs/idun_agent_engine/src/idun_agent_engine/a2ui/
```

Expected: no new errors in the a2ui module (pre-existing errors in unrelated files are fine).

- [ ] **Step 4: Lint everything touched**

```bash
make lint
```

Expected: clean.

- [ ] **Step 5: Eyeball-check the branch's commit history**

```bash
git log --oneline main..HEAD | head -25
```

Expected: 19 WS3 commits stacked on top of the WS2 + WS3-fix-up history.
