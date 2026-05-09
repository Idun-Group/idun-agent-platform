# Coding Guidelines

_Generated from `.claude/guidelines/rules/*.yaml` — do not edit by hand._

## async-lifecycle

### ASYNC-001 — No sync I/O on async paths

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** engine-team

Sync HTTP / DB / file I/O inside an async function blocks the event loop and
starves every other coroutine on it. In a FastAPI/LangGraph hot path this
silently destroys throughput and tail latency.

**Fix:** Replace `requests.get(...)` with `async with httpx.AsyncClient() as c:` and
switch sync DB / file calls to their async equivalents (asyncpg, aiofiles).

Good:
```
async with httpx.AsyncClient() as client:
    resp = await client.get(url)
```

Bad:
```
async def fetch(url):
    return requests.get(url).json()
```

### ASYNC-002 — Track `asyncio.create_task` references (no fire-and-forget)

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** engine-team

A bare `asyncio.create_task(...)` whose return value is discarded can be
garbage-collected mid-flight, swallowing exceptions and silently dropping
work. Long-lived background tasks must keep a strong reference.

**Fix:** Assign the task to a module/instance variable or a tracking set, and
`await` or `cancel()` it during shutdown.

### ASYNC-003 — Async session-per-request lifecycle

**Severity:** warn
**Layer:** pr-review-agent, manual
**Owner:** engine-team

Async DB sessions and connections must be acquired and released per request,
not stashed on a long-lived module-level handle. Sharing a session across
requests leaks state between coroutines, breaks transaction isolation, and
hides bugs that only show up under concurrency.

**Fix:** Inject the session via FastAPI `Depends(get_session)` (or an equivalent
per-request factory) and use it inside `async with` so it always closes.

Good:
```
async def handler(session: AsyncSession = Depends(get_session)):
    async with session.begin():
        ...
```

Bad:
```
SESSION = AsyncSession(engine)  # module-level, reused across requests

async def handler():
    await SESSION.execute(...)
```

## logging

### LOG-001 — Use `logger.exception` for unexpected; never bare `except`

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** platform-team

Unexpected exceptions must be logged with the traceback so on-call can
diagnose them. `logger.error("...")` inside an `except` clause hides the
stack; bare `except:` swallows `KeyboardInterrupt` and `SystemExit`.

**Fix:** Use `except Exception:` with `logger.exception("context")`, or a narrower
exception type when you intend to handle the error locally.

Good:
```
try:
    result = await call_external()
except httpx.HTTPError:
    logger.exception("external call failed")
    raise
```

Bad:
```
try:
    result = await call_external()
except:
    logger.error("call failed")
```

### LOG-002 — Required structured log fields (request_id, agent_id, run_id)

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

Logs emitted from request- or agent-handling code must carry the contextual
identifiers that let an operator stitch a trace back together: at minimum
`request_id`, `agent_id`, and (when applicable) `run_id`. A free-form text
message without these fields is unsearchable in the aggregator.

**Fix:** Pass identifiers via `logger.info("...", extra={"request_id": ..., "agent_id": ..., "run_id": ...})`
or use the structured-logging helper your service already exposes.

Good:
```
logger.info(
    "agent run completed",
    extra={"request_id": req_id, "agent_id": agent_id, "run_id": run_id},
)
```

Bad:
```
logger.info(f"agent run completed for {agent_id}")
```

### LOG-003 — Redact secrets/PII from log args

**Severity:** warn
**Layer:** pr-review-agent
**Owner:** platform-team

Logs are shipped to Langfuse, OTel collectors, and stdout — anything logged
in plaintext leaks into long-term retention. Credentials and PII must be
redacted (or never logged) at the call site, not at the sink.

**Fix:** Replace secret values with a placeholder like `"***"` before logging, or
log the field name only (`logger.info("token rotated")` not the token).

## error-handling

### ERR-001 — No `except Exception:` without re-raise + logger.exception

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** platform-team

A blind `except Exception:` that quietly continues hides bugs and turns
unexpected failures into silent data corruption. The default policy is to
log the traceback and re-raise; deliberate suppression must be justified.

**Fix:** Either narrow the exception class or call `logger.exception(...)` then
`raise` — only swallow exceptions when you have a documented reason.

