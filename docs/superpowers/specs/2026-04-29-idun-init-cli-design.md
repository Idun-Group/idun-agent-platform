# `idun-standalone init` CLI Design

> **Sub-project:** D (of A–E from `2026-04-27-idun-onboarding-ux-design.md`)
> **Status:** Locked — ready for implementation plan
> **Depends on:** Sub-projects A (scanner, PR #538 path), B (HTTP API), C (browser wizard) — all three landed in the umbrella PR.
> **Branch:** `feat/idun-init-cli` (off the `feat/onboarding-scanner` branch state).

---

## 1. Goal

Ship a single-command terminal entry point that gets the user from "I just installed Idun" to "my agent runs and I can chat with it" without leaving the terminal until the browser opens.

`idun-standalone init` runs DB migrations, seeds from `config.yaml` if present, boots the standalone server, and opens the browser. The browser handles the rest: chat if an agent is configured, the onboarding wizard (sub-project C) if not.

## 2. Why

Sub-projects A/B/C built the in-browser onboarding wizard. The user still needs SOMETHING to type at the terminal to get there. Today the choice is:

- `idun-standalone setup && idun-standalone serve` — works but ugly. Two commands, manual browser launch.
- `idun init` (engine package) — launches a Textual TUI that's being phased out and doesn't integrate with the new wizard at all.

Sub-project D's `idun-standalone init` is the bridge: one command, fast, no Textual, opens the browser at the wizard automatically. The existing engine TUI is disconnected from `idun init` (engine package) and flagged as deprecated; this PR doesn't remove its code, just stops it being the entry point users hit by accident.

## 3. Out of scope

- Removing the engine package's Textual TUI code. Disconnection happens in a separate one-line PR after this one lands.
- Renaming `idun-standalone init` to `idun init`. The cross-package alias question is deferred — `idun init` (engine) currently routes to the TUI; once the TUI is properly retired, `idun init` can be re-pointed at the standalone's init command. Not now.
- Scanning, scaffolding, or `config.yaml` writing from the CLI. The browser wizard does all of that.
- Cloud Run / Dockerfile changes. The flag works for that use case (see §6) but updating the deployment artifacts is a follow-up.

## 4. Locked decisions

These came from brainstorming questions Q1–Q7.

| # | Decision |
|---|----------|
| 1 | `idun-standalone init` is a thin launcher: setup → serve → open browser. No scanning, scaffolding, or yaml writing — wizard work happens in the browser. |
| 2 | Existing engine TUI gets disconnected from `idun init` later, separate PR. Code stays for now. |
| 3 | Lives in the standalone package as `idun-standalone init` (will rebrand to `idun init` when engine TUI retires). |
| 4 | Port: `--port` flag overrides `IDUN_PORT` env var overrides default 8000. |
| 5 | Browser opens by default; `--no-browser` flag suppresses (Cloud Run / headless). |
| 6 | Idempotent: same flow regardless of whether DB has agent rows. The browser routes via CT4's existing `getAgent` 200/404 logic. |
| 7 | Standard Unix server lifecycle on Ctrl+C. Browser tab stays open with connection-refused. |

## 5. Module layout

One file modified:

```
libs/idun_agent_standalone/src/idun_agent_standalone/
└── cli.py                MODIFY: add `init` subcommand alongside hash-password/setup/serve
```

No new modules. No schema changes. No scaffolder changes.

## 6. The `init` command

### Signature

```python
@main.command("init")
@click.option(
    "--port",
    "port_override",
    type=int,
    default=None,
    help="Port to bind. Overrides IDUN_PORT (default 8000).",
)
@click.option(
    "--no-browser",
    "no_browser",
    is_flag=True,
    default=False,
    help="Don't open the browser automatically. Useful for Cloud Run + headless.",
)
def init_cmd(port_override: int | None, no_browser: bool) -> None:
    """Initialize Idun in the current folder and launch chat + admin."""
```

### Flow

```
1. setup_logging()                      # match existing CLI commands
2. if port_override: os.environ["IDUN_PORT"] = str(port_override)
3. settings = StandaloneSettings()       # picks up IDUN_PORT, IDUN_HOST, etc.
4. upgrade_head()                        # alembic migrations (idempotent)
5. asyncio.run(_setup(None))             # seed from config.yaml if present
6. if not no_browser:
       webbrowser.open(f"http://{settings.host}:{settings.port}/")
7. asyncio.run(_serve(settings))         # blocks until Ctrl+C
```

### Why open the browser BEFORE serve

`_serve` blocks the main thread. Opening AFTER would require a thread or `asyncio.create_task` — extra complexity for negligible benefit. Modern browsers retry connection-refused for several seconds, so launching the browser pre-serve gives uvicorn a window to come up. The user perceives it as a single seamless step.

### Why mutate `os.environ["IDUN_PORT"]`

`StandaloneSettings()` reads from environment via `pydantic-settings`. Mutating env BEFORE constructing settings is the cleanest way to make `--port` win. Alternative is threading a port arg through `_serve`, which would require changing its existing signature for one caller.

### Idempotent behavior

- `upgrade_head()` is a no-op if the DB is at head.
- `seed_from_yaml_if_empty` (inside `_setup`) is a no-op if the agent table has rows.
- The browser sees an existing agent and goes straight to chat (per CT4's redirect logic).
- Re-running `idun-standalone init` on an already-set-up folder is safe and just re-launches the server.

### Cloud Run / container ergonomics

The `--no-browser` flag makes the command a viable container `CMD`:

```dockerfile
CMD ["idun-standalone", "init", "--no-browser"]
```

Replaces today's `CMD ["sh", "-c", "idun-standalone setup && idun-standalone serve"]` — single process, no shell, cleaner signal handling. The user's actual browser hits the Cloud Run URL from outside; the container's local browser-launch is suppressed.

`IDUN_HOST=0.0.0.0` is required for Cloud Run (and any external-traffic deployment) — that's an existing `StandaloneSettings` env var, set in the Cloud Run service config. No code change needed in this sub-project.

## 7. Imports

Two new top-of-file imports in `cli.py`:

```python
import os
import webbrowser
```

`asyncio`, `click`, `setup_logging`, `StandaloneSettings`, `_setup`, `_serve` are already imported for the existing `setup` and `serve` commands.

## 8. Testing strategy

### Unit tests

`libs/idun_agent_standalone/tests/unit/test_cli_init.py` (new file, 6 tests):

1. **Subcommand registration** — `idun-standalone init --help` succeeds; `main.commands["init"]` exists.
2. **`--port` flag mutates env** — `runner.invoke(main, ["init", "--port", "9000"])` results in `os.environ["IDUN_PORT"] == "9000"` before settings are constructed.
3. **`--no-browser` suppresses launch** — with the flag, `webbrowser.open` is never called.
4. **Default flow opens browser** — without the flag, `webbrowser.open(url)` is called with `f"http://{host}:{port}/"`.
5. **Migration runs before setup** — `upgrade_head` is called before `_setup` (call-order assertion on mocks).
6. **`_serve` runs after migrations + browser launch** — call-order assertion.

The tests use Click's `CliRunner` plus `monkeypatch` to stub:
- `idun_agent_standalone.db.migrate.upgrade_head`
- `idun_agent_standalone.cli._setup`
- `idun_agent_standalone.cli._serve`
- `webbrowser.open`

So no test actually runs migrations or boots a server. The harness fix from step 2 covers the end-to-end boot path; sub-project D's tests cover the CLI surface only.

### Integration / E2E

No new e2e test. The e2e harness from step 2 (`boot-standalone.sh`) already does the equivalent of `init` (setup + serve), and the wizard E2E flows from CT10 cover everything `init` could test in the browser. A potential follow-up is to simplify the boot script to USE `idun-standalone init --no-browser` instead of the explicit setup + serve dance — but that's not part of this sub-project's scope.

## 9. Future work (deferred)

- Cross-package alias: route `idun init` (engine package) to `idun-standalone init` once the Textual TUI is properly retired. One-line change in `idun_platform_cli/main.py`.
- Update the standalone Dockerfile / Cloud Run docs to use `idun-standalone init --no-browser` as the entrypoint.
- Driver.js post-wizard guided tour (sub-project E) — independent of this sub-project.

## 10. Open questions

None at time of locking.
