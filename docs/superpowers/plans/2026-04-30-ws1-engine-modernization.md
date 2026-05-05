# WS1 — Engine Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump `ag-ui-langgraph` 0.0.25 → 0.0.35, re-evaluate three upstream monkey patches, swap the LangGraph adapter from `copilotkit.LangGraphAGUIAgent` to the base `ag_ui_langgraph.LangGraphAgent`, drop the `copilotkit==0.1.78` dependency, and migrate the frontend chat reducer from `THINKING_*` to `REASONING_*` events while keeping the legacy events as a fallback.

**Architecture:** Backend changes are confined to `libs/idun_agent_engine/` (LangGraph adapter, agent router, monkey patches, dependency manifest). Frontend changes are confined to `services/idun_agent_standalone_ui/lib/use-chat.ts` and its test file, and are purely additive — the new `REASONING_*` handlers run alongside the existing `THINKING_*` handlers, so the frontend keeps working against an old engine. Each task is an independently revertable commit, sequenced so a failure on any task can be reverted in isolation without rolling back the rest.

**Tech Stack:** Python 3.12, FastAPI, `ag-ui-langgraph` 0.0.35, `ag-ui-protocol` 0.1.13+, `langchain-core` 1.x, `langgraph` 1.x, Next.js 15, React 19, Vitest. Tests run via `uv run pytest libs/idun_agent_engine/tests/` and `npm test` in `services/idun_agent_standalone_ui/`.

**Why this plan exists:** see companion `docs/superpowers/reviews/2026-04-30-a2ui-langgraph-mvp-validation.md`. Short version: the A2UI MVP cannot ship cleanly on the current pinned versions because the `THINKING_* → REASONING_*` rename is protocol-wide and the version drift is real. WS1 clears the runway. WS1 has independent value (10 patches of upstream fixes, removal of CopilotKit transitive dep) regardless of A2UI follow-up.

**Out of scope:** A2UI-related code (separate plan), removal of deprecated `/agent/copilotkit/stream` route (separate cleanup), property rename from `copilotkit_agent_instance` to a more neutral name (separate cleanup — the property is internal to `BaseAgent` so renaming has wide blast radius for cosmetic gain).

---

## File map — what gets touched

**Engine (Python):**
- `libs/idun_agent_engine/pyproject.toml` — bump `ag-ui-langgraph`, drop `copilotkit`.
- `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py` — swap `copilotkit.LangGraphAGUIAgent` → `ag_ui_langgraph.LangGraphAgent`. Lines 20, 200, 257, 384.
- `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py` — swap `copilotkit.LangGraphAGUIAgent` import → `ag_ui_langgraph.LangGraphAgent`. Lines 10, 311, 333.
- `libs/idun_agent_engine/src/idun_agent_engine/server/patches.py` — re-evaluate three patches against 0.0.35; remove or re-target as findings dictate.
- `libs/idun_agent_engine/tests/unit/server/test_patches.py` — keep tests for surviving patches; remove for retired patches.
- `libs/idun_agent_engine/tests/unit/agent/test_langgraph.py` — update any tests asserting `LangGraphAGUIAgent` type to assert `LangGraphAgent`.
- `libs/idun_agent_engine/CLAUDE.md` — update "Key Dependencies" section.

**Frontend (TypeScript):**
- `services/idun_agent_standalone_ui/lib/use-chat.ts` — add `REASONING_*` cases alongside existing `THINKING_*` cases.
- `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts` — add coverage for the new `REASONING_*` handlers.
- `services/idun_agent_standalone_ui/CLAUDE.md` — note the dual-event handling under the "AG-UI" section.

**Untouched (verify but do not modify):**
- `libs/idun_agent_engine/src/idun_agent_engine/agent/adk/adk.py` — already uses `from ag_ui_adk import ADKAgent as ADKAGUIAgent` (line 16). No copilotkit dependency. WS1 does not touch ADK.
- `libs/idun_agent_engine/src/idun_agent_engine/agent/base.py` — keeps `copilotkit_agent_instance` property name for back-compat. Rename is out of scope.

---

## Task 1: Capture baseline on 0.0.25 before any change

Establish ground truth so every subsequent task can compare against it. Also surfaces any pre-existing flake before we start changing things.

**Files:**
- Modify: none
- Test: `libs/idun_agent_engine/tests/unit/`, `libs/idun_agent_engine/tests/integration/` (run only)

- [ ] **Step 1: Confirm working tree is clean and on `explore/a2ui-langgraph`**

```bash
git status
git branch --show-current
```

Expected: working tree clean (no uncommitted changes other than the two findings docs in `docs/superpowers/reviews/`), branch `explore/a2ui-langgraph`.

- [ ] **Step 2: Run engine unit tests on 0.0.25 and capture pass count**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv run pytest libs/idun_agent_engine/tests/unit -q 2>&1 | tee /tmp/ws1-baseline-engine-unit.txt | tail -5
```

Expected: a final summary like `N passed, M skipped in K seconds`. Record N and M in your task notes — these are the numbers Task 2's bumped version must still hit (or beat).

- [ ] **Step 3: Run frontend unit tests and capture pass count**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/services/idun_agent_standalone_ui
npm test -- --run 2>&1 | tee /tmp/ws1-baseline-ui.txt | tail -10
```

