from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RunContext:
    thread_id: str
    run_id: str


RunEventObserver = Callable[[Any, RunContext], Awaitable[None]]


class RunEventObserverRegistry:
    def __init__(self) -> None:
        self._observers: list[RunEventObserver] = []

    def register(self, observer: RunEventObserver) -> None:
        self._observers.append(observer)

    def clear(self) -> None:
        self._observers.clear()

    async def dispatch(self, event: Any, context: RunContext) -> None:
        for obs in self._observers:
            try:
                await obs(event, context)
            except Exception:
                logger.exception("run-event observer failed")