### ERR-002 — Custom exception hierarchy at package boundaries

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

Each package should expose a single base exception (e.g., `EngineError`,
`ManagerError`) and all package-defined exceptions should inherit from it.
Callers can then catch the package's surface area with one clause instead
of enumerating internal types — and refactors don't break their except
blocks.

**Fix:** Define `class FooError(Exception): ...` in the package's top-level errors
module, and make new exception classes inherit from it.

Good:
```
class EngineError(Exception):
    """Base for all idun_agent_engine errors."""

class StreamingError(EngineError):
    ...
```

Bad:
```
class StreamingError(Exception):
    ...
```

### ERR-003 — Never swallow exceptions silently

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** platform-team

`try: ... except: pass` (or `except Exception: pass`) without a logged
reason is the textbook way to lose a stack trace and turn a real failure
into a silent corruption. If you genuinely need to suppress, log the
exception first and add a comment explaining why.

**Fix:** Replace bare suppression with `logger.exception("...")` plus an explicit
re-raise — or, if suppression is intentional, narrow the except clause and
document the rationale.

## types

### TYPE-001 — No `Any` outside FFI/JSON boundaries

**Severity:** warn
**Layer:** pre-commit
**Owner:** platform-team

Explicit `Any` defeats the type checker and propagates through every call
site that touches it. It is acceptable at FFI / raw-JSON boundaries where
the shape is genuinely unknown, but never inside our domain code.

**Fix:** Replace `Any` with a concrete type, `TypedDict`, dataclass, or Pydantic
model — read the source to find the real type before reaching for `Any`.

### TYPE-002 — Prefer TypedDict / dataclass / Pydantic over raw dicts at boundaries

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

Functions that exchange structured data across module boundaries should
describe that structure with a `TypedDict`, dataclass, or Pydantic model
rather than a `dict[str, Any]`. Typed boundaries catch refactor breakage
at the type checker and document the contract in one place.

**Fix:** Replace `dict[str, Any]` argument/return types with a `TypedDict`,
`@dataclass`, or `BaseModel` that lists the required keys.

Good:
```
class StreamEvent(TypedDict):
    run_id: str
    type: Literal["start", "delta", "end"]
    payload: str

def emit(event: StreamEvent) -> None: ...
```

Bad:
```
def emit(event: dict[str, Any]) -> None: ...
```

## time

### TIME-001 — Always tz-aware UTC datetimes; ban `datetime.utcnow()`

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** platform-team

`datetime.utcnow()` returns a naive datetime that compares wrongly against
tz-aware values and is deprecated in Python 3.12+. All timestamps that
cross a process boundary (DB, API, logs) must be tz-aware UTC.

**Fix:** Use `datetime.now(timezone.utc)` (or `datetime.now(UTC)` on 3.11+) and
store/transmit the value with its tzinfo intact.

Good:
```
from datetime import datetime, timezone
now = datetime.now(timezone.utc)
```

Bad:
```
from datetime import datetime
now = datetime.utcnow()
```

## resource

### RES-001 — Use `async with` for HTTP/DB/files; no manual `.close()`

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** engine-team

Manual `.close()` calls leak resources whenever the path between open and
close raises. Context managers guarantee cleanup on every exit and compose
with `async with` for httpx, asyncpg, aiofiles, etc.

**Fix:** Wrap the resource in `with` / `async with`; collapse nested context
managers into a single comma-separated form.

## sql

### SQL-001 — Parametrized queries only; no f-string SQL

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** manager-team

String-interpolated SQL is a SQL-injection vector and breaks the driver's
prepared-statement cache. All values must travel as bound parameters via
SQLAlchemy text() bindings or the driver's parameter API.

**Fix:** Replace f-string SQL with a parametrized query — `text("...:id")` plus
`.params(id=value)`, or the asyncpg `$1`/`$2` form.

Good:
```
await session.execute(text("SELECT * FROM agents WHERE id = :id"), {"id": agent_id})
```

Bad:
```
await session.execute(text(f"SELECT * FROM agents WHERE id = '{agent_id}'"))
```

## complexity

### CMP-001 — Cyclomatic complexity ≤ 10 (advisory)

**Severity:** advise
**Layer:** pre-commit
**Owner:** platform-team