Expected: a final summary line. Record total tests passed.

- [ ] **Step 4: Confirm `uv` lockfile resolves cleanly without changes**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv lock --check
```

Expected: `Resolved N packages in K ms` with no diff output. If this fails, fix the lockfile drift in a separate commit before proceeding.

- [ ] **Step 5: No commit needed — Task 1 is read-only baseline capture.**

---

## Task 2: Bump `ag-ui-langgraph` 0.0.25 → 0.0.35 + `ag-ui-protocol` 0.1.13 → 0.1.18

Pin bump only. Do not touch `patches.py` yet — Task 3 and Task 4 evaluate each patch against the new version. After this task the test suite may have new failures that Task 3/4 will resolve.

**Why both pins move together:** `ag-ui-langgraph==0.0.35` requires `ag-ui-protocol>=0.1.15`. Bumping just `ag-ui-langgraph` produces an unsatisfiable resolver state. `0.1.18` is the latest `ag-ui-protocol` on PyPI (verified 2026-04-30) and is the version `0.0.35` was tested against.

**Files:**
- Modify: `libs/idun_agent_engine/pyproject.toml:53,54`
- Modify: `uv.lock` (auto-regenerated)

- [ ] **Step 1: Edit both version pins**

Change `libs/idun_agent_engine/pyproject.toml:53-54` from:

```toml
    "ag-ui-protocol==0.1.13",
    "ag-ui-langgraph==0.0.25",
```

to:

```toml
    "ag-ui-protocol==0.1.18",
    "ag-ui-langgraph==0.0.35",
```

Leave `copilotkit==0.1.78` (line 56) untouched — Task 8 drops it.

- [ ] **Step 2: Update lockfile**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv lock
```

Expected: `Resolved N packages` with `ag-ui-protocol` (0.1.13 → 0.1.18), `ag-ui-langgraph` (0.0.25 → 0.0.35), and any transitive shifts. Other top-level pins should be unchanged.

- [ ] **Step 3: Sync the venv**

```bash
uv sync --all-groups
```

Expected: `Installed/Updated N packages` with `ag-ui-langgraph` 0.0.35.

- [ ] **Step 4: Run engine unit tests and record failures**

```bash
uv run pytest libs/idun_agent_engine/tests/unit -q 2>&1 | tee /tmp/ws1-bump-engine-unit.txt | tail -30
```

Expected: many tests pass, but some may fail. Compare the pass count against `/tmp/ws1-baseline-engine-unit.txt` (Task 1 Step 2). Failures are anticipated for tests touching the monkey-patched code paths — Task 3 and Task 4 will resolve them.

Specifically, expect possible failures in:
- `tests/unit/server/test_patches.py` — the patches target a specific upstream signature; that signature may have changed.
- `tests/unit/agent/test_langgraph.py` and `test_langgraph_streaming.py` — only if `THINKING_*` events were renamed to `REASONING_*` and a test asserts the old name.

Do NOT proceed past this step if there are failures unrelated to the patches or the THINKING/REASONING rename. Investigate first and consider reverting.

- [ ] **Step 5: Commit the version bump even if some tests fail**

```bash
git add libs/idun_agent_engine/pyproject.toml uv.lock
git commit -m "$(cat <<'EOF'
chore(engine): bump ag-ui-langgraph 0.0.25→0.0.35, ag-ui-protocol 0.1.13→0.1.18

ag-ui-langgraph 0.0.35 requires ag-ui-protocol>=0.1.15 so the two
pins move together. Picks up 10 patches of upstream fixes including
the protocol-wide THINKING_* → REASONING_* event rename and
OnToolEnd / Gemini finish_reason fixes that Idun previously
monkey-patched.

Patches in server/patches.py are re-evaluated in follow-up commits
(Task 3 and Task 4 of WS1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: committing with failing tests is intentional here — the next two tasks fix the failures. Each commit should remain individually revertable.

---

## Task 3: Re-evaluate `apply_handle_single_event_patch` against 0.0.35

This patch combines two fixes (OnToolEnd list outputs + Gemini finish_reason). Both target `_handle_single_event` in `ag_ui_langgraph.agent.LangGraphAgent`. We need to determine whether either is still needed on 0.0.35.

**Files:**
- Read: `.venv/lib/python3.12/site-packages/ag_ui_langgraph/agent.py` (the bumped source)
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/patches.py` (likely shrink or remove)
- Modify: `libs/idun_agent_engine/tests/unit/server/test_patches.py` (keep tests for surviving patches; remove for retired ones)

- [ ] **Step 1: Inspect the upstream `_handle_single_event` source on 0.0.35**

```bash
grep -n "_handle_single_event\|OnToolEnd\|finish_reason" .venv/lib/python3.12/site-packages/ag_ui_langgraph/agent.py | head -40
```

