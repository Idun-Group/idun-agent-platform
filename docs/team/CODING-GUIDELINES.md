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
