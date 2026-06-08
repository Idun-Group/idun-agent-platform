"""Span sinks: where the trace writer's drained rows go.

Local (unenrolled) mode persists to the standalone DB; enrolled mode
POSTs to the manager's ``/collect`` endpoint.
"""

from typing import Any

import httpx

from ._serialize import encode_batch

# TODO: collapse the writer's inline local-insert path and HttpSink behind
# a single SpanSink protocol (LocalSqlSink + HttpSink) so the writer always
# delegates, instead of branching on an optional sink.


class HttpSink:
    """POST finalized span + trace rows to the manager's ``/collect``.

    Raises on a non-2xx response or a transport error.
    """

    def __init__(
        self, collect_url: str, api_key: str, *, client: httpx.AsyncClient
    ) -> None:
        self._url = collect_url
        self._api_key = api_key
        self._client = client

    async def write(
        self,
        span_rows: list[dict[str, Any]],
        trace_rows: list[dict[str, Any]],
    ) -> None:
        response = await self._client.post(
            self._url,
            json=encode_batch(span_rows, trace_rows),
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        response.raise_for_status()