Find the OnToolEnd block. Confirm whether the list-output handling has been merged upstream (look for `isinstance(tool_call_output, list)` or similar). The PRs Idun was tracking (ag-ui#1073, ag-ui#1164) should have landed.

- [ ] **Step 2: Inspect the OnChatModelStream block**

```bash
grep -n "OnChatModelStream\|finish_reason" .venv/lib/python3.12/site-packages/ag_ui_langgraph/agent.py | head -20
```

Confirm whether the early-return-on-finish_reason behavior changed. Look for the first lines of the `OnChatModelStream` branch — has the unconditional `if chunk.response_metadata.get('finish_reason'): return` been replaced with a conditional that checks for content or tool calls?

- [ ] **Step 3: Decide patch fate based on findings**

Three cases:
- **Both fixes merged upstream:** Remove `apply_handle_single_event_patch` entirely (Task 3 Step 4 path A).
- **One fix merged, one not:** Shrink the patch to the remaining fix only (Task 3 Step 4 path B).
- **Neither fix merged or signature changed:** Re-target the patch against the new function body (Task 3 Step 4 path C).

Record which case applies and why in the commit message.

- [ ] **Step 4: Apply the chosen path**

**Path A — remove the patch entirely:**

Delete the `apply_handle_single_event_patch` function from `libs/idun_agent_engine/src/idun_agent_engine/server/patches.py` (lines ~80 through the corresponding restore block) and remove its call in `apply_all()` near line 565. Delete the corresponding tests in `libs/idun_agent_engine/tests/unit/server/test_patches.py`.

Update the docstring at `patches.py:1-63` to reflect the smaller patch surface.

**Path B — shrink to the remaining fix:**

Edit `libs/idun_agent_engine/src/idun_agent_engine/server/patches.py` to remove the merged sub-fix's branch from `_patched_handle_single_event` while keeping the still-needed branch. Update the docstring to drop the merged item from the numbered list.

Update tests in `libs/idun_agent_engine/tests/unit/server/test_patches.py` — remove the test cases for the retired branch, keep the rest.

**Path C — re-target against new signature:**

Re-derive the patch against the 0.0.35 `_handle_single_event` body. Open `.venv/lib/python3.12/site-packages/ag_ui_langgraph/agent.py`, copy the new function, and insert the same fix logic in the new place. Update the version comment in `patches.py` from `0.0.25` to `0.0.35`.

Update tests as needed to match the new signature.

- [ ] **Step 5: Run the patch tests in isolation**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/test_patches.py -v
```

Expected: all surviving tests pass.

- [ ] **Step 6: Run full engine unit suite**

```bash
uv run pytest libs/idun_agent_engine/tests/unit -q 2>&1 | tail -10
```

Expected: pass count back at or above the baseline from Task 1 Step 2 for tests in this module's blast radius (server, agent/langgraph). Some tests may still fail if Task 4's patch is also affected — that's OK, Task 4 picks them up next.

- [ ] **Step 7: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/patches.py \
        libs/idun_agent_engine/tests/unit/server/test_patches.py
git commit -m "$(cat <<'EOF'
chore(engine): re-evaluate handle_single_event patch on ag-ui-langgraph 0.0.35

[Replace this paragraph with the Path A/B/C decision and a one-line
explanation of upstream state. Example: "Path A — both OnToolEnd
list-output (#1073) and Gemini finish_reason fixes merged upstream
in 0.0.34 and 0.0.32 respectively. Patch removed, tests deleted."]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Re-evaluate `apply_prepare_stream_patch` against 0.0.35

Same pattern as Task 3, applied to the second monkey patch (false-positive regenerate detection causing `ValueError: Message ID not found in history`).

**Files:**
- Read: `.venv/lib/python3.12/site-packages/ag_ui_langgraph/agent.py` (look at `prepare_stream` and `prepare_regenerate_stream`)
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/patches.py`
- Modify: `libs/idun_agent_engine/tests/unit/server/test_patches.py`

- [ ] **Step 1: Inspect upstream `prepare_stream` and `prepare_regenerate_stream`**

```bash
grep -n "prepare_stream\|prepare_regenerate_stream\|Message ID not found" .venv/lib/python3.12/site-packages/ag_ui_langgraph/agent.py | head -30
```

Look for whether the `ValueError("Message ID not found in history")` is still raised, and whether the upstream `prepare_stream` now wraps `prepare_regenerate_stream` in a try/except or has equivalent logic to fall through.

- [ ] **Step 2: Decide patch fate**

Same three cases as Task 3:
- **Path A:** Fix merged upstream — remove the patch entirely.
- **Path B:** Behavior partially fixed — shrink the patch.
- **Path C:** Signature changed — re-target.

Record which case applies.

- [ ] **Step 3: Apply the chosen path**

For Path A: delete `apply_prepare_stream_patch` from `libs/idun_agent_engine/src/idun_agent_engine/server/patches.py` (lines ~363-560) and remove the call in `apply_all()`. Delete corresponding tests in `tests/unit/server/test_patches.py`.

For Path B/C: edit the patch body to match the new upstream code, update the version comment from `v0.0.25` to `v0.0.35`, update tests.

- [ ] **Step 4: Run patch tests in isolation**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/server/test_patches.py -v
```

Expected: all surviving tests pass.

- [ ] **Step 5: Run full engine unit suite — must now match baseline**

```bash
uv run pytest libs/idun_agent_engine/tests/unit -q 2>&1 | tail -10
```

Expected: pass count >= Task 1 Step 2 baseline. After this task, the engine should be back to "clean test pass on 0.0.35." Any remaining failures are NOT from the bump or patches; investigate before continuing.

- [ ] **Step 6: Run engine integration tests as well**

```bash
uv run pytest libs/idun_agent_engine/tests/integration -q 2>&1 | tail -10
```

Expected: same baseline match. Skip-marked tests (require_langfuse, require_phoenix, require_postgres) stay skipped — that's fine.

- [ ] **Step 7: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/server/patches.py \
        libs/idun_agent_engine/tests/unit/server/test_patches.py
git commit -m "$(cat <<'EOF'
chore(engine): re-evaluate prepare_stream patch on ag-ui-langgraph 0.0.35

[Replace with Path A/B/C decision. Example: "Path A — upstream
prepare_stream now falls through to non-regenerate path on
ValueError. Patch and tests removed. server/patches.py is now
empty — apply_all() is a no-op but kept as a stable extension point
for future upstream-bug workarounds."]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add `REASONING_*` handling in `use-chat.ts` (additive)

`ag-ui-langgraph` 0.0.35 emits `REASONING_*` events for the protocol-wide rename. Existing `THINKING_*` cases in `lib/use-chat.ts:183-221` keep working when the engine ships old events; new cases pick up the new events. Both branches share the same state mutation logic.

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/use-chat.ts:183-221`
- Modify: `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts` (add coverage)

- [ ] **Step 1: Write a failing test for `REASONING_TEXT_MESSAGE_CONTENT`**

Add this test case at the end of `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts` (mirror the existing `THINKING_TEXT_MESSAGE_CONTENT` test patterns — find the closest existing thinking-event test and adapt the event name only):

```typescript
it("appends REASONING_TEXT_MESSAGE_CONTENT delta to the latest assistant thoughts", () => {
  // Existing test setup pattern: render the chat hook, allocate an
  // assistant message, dispatch events, assert state.
  // Mirror the THINKING_TEXT_MESSAGE_CONTENT test verbatim except
  // for the event type strings.
  const { result, dispatchEvent } = renderChatWithAssistant();

  dispatchEvent({ type: "REASONING_START" });
  dispatchEvent({ type: "REASONING_TEXT_MESSAGE_START" });
  dispatchEvent({ type: "REASONING_TEXT_MESSAGE_CONTENT", delta: "step 1 " });
  dispatchEvent({ type: "REASONING_TEXT_MESSAGE_CONTENT", delta: "step 2" });
  dispatchEvent({ type: "REASONING_TEXT_MESSAGE_END" });
  dispatchEvent({ type: "REASONING_END" });

  const last = result.current.messages.at(-1)!;
  expect(last.role).toBe("assistant");
  expect(last.thinking).toEqual(["step 1 step 2"]);
  expect(last.thoughts).toBe("step 1 step 2");
});
```

If the existing test file does not export a `renderChatWithAssistant` helper, mimic the closest `THINKING_*` test's setup inline. Do not invent a helper — keep the new test parallel to the existing pattern.

- [ ] **Step 2: Run the new test, confirm it fails**

```bash
cd services/idun_agent_standalone_ui
npm test -- --run __tests__/use-chat.test.ts -t "REASONING_TEXT_MESSAGE_CONTENT"
```

Expected: FAIL — the `default` branch in `applyEvent` swallows `REASONING_*` because there is no case for it. The assertion on `thoughts` is empty.

- [ ] **Step 3: Add `REASONING_*` cases in `applyEvent`**

In `services/idun_agent_standalone_ui/lib/use-chat.ts`, find the thinking lifecycle block at lines 183-221 (case strings `"THINKING_START"`, `"THINKING_TEXT_MESSAGE_START"`, etc.). Replace each `case` line by adding the corresponding `REASONING_*` and `Reasoning*` aliases. After the change the block reads:

```typescript
    // — Thinking / Reasoning lifecycle ------------------------
    // ag-ui-langgraph 0.0.35+ emits REASONING_* events; older
    // engines emit THINKING_*. Keep both for back-compat.
    case "THINKING_START":
    case "ThinkingStart":
    case "REASONING_START":
    case "ReasoningStart":
    case "THINKING_TEXT_MESSAGE_START":
    case "ThinkingTextMessageStart":
    case "REASONING_TEXT_MESSAGE_START":
    case "ReasoningTextMessageStart":
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? { ...m, thinking: [...m.thinking, ""] }
          : m,
      );
      break;
    case "THINKING_TEXT_MESSAGE_CONTENT":
    case "ThinkingTextMessageContent":
    case "REASONING_TEXT_MESSAGE_CONTENT":
    case "ReasoningTextMessageContent": {
      const delta = String(e.delta ?? "");
      updateLatestAssistant((m) => {
        if (m.role !== "assistant") return m;
        const idx = m.thinking.length - 1;
        const nextThinking =
          idx < 0
            ? [delta]
            : m.thinking.map((b, i) => (i === idx ? b + delta : b));
        return {
          ...m,
          thinking: nextThinking,
          thoughts: (m.thoughts ?? "") + delta,
        };
      });
      break;
    }
    case "THINKING_TEXT_MESSAGE_END":
    case "ThinkingTextMessageEnd":
    case "REASONING_TEXT_MESSAGE_END":
    case "ReasoningTextMessageEnd":
    case "THINKING_END":
    case "ThinkingEnd":
    case "REASONING_END":
    case "ReasoningEnd":
      // Close the current thinking buffer; the contents are already
      // committed to state.
      break;
```

Do not change anything outside the cases — the body inside each case is identical to the pre-change body. The diff is purely the addition of new `case "REASONING_..."` and `case "Reasoning..."` lines.

- [ ] **Step 4: Run the new test, confirm it passes**

```bash
npm test -- --run __tests__/use-chat.test.ts -t "REASONING_TEXT_MESSAGE_CONTENT"
```

Expected: PASS.

- [ ] **Step 5: Run the full frontend test suite**

```bash
npm test -- --run
```

Expected: all tests pass; no regression in the existing `THINKING_*` tests (they still hit their original case lines, just one position earlier in the switch).

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_standalone_ui/lib/use-chat.ts \
        services/idun_agent_standalone_ui/__tests__/use-chat.test.ts
git commit -m "$(cat <<'EOF'
feat(standalone-ui): handle REASONING_* events alongside THINKING_*

ag-ui-langgraph 0.0.35 renamed the protocol's reasoning-event
family from THINKING_* to REASONING_*. Adding the new cases
additively keeps the chat surface working with both old and new
engines — no engine version coupling required for back-compat.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Verify `ag_ui_langgraph.LangGraphAgent` base-class compatibility

Before swapping the LangGraph adapter, confirm the base class accepts the same kwargs and yields the same event shape. This is a pure-investigation task — no production code changes.

**Files:**
- Create: `libs/idun_agent_engine/tests/unit/agent/test_langgraph_base_class_swap.py` (temporary smoke test, will be deleted in Task 7)

- [ ] **Step 1: Write a smoke test that constructs the base class with Idun's kwargs**

Create `libs/idun_agent_engine/tests/unit/agent/test_langgraph_base_class_swap.py`:

```python
"""Smoke test that ``ag_ui_langgraph.LangGraphAgent`` accepts the
same kwargs Idun's adapter passes to ``copilotkit.LangGraphAGUIAgent``.

This test is temporary — it exists to prove the base class is a
drop-in replacement before Task 7 makes the swap. Delete this file
once Task 7 lands.
"""

from __future__ import annotations

import pytest

from ag_ui_langgraph import LangGraphAgent


@pytest.mark.unit
def test_base_class_accepts_idun_kwargs() -> None:
    """The base ``LangGraphAgent`` must accept ``name``, ``description``,
    ``graph``, and ``config`` — the four kwargs Idun's adapter passes."""
    from langgraph.graph import StateGraph
    from langchain_core.messages import HumanMessage

    builder = StateGraph(dict)

    def echo_node(state: dict) -> dict:
        return {"messages": [HumanMessage(content="ok")]}

    builder.add_node("echo", echo_node)
    builder.set_entry_point("echo")
    builder.set_finish_point("echo")
    graph = builder.compile()

    agent = LangGraphAgent(
        name="test",
        description="smoke",
        graph=graph,
        config={"callbacks": []},
    )

    assert agent is not None
    # The .run() method must exist and be an async generator factory —
    # that is the only public surface Idun's adapter calls.
    assert hasattr(agent, "run")
```

- [ ] **Step 2: Run the smoke test**

```bash
uv run pytest libs/idun_agent_engine/tests/unit/agent/test_langgraph_base_class_swap.py -v
```

Expected: PASS. If the constructor rejects any of the four kwargs, the swap is not yet a drop-in replacement — stop and reassess. The validation doc says it should be (the CopilotKit subclass adds behavior on top, not constructor incompatibility), but verify before proceeding.

- [ ] **Step 3: Commit the smoke test**

```bash
git add libs/idun_agent_engine/tests/unit/agent/test_langgraph_base_class_swap.py
git commit -m "$(cat <<'EOF'
test(engine): smoke-test ag_ui_langgraph.LangGraphAgent kwargs compat

Pins the contract that the base class accepts Idun's four kwargs
(name, description, graph, config) before the adapter swap in
Task 7 of WS1 lands. File is intentionally temporary — Task 7
deletes it after the swap is complete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Swap LangGraph adapter to base `ag_ui_langgraph.LangGraphAgent`

The actual cutover. Two files (`agent/langgraph/langgraph.py` and `server/routers/agent.py`) lose their `from copilotkit import LangGraphAGUIAgent` import and gain `from ag_ui_langgraph import LangGraphAgent`. Type annotations follow.

**Files:**
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py:20,200,257,384`
- Modify: `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py:10,311,333`
- Delete: `libs/idun_agent_engine/tests/unit/agent/test_langgraph_base_class_swap.py` (smoke test from Task 6)

- [ ] **Step 1: Edit the LangGraph adapter import and type annotations**

In `libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py`:

Replace line 20:
```python
from copilotkit import LangGraphAGUIAgent
```
with:
```python
from ag_ui_langgraph import LangGraphAgent
```

Replace line 200 (the type annotation on `_copilotkit_agent_instance`):
```python
        self._copilotkit_agent_instance: LangGraphAGUIAgent | None = None
```
with:
```python
        self._copilotkit_agent_instance: LangGraphAgent | None = None
```

Replace line 257 (the property return type):
```python
    def copilotkit_agent_instance(self) -> LangGraphAGUIAgent:
```
with:
```python
    def copilotkit_agent_instance(self) -> LangGraphAgent:
```

Replace lines 384-389 (the constructor call):
```python
        self._copilotkit_agent_instance = LangGraphAGUIAgent(
            name=self._name,
            description="Agent description",  # TODO: add agent description
            graph=self._agent_instance,
            config={"callbacks": self._obs_callbacks} if self._obs_callbacks else None,
        )
```
with:
```python
        self._copilotkit_agent_instance = LangGraphAgent(
            name=self._name,
            description="Agent description",  # TODO: add agent description
            graph=self._agent_instance,
            config={"callbacks": self._obs_callbacks} if self._obs_callbacks else None,
        )
```

The property name `copilotkit_agent_instance` stays — renaming it touches the `BaseAgent` protocol and ADK adapter and is out of scope for WS1.

- [ ] **Step 2: Edit the agent router's deprecated `/copilotkit/stream` route**

In `libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py`:

Replace line 10:
```python
from copilotkit import LangGraphAGUIAgent
```
with:
```python
from ag_ui_langgraph import LangGraphAgent
```

Replace line 311 (type annotation in the `Annotated` Depends):
```python
        LangGraphAGUIAgent | ADKAGUIAgent, Depends(get_copilotkit_agent)
```
with:
```python
        LangGraphAgent | ADKAGUIAgent, Depends(get_copilotkit_agent)
```

Replace line 333 (`isinstance` check):
```python
    if isinstance(copilotkit_agent, LangGraphAGUIAgent):
```
with:
```python
    if isinstance(copilotkit_agent, LangGraphAgent):
```

The `ADKAGUIAgent` reference is unchanged — it imports from `ag_ui_adk` already (verified in `agent/adk/adk.py:16`).

- [ ] **Step 3: Run engine unit tests**

```bash
uv run pytest libs/idun_agent_engine/tests/unit -q 2>&1 | tail -15
```

Expected: pass count >= Task 4 baseline. Pay attention to:
- Tests in `tests/unit/agent/test_langgraph.py` — they construct the adapter and exercise `.run()`.
- `tests/unit/server/test_routes_run.py` — exercises `/agent/run` end-to-end against a mock LangGraph.

If any test fails because it asserts the type literal `LangGraphAGUIAgent`, update the assertion to `LangGraphAgent` (the test was pinning Idun's old internal choice, not a behavior).

- [ ] **Step 4: Run engine integration tests**

```bash
uv run pytest libs/idun_agent_engine/tests/integration -q 2>&1 | tail -10
```

Expected: same baseline match.

- [ ] **Step 5: Delete the temporary smoke test from Task 6**

```bash
rm libs/idun_agent_engine/tests/unit/agent/test_langgraph_base_class_swap.py
```

The real adapter tests now exercise the base class through Idun's wrapper, so the targeted smoke is redundant.

- [ ] **Step 6: Verify no `copilotkit` import remains in src/**

```bash
grep -rn "copilotkit" libs/idun_agent_engine/src/ | grep -v "__pycache__\|\.pyc"
```

Expected: matches only docstrings and the `_copilotkit_agent_instance` legacy property name. No `import copilotkit` or `from copilotkit` lines remain.

- [ ] **Step 7: Commit**

```bash
git add libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py \
        libs/idun_agent_engine/src/idun_agent_engine/server/routers/agent.py \
        libs/idun_agent_engine/tests/unit/agent/test_langgraph_base_class_swap.py
git commit -m "$(cat <<'EOF'
refactor(engine): swap LangGraph adapter from CopilotKit subclass to base class

Idun's LangGraph adapter only calls .run() on the wrapper. The
copilotkit.LangGraphAGUIAgent subclass adds state injection
(state["copilotkit"]), ManuallyEmit* event interception, and
schema-flag filtering — none of which Idun's graphs use. Swap to
ag_ui_langgraph.LangGraphAgent, the base class, to remove a
transitive dependency surface.

Property name copilotkit_agent_instance is preserved for back-compat
with the BaseAgent protocol; rename is a separate cleanup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Drop `copilotkit==0.1.78` from engine dependencies

After Task 7, no `import copilotkit` remains. Drop the dep from `pyproject.toml`. The transitive footprint shrinks (copilotkit pulls partner-graphql, langchain-cli, etc.).

**Files:**
- Modify: `libs/idun_agent_engine/pyproject.toml:56`
- Modify: `uv.lock` (auto-regenerated)

- [ ] **Step 1: Remove the dependency line**

In `libs/idun_agent_engine/pyproject.toml`, delete line 56:

```toml
    "copilotkit==0.1.78",
```

Leave the surrounding lines (`ag-ui-adk`, `streamlit`) intact.

- [ ] **Step 2: Update the lockfile**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv lock
```

Expected: `Resolved N packages` with `copilotkit` removed and several transitive deps disappearing too.

- [ ] **Step 3: Sync the venv to actually drop the package**

```bash
uv sync --all-groups
```

Expected: `Removed N packages` line listing `copilotkit` and any now-unused transitives.

- [ ] **Step 4: Confirm the package is gone**

```bash
uv run python -c "import copilotkit" 2>&1 | head -3
```

Expected: `ModuleNotFoundError: No module named 'copilotkit'`. If this succeeds, the package is still installed somehow — investigate (likely a stale venv).

- [ ] **Step 5: Run engine unit + integration tests**

```bash
uv run pytest libs/idun_agent_engine/tests/unit libs/idun_agent_engine/tests/integration -q 2>&1 | tail -10
```

Expected: pass count >= Task 4 baseline. Any new failure means a stray `copilotkit` reference slipped through Task 7 — `grep` for it again.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_engine/pyproject.toml uv.lock
git commit -m "$(cat <<'EOF'
chore(engine): drop copilotkit==0.1.78 dependency

After WS1 Task 7 swapped the LangGraph adapter to the base
ag_ui_langgraph.LangGraphAgent, no production code imports
copilotkit. Removing the pin shrinks the transitive surface
(partner-graphql, langchain-cli, several others) and removes a
choke point that previously controlled which ag-ui-langgraph
versions Idun could ship.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: End-to-end smoke test with observability callbacks

Sanity-check that swapping the LangGraph wrapper did not change which callbacks fire. Langfuse and Phoenix integration is the highest-value behavior to confirm — they hook into LangChain `CallbackHandler` (Langfuse) or global OpenTelemetry instrumentation (Phoenix), and the swap should not affect either.

This is a manual smoke test because the relevant integration suites are gated behind `requires_langfuse` / `requires_phoenix` markers and require live services. Capture the result in the commit message; do not block WS1 on a Phoenix/Langfuse outage.

**Files:**
- None — purely behavioral verification.

- [ ] **Step 1: Run a LangGraph agent locally with Langfuse enabled**

Use any existing Idun example or test config that has Langfuse configured. If you do not have Langfuse credentials handy, skip Step 1 and proceed to Step 2 — note the skip in your task notes.

```bash
# Adjust the config path to whatever local LangGraph + Langfuse config you have.
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... \
  uv run idun agent serve --source file --path /path/to/your/local-langfuse-config.yaml
```

In another terminal, send a chat request:

```bash
curl -X POST http://localhost:8001/agent/run \
  -H "Content-Type: application/json" \
  -d '{"threadId":"smoke","runId":"r1","messages":[{"id":"m1","role":"user","content":"hello"}],"state":{},"tools":[],"context":[],"forwardedProps":{}}'
```

Expected: SSE stream completes, and a trace appears in the Langfuse UI within 30 seconds. If no trace appears, callback wiring broke during the swap.

- [ ] **Step 2: Run a LangGraph agent locally with Phoenix enabled**

Same pattern as Step 1, with a Phoenix config. Confirm a span appears in the Phoenix UI / OTLP endpoint.

- [ ] **Step 3: Document the smoke-test result**

Write a brief paragraph in your task notes:

```
WS1 Task 9 smoke test — YYYY-MM-DD HH:MM
- Langfuse: trace appeared within Ns. Run name = ..., session id = ...
- Phoenix: span appeared at <span_id>. Latency = Ns.
- Outcome: callbacks fire identically to pre-swap behavior.
```

- [ ] **Step 4: No commit needed — Task 9 is verification only.**

If the smoke test reveals a regression, open a follow-up task to investigate before proceeding to Task 10. Do not paper over it.

---

## Task 10: Update `CLAUDE.md` files to reflect the new dependency surface

Documentation hygiene. The engine's `CLAUDE.md` lists `copilotkit` under "Key Dependencies" — that's now wrong. The standalone UI's `CLAUDE.md` describes the AG-UI handling — note the dual `THINKING_*` / `REASONING_*` support.

**Files:**
- Modify: `libs/idun_agent_engine/CLAUDE.md` (the "Key Dependencies" section and the LangGraph adapter row in the table)
- Modify: `services/idun_agent_standalone_ui/CLAUDE.md` (the "AG-UI" section)

- [ ] **Step 1: Edit the engine CLAUDE.md**

In `libs/idun_agent_engine/CLAUDE.md`, find the "Key Dependencies" section. Update the AG-UI bullet from:

```
- `copilotkit`, `ag-ui-core`, `ag-ui-encoder`, `ag-ui-adk` — AG-UI streaming protocol
```

to:

```
- `ag-ui-protocol`, `ag-ui-langgraph`, `ag-ui-adk` — AG-UI streaming protocol (LangGraph and ADK adapters now use the base classes from these packages directly; CopilotKit is no longer a runtime dependency)
```

Find the "Agent Adapters" table. Update the LangGraph row's "CopilotKit" column from:

```
| **LanggraphAgent** | ... | `LangGraphAGUIAgent` |
```

to:

```
| **LanggraphAgent** | ... | `ag_ui_langgraph.LangGraphAgent` |
```

(The column header "CopilotKit" can stay — renaming the header is a doc cleanup that affects the ADK row too. The entry text now points at the actual class.)

- [ ] **Step 2: Edit the standalone UI CLAUDE.md**

In `services/idun_agent_standalone_ui/CLAUDE.md`, find the "AG-UI" section. Append:

```markdown

The chat reducer (`lib/use-chat.ts`) handles both `THINKING_*` and `REASONING_*` event families so the UI works against engines on either side of the `ag-ui-langgraph` 0.0.35 protocol rename.
```

- [ ] **Step 3: Commit**

```bash
git add libs/idun_agent_engine/CLAUDE.md services/idun_agent_standalone_ui/CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: reflect WS1 engine modernization in service-level CLAUDE.md

Engine no longer depends on copilotkit. LangGraph and ADK adapters
use ag_ui_langgraph and ag_ui_adk base classes directly. Standalone
UI handles both THINKING_* and REASONING_* events for back-compat
across engine versions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final clean-build verification

End-to-end build of both Python wheel and Next.js bundle. Catches anything that passed unit tests but breaks at packaging time (stray imports, type errors, missing files).

**Files:**
- None — verification only.

- [ ] **Step 1: Build the engine wheel**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv build --package idun-agent-engine
```

Expected: `dist/idun_agent_engine-*.whl` produced, no warnings about missing modules or unresolved imports.

- [ ] **Step 2: Build the standalone UI**

```bash
cd services/idun_agent_standalone_ui
npm run build
```

Expected: `out/` populated. Check the bundle output for the standalone UI; the `THINKING/REASONING` cases are tiny (a few extra lines), so bundle size should be effectively unchanged.

- [ ] **Step 3: Run the full repo lint and type check**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
make ci
```

Expected: lint, mypy, and pytest all pass.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin explore/a2ui-langgraph
```

- [ ] **Step 5: No commit needed — Task 11 is verification only.**

---

## Self-review against the validation doc

WS1 was extracted from the validation doc (`2026-04-30-a2ui-langgraph-mvp-validation.md`, "Refined MVP recommendation" section). Mapping:

| Validation doc requirement | Plan task |
|---|---|
| Bump ag-ui-langgraph 0.0.25 → 0.0.35 | Task 2 |
| Re-evaluate `apply_handle_single_event_patch` | Task 3 |
| Re-evaluate `apply_prepare_stream_patch` | Task 4 |
| Add THINKING→REASONING handling in use-chat.ts (keep THINKING for back-compat) | Task 5 |
| Swap `copilotkit.LangGraphAGUIAgent` for base class | Tasks 6 + 7 |
| Drop `copilotkit==0.1.78` from pyproject.toml | Task 8 |
| Smoke-test obs callbacks (Langfuse, Phoenix) | Task 9 |
| Update service CLAUDE.md files | Task 10 |
| Final build verification | Task 11 |

Gap check — items NOT in WS1 (deferred to follow-up workstreams):
- A2UI v0.9 React renderer integration (`@a2ui/react`, `@a2ui/web_core`) — WS2.
- New `idun.a2ui.messages` CUSTOM event handling in `applyEvent` — WS2.
- `forwardedProps.idun.a2uiAction` action shape and snake-case depth verification — WS3.
- MCP `EmbeddedResource` mimeType bridge (`structuredContent` or `ToolCallInterceptor`) — out of MVP, separate plan.
- Property rename `copilotkit_agent_instance` → neutral name — separate cleanup, touches `BaseAgent` protocol.
- Removal of deprecated `/agent/copilotkit/stream` route — separate cleanup.

Type/method consistency check:
- Property `copilotkit_agent_instance` referenced in Task 7 matches the existing protocol in `agent/base.py:70`. Type return annotation changes from `LangGraphAGUIAgent` to `LangGraphAgent` (Task 7 Step 1, 2). Consistent across both files modified.
- Test file paths consistent: smoke test created in Task 6, deleted in Task 7. Frontend test added in Task 5.
- Commit message format consistent across all tasks (HEREDOC, `Co-Authored-By` trailer).

No placeholder content — every step shows the exact code to add or remove and the exact command to run with expected output.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-04-30-ws1-engine-modernization.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review between tasks (spec compliance, then code quality), fast iteration in this session.

**2. Inline Execution** — Execute tasks here using superpowers:executing-plans, batch execution with checkpoints for review.

Which approach?