Functions with cyclomatic complexity above 10 are hard to test, hard to
review, and tend to attract bugs. The cap is advisory — exceeding it is a
prompt to refactor into smaller helpers, not an automatic failure.

**Fix:** Extract guard clauses, dispatch tables, or helper functions to bring the
branching count down; aim for one responsibility per function.

### CMP-002 — Max 6 args; prefer dataclass/TypedDict over many positional args

**Severity:** advise
**Layer:** pre-commit
**Owner:** platform-team

Functions with more than six arguments are hard to call correctly and
hard to refactor — argument-order bugs and "what was the 7th positional
again?" mistakes are common. Group cohesive parameters into a dataclass,
TypedDict, or Pydantic model.

**Fix:** Bundle related parameters into a dataclass/TypedDict and pass it as one
argument; keep cross-cutting concerns (logger, settings) on `self` or via
`Depends(...)`.

### CMP-003 — Extract on 2+ similar call sites; no premature DRY

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

Premature abstraction is more expensive than a small amount of duplication.
Wait until at least two call sites share genuinely coupled logic before
extracting a helper — and when you do extract, the helper's name should
describe the shared intent, not the shared shape.

**Fix:** If only one caller exists, inline the code. If two or more callers share
meaningfully coupled logic, extract; otherwise leave the duplication and
add a TODO with a ticket id.

### MAGIC-001 — Magic numbers should be module-level Final constants

**Severity:** advise
**Layer:** pre-commit
**Owner:** platform-team

Inline numeric literals make intent invisible at the call site and force
every reader to grep for other occurrences when the value changes. Lift
them to module-level `Final` constants with a name that explains the
meaning.

**Fix:** Replace the literal with a named `Final` constant: `MAX_RETRIES: Final = 3`.

Good:
```
MAX_RETRIES: Final = 3

for _ in range(MAX_RETRIES):
    ...
```

Bad:
```
for _ in range(3):
    ...
```

## schema

### MIGRATION-001 — SQLAlchemy model change requires Alembic revision in same PR

**Severity:** warn
**Layer:** pr-review-agent
**Owner:** manager-team

Any change to a SQLAlchemy ORM model must be accompanied by an Alembic
revision in the same PR. Otherwise the dev/prod migration breaks at deploy.

**Fix:** Run `cd services/idun_agent_manager && alembic revision --autogenerate -m "<msg>"`
and commit the new file under alembic/versions/.

### SCHEMA-001 — Schema changes ship in idun_agent_schema before consumers

**Severity:** warn
**Layer:** pr-review-agent
**Owner:** schema-team

Pydantic models in idun_agent_schema must change before any consumer
(idun_agent_engine, idun_agent_standalone, services/idun_agent_standalone_ui)
references the new field. A PR that updates a consumer without first updating
the schema breaks the schema-flows-first invariant from CLAUDE.md.

**Fix:** Split the change: (1) add the field to idun_agent_schema, ship that PR;
(2) consume it in engine/standalone/UI in a follow-up PR.

### SCHEMA-002 — Keep UI API types in sync when standalone backend routes change

**Severity:** warn
**Layer:** pr-review-agent, ci
**Owner:** ui-team

When libs/idun_agent_standalone/src/idun_agent_standalone/api/v1/routers/
changes (request/response models, new endpoints, renamed fields), the
hand-written TypeScript types under
services/idun_agent_standalone_ui/lib/api/types/ must be updated in the
same PR or the UI breaks at runtime.

Note: post-PR-#592 the UI lives at services/idun_agent_standalone_ui (Next.js)
and consumes the standalone admin REST API exposed by the
libs/idun_agent_standalone package. There is no auto-generated client today —
types are maintained by hand, so cross-package drift is the failure mode this
rule guards against.

**Fix:** Update the matching file under
services/idun_agent_standalone_ui/lib/api/types/ (e.g. agent.ts, mcp.ts,
guardrails.ts) to mirror the Pydantic schema change, then run
`cd services/idun_agent_standalone_ui && npm run typecheck` to confirm
call sites still compile.

## testing

### TEST-001 — New feature ships with at least one test

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

A PR that introduces new behavior should land with at least one test that
exercises it. The team's testing workflow (in CLAUDE.md) is test-first;
if a feature lands untested, the next refactor is the one that breaks it
silently.

