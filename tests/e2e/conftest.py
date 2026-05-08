"""Shared fixtures for the real-LLM e2e suite.

Lifecycle (per scenario):
1. `pair` fixture reads --pair CLI option (or E2E_PAIR env) and returns a
   PairId TypedDict (adapter, provider, model).
2. `render_config` renders a Jinja2 YAML template into tmp_path.
3. `standalone` spawns `idun init --no-browser` against that YAML on a
   free port, polls /health, yields base_url, then SIGTERMs the process.

Session start: assert at least one of OPENAI_API_KEY / GOOGLE_API_KEY is
set, else skip the whole suite.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable, Generator
from contextlib import AbstractContextManager, contextmanager
from pathlib import Path
from typing import TYPE_CHECKING, TypedDict

import httpx
import pytest
from jinja2 import Environment, FileSystemLoader, StrictUndefined

if TYPE_CHECKING:
    from _pytest.config import Config


PAIR_TABLE: dict[str, dict[str, str]] = {
    "lg-openai": {
        "adapter": "LANGGRAPH",
        "provider": "openai",
        "model": "gpt-5.4-mini",
    },
    "lg-gemini": {
        "adapter": "LANGGRAPH",
        "provider": "gemini",
        "model": "gemini-3-flash-preview",
    },
    "adk-gemini": {
        "adapter": "ADK",
        "provider": "gemini",
        "model": "gemini-3-flash-preview",
    },
}


class PairId(TypedDict):
    name: str
    adapter: str
    provider: str
    model: str


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register --pair so CI can constrain the matrix shard."""
    parser.addoption(
        "--pair",
        action="store",
        default=None,
        help=(
            "Restrict scenarios to a single adapter+provider pair "
            "(lg-openai|lg-gemini|adk-gemini)"
        ),
    )


def pytest_configure(config: Config) -> None:
    config.addinivalue_line(
        "markers",
        "pair(name): scenario applies only to the named adapter+provider pair",
    )


def _selected_pairs(config_pair: str | None) -> list[str]:
    chosen = config_pair or os.environ.get("E2E_PAIR")
    if chosen:
        assert (
            chosen in PAIR_TABLE
        ), f"unknown pair {chosen!r}; one of {list(PAIR_TABLE)}"
        return [chosen]
    return list(PAIR_TABLE)


def pytest_collection_modifyitems(config: Config, items: list[pytest.Item]) -> None:
    """Drop tests whose `pair` marker excludes the active pair selection."""
    selected = set(_selected_pairs(config.getoption("--pair")))
    deselected: list[pytest.Item] = []
    remaining: list[pytest.Item] = []
    for item in items:
        marker = item.get_closest_marker("pair")
        if marker is None:
            remaining.append(item)
            continue
        applicable = set(marker.args)
        if applicable & selected:
            remaining.append(item)
        else:
            deselected.append(item)
    if deselected:
        config.hook.pytest_deselected(items=deselected)
        items[:] = remaining


@pytest.fixture(scope="session", autouse=True)
def _require_provider_keys() -> None:
    """Skip the whole suite if no provider key is available."""
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip(
            "tests/e2e/ requires OPENAI_API_KEY and/or GOOGLE_API_KEY in the env",
            allow_module_level=True,
        )


@pytest.fixture
def pair(request: pytest.FixtureRequest) -> PairId:
    """Return the PairId for the currently active pair selection."""
    selected = _selected_pairs(request.config.getoption("--pair"))
    assert len(selected) == 1, (
        f"the `pair` fixture requires a single active pair; got {selected}. "
        "Pass --pair=lg-openai (or set E2E_PAIR) to scope the run."
    )
    name = selected[0]
    spec = PAIR_TABLE[name]
    return {"name": name, **spec}  # type: ignore[return-value]


