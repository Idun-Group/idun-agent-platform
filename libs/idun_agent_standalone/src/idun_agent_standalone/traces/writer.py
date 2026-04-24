"""Async batched writer that buffers events and flushes to a sink.

The writer trades some durability (events held in memory until flush) for
SSE throughput: each ``await dispatch`` enqueues but does not wait for
DB IO. Two flush triggers — batch size and max latency — cap end-to-end
event-to-DB delay to ``max_latency_ms``.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class TraceSink(Protocol):
    async def flush(self, items: list[dict[str, Any]]) -> None: ...


class BatchedTraceWriter:
    def __init__(
        self,
        *,
        sink: TraceSink,
        batch_size: int = 25,
        max_latency_ms: int = 250,
    ) -> None:
        self._sink = sink
        self._batch_size = batch_size
        self._max_latency = max_latency_ms / 1000.0
        self._queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def enqueue(self, item: dict[str, Any]) -> None:
        await self._queue.put(item)

    async def drain(self) -> None:
        await self._queue.put(None)
        if self._task:
            await self._task

    async def _run(self) -> None:
        buffer: list[dict[str, Any]] = []
        while True:
            try:
                item = await asyncio.wait_for(
                    self._queue.get(), timeout=self._max_latency
                )
            except TimeoutError:
                if buffer:
                    await self._flush(buffer)
                    buffer = []
                continue
            if item is None:
                if buffer:
                    await self._flush(buffer)
                return
            buffer.append(item)
            if len(buffer) >= self._batch_size:
                await self._flush(buffer)
                buffer = []

    async def _flush(self, items: list[dict[str, Any]]) -> None:
        try:
            await self._sink.flush(items)
        except Exception:  # noqa: BLE001 — never break the SSE stream over a flush failure
            logger.exception("trace flush failed")