**Fix:** Add a focused unit or integration test alongside the new code under the
package's `tests/` tree; for behavior changes, add a regression test that
pinpoints the bug.

### TEST-002 — Integration tests hit the real DB, not mocks

**Severity:** warn
**Layer:** pr-review-agent
**Owner:** platform-team

Integration tests exist to verify behavior against the same drivers and
lifecycle the production code uses. Mocking the DB session in an
integration test removes the bug class the test is meant to catch — driver
quirks, transaction boundaries, schema drift — and turns the test into an
expensive unit test.

**Fix:** Use the project's real Postgres test fixture (e.g., a per-test schema
on a local Postgres) instead of `AsyncMock`. Reserve mocks for unit tests.

### TEST-003 — Coverage thresholds (advisory)

**Severity:** advise
**Layer:** ci
**Owner:** platform-team

Coverage is reported per package as an advisory floor: 70% for the engine,
60% for the standalone, report-only for the UI in v1. The number is a
trailing indicator — the goal is to make under-tested areas visible, not
to chase the metric.

**Fix:** When the threshold dips, add tests for the largest uncovered branches
before adding new behavior; the coverage report points to the files.

### TEST-004 — UI and standalone tests gated on every PR

**Severity:** warn
**Layer:** ci
**Owner:** platform-team

Today only the engine package's tests are gated in CI. Standalone (FastAPI
admin REST + reload pipeline) and UI (Next.js) tests must also run on every PR
to develop, otherwise breakages land silently.

**Fix:** Confirm .github/workflows/standalone-ci.yml triggers on this PR's paths;
add a ui-ci.yml job that runs `cd services/idun_agent_standalone_ui &&
npm test -- --run` on changes under that path.

## observability

### ENV-001 — Typed env vars via Pydantic Settings; no scattered `os.getenv` in business logic

**Severity:** warn
**Layer:** pre-commit, pr-review-agent
**Owner:** manager-team

Reading environment variables ad-hoc with `os.getenv` in business logic
scatters configuration across the codebase, gives every call site a
different default, and skips type validation. Centralize all env-driven
config in a `pydantic_settings.BaseSettings` subclass and inject it.

**Fix:** Add the variable to the package's `Settings` class with the right type
and default, and read it via the injected settings instance instead of
`os.getenv`.

Good:
```
class Settings(BaseSettings):
    max_retries: int = 3

settings = Settings()
for _ in range(settings.max_retries):
    ...
```

Bad:
```
for _ in range(int(os.getenv("MAX_RETRIES", "3"))):
    ...
```

### OBS-001 — Telemetry must never alter business semantics

**Severity:** warn
**Layer:** pr-review-agent
**Owner:** manager-team

Telemetry init, capture, and flush calls (Langfuse, Phoenix, OpenTelemetry,
LangSmith) must be wrapped in `try/except Exception` with `logger.exception`
so a downed observability backend never takes down the request path. If
telemetry can change a return value or raise into business logic, it has
become business logic.

**Fix:** Wrap the telemetry call in `try/except Exception: logger.exception(...)`,
return the original value unchanged, and let the request continue.

Good:
```
try:
    tracer.capture(event)
except Exception:
    logger.exception("telemetry capture failed")
```

Bad:
```
tracer.capture(event)  # raises into the request handler if Langfuse is down
```

## workflow

### ADR-001 — Architectural change requires an ADR

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

Architectural decisions — picking a framework, changing a contract,
introducing a cross-service dependency — must be recorded as an ADR in
`docs/adr/NNNN-title.md`. ADRs capture context and trade-offs the diff
alone cannot, so future readers know why the system looks the way it does.

**Fix:** Copy `docs/adr/0001-record-architectural-decisions.md` to the next free
`NNNN-<slug>.md`, fill in Context / Decision / Consequences, and link
the ADR from the PR description.

### API-001 — Deprecation policy — semver and DeprecationWarning before removal

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

Public API removals and renames must follow the team's semver policy:
emit a `DeprecationWarning` (with a clear migration message) for at least
one minor release before the symbol disappears. Silent renames break every
downstream consumer and erode trust in the package.