@pytest.fixture
def free_port() -> int:
    """Grab an OS-assigned free localhost port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


_CONFIGS_DIR = Path(__file__).parent / "fixtures" / "configs"


@pytest.fixture
def render_config(tmp_path: Path) -> Callable[..., Path]:
    """Return a callable that renders a Jinja2 YAML template into tmp_path."""
    env = Environment(
        loader=FileSystemLoader(_CONFIGS_DIR),
        undefined=StrictUndefined,
        keep_trailing_newline=True,
    )

    def _render(template_name: str, **vars_: object) -> Path:
        tmpl = env.get_template(template_name)
        out = tmp_path / "config.yaml"
        out.write_text(tmpl.render(**vars_))
        return out

    return _render


def _wait_for_health(base_url: str, *, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            r = httpx.get(f"{base_url}/health", timeout=2.0)
            if r.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise TimeoutError(f"standalone did not become healthy within {timeout}s")


_StandaloneCM = AbstractContextManager[str]


@pytest.fixture
def standalone_with_config(
    tmp_path: Path,
    free_port: int,
    pair: PairId,
) -> Callable[[Path], _StandaloneCM]:
    """Return a context-manager-ish callable that spawns standalone for a given config.

    Usage in a scenario test:

        config = render_config("lg_chat.yaml.j2", provider="openai", ...)
        with standalone_with_config(config) as base_url:
            ...

    Each scenario gets its own subprocess + tmp DB. The fixture handles
    SIGTERM (10s grace) → SIGKILL teardown and dumps captured stdout on
    non-zero exit so failures are debuggable from the pytest log.
    """

    @contextmanager
    def _ctx(config_path: Path) -> Generator[str, None, None]:
        gen = _spawn_idun(
            tmp_path=tmp_path,
            free_port=free_port,
            config_path=config_path,
            pair=pair,
        )
        base_url = next(gen)
        try:
            yield base_url
        finally:
            try:
                next(gen)
            except StopIteration:
                pass

    return _ctx


def _spawn_idun(
    *,
    tmp_path: Path,
    free_port: int,
    config_path: Path,
    pair: PairId,
) -> Generator[str, None, None]:
    """Spawn `idun init --no-browser`; yield base_url; teardown on close."""
    env = {
        **os.environ,
        "IDUN_CONFIG_PATH": str(config_path),
        "IDUN_PORT": str(free_port),
        "IDUN_HOST": "127.0.0.1",
        "DATABASE_URL": f"sqlite+aiosqlite:///{tmp_path}/idun.db",
        "IDUN_TELEMETRY_ENABLED": "false",
        "IDUN_ADMIN_AUTH_MODE": "none",
        "E2E_PAIR": pair["name"],
        "E2E_PROVIDER": pair["provider"],
        "E2E_MODEL": pair["model"],
    }
    proc = subprocess.Popen(
        [
            "uv",
            "run",
            "idun",
            "init",
            "--no-browser",
            "--port",
            str(free_port),
        ],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    captured: deque[str] = deque(maxlen=2000)

    def _drain() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            captured.append(line)

    drainer = threading.Thread(target=_drain, daemon=True)
    drainer.start()

    base_url = f"http://127.0.0.1:{free_port}"
    try:
        try:
            _wait_for_health(base_url, timeout=45.0)
        except TimeoutError:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            drainer.join(timeout=2)
            snapshot = list(captured)
            pytest.fail(
                f"standalone failed to boot for pair={pair['name']}\n"
                f"stdout:\n{''.join(snapshot)[-4000:]}"
            )
        yield base_url
    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        drainer.join(timeout=2)
        snapshot = list(captured)
        # `uv run` is the immediate child; on SIGTERM it forwards the signal
        # to the python child, waits, and exits with the shell convention
        # 128+signum=143. A python child killed directly would return -15.
        # Accept both so the check works regardless of process tree shape.
        if proc.returncode not in (0, -signal.SIGTERM, 128 + signal.SIGTERM):
            pytest.fail(
                f"standalone exited with rc={proc.returncode}\n"
                f"stdout:\n{''.join(snapshot)[-4000:]}"
            )