**Fix:** Keep the old symbol as a thin shim that calls the new one, decorate it
with `warnings.warn("foo is deprecated; use bar", DeprecationWarning, stacklevel=2)`,
and schedule the removal for a future major version.

### DEP-001 — Lockfile must be in sync; pip-audit advisory

**Severity:** advise
**Layer:** ci
**Owner:** engine-team

`uv lock --check` must pass on every PR — a drifted lockfile means the
resolved dependency tree on a teammate's machine isn't the one CI tested.
`pip-audit` runs alongside as an advisory signal for known CVEs in the
resolved set.

**Fix:** Run `uv lock` locally, commit the updated `uv.lock`, and address any
high-severity advisories from `pip-audit` before merging.

### DOC-001 — Public API requires a docstring

**Severity:** advise
**Layer:** pre-commit
**Owner:** platform-team

Public classes, public methods, and public top-level functions must carry
a docstring describing what they do and what they return. Internal helpers
(leading underscore) are exempt — the rule targets the surface area
external callers depend on.

**Fix:** Add a one-line summary docstring (Google or NumPy style is fine); expand
with Args/Returns/Raises blocks when the contract isn't obvious from the
signature.

### GIT-001 — Conventional Commits

**Severity:** advise
**Layer:** pre-commit
**Owner:** platform-team

Commit messages follow Conventional Commits (`type(scope): subject`,
optional body, optional footer). The format powers automated changelogs,
release notes, and the feature-loop's commit harvest. v1 enforces it
advisory-only via commitlint.

**Fix:** Reword the offending commit with `git commit --amend` so the subject
starts with `feat|fix|docs|chore|refactor|test|ci(...)?:` and stays
under 72 characters.

### GIT-002 — PRs over 500 LOC should be split

**Severity:** advise
**Layer:** pr-review-agent
**Owner:** platform-team

PR size is a strong predictor of review quality: above ~500 added lines,
reviewers skim and bugs land. The PR-review agent flags oversize diffs
(excluding generated/lockfile content) as a cue to split into a stack.

**Fix:** Split the work into a stack of smaller PRs (refactor → behavior change →
tests, or per-feature increments) so each diff is easy to read end-to-end.

### TODO-001 — TODO/FIXME requires `# TODO(owner): <ticket-id>`

**Severity:** advise
**Layer:** pre-commit
**Owner:** platform-team

An anonymous TODO is a promise no one made. Every TODO/FIXME comment must
identify an owner and a ticket — `# TODO(geoffrey): IDN-123` — so the work
shows up on a board and dies when the ticket is closed instead of rotting
in the codebase.

**Fix:** Reformat the comment as `# TODO(owner-handle): TICKET-ID short description`
(or remove the TODO if the work is no longer needed).

## ui

### UI-001 — TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes

**Severity:** warn
**Layer:** ci
**Owner:** ui-team

The standalone UI's `tsconfig` enables `strict`, `noUncheckedIndexedAccess`,
and `exactOptionalPropertyTypes` so the type checker catches the bug
classes that show up only at runtime — undefined indices, nullable
optionals, and "I forgot the property exists." `npm run typecheck` must
stay green.

**Fix:** Run `npm run typecheck` locally and address each error; do not loosen
the strict flags to silence them.

### UI-002 — Accessibility — eslint-plugin-jsx-a11y rules

**Severity:** advise
**Layer:** pre-commit
**Owner:** ui-team

React components must satisfy `eslint-plugin-jsx-a11y` rules so the UI
remains usable for keyboard and screen-reader users. The plugin catches
the common regressions: missing alt text, click handlers on non-buttons,
inputs without labels.

**Fix:** Address the eslint findings (add `alt`, swap `<div onClick>` for a
button, associate `<label htmlFor>` with the input) instead of disabling
the rule.

### UI-003 — i18n — user-facing strings via i18next, no inline literals

**Severity:** advise
**Layer:** pre-commit
**Owner:** ui-team

All user-facing strings must go through `i18next` so the UI stays
translatable. Inline JSX literals — even temporary ones — break the
translation pipeline and tend to ship to production unflagged.

**Fix:** Replace the literal with `t("key.path")` and add the entry to the locale
JSON files under `services/idun_agent_standalone_ui/src/locales/`.
