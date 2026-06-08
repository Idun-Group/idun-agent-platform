"""Unit tests for the telemetry span sinks."""

import json

import httpx
import pytest
from idun_agent_standalone.infrastructure.traces.sinks import HttpSink

pytestmark = pytest.mark.asyncio

URL = "https://mgr.test/api/v1/telemetry/collect"
SPAN = {"otel_span_id": b"\x01\x02", "name": "chat", "kind": "LLM"}
TRACE = {"otel_trace_id": b"\x11\x12", "name": "chat"}


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_http_sink_posts_encoded_batch_with_bearer_auth():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(202)

    client = _client(handler)
    sink = HttpSink(URL, "key-123", client=client)
    await sink.write([SPAN], [])
    await client.aclose()

    assert captured["url"] == URL
    assert captured["auth"] == "Bearer key-123"
    assert captured["body"]["version"] == 1
    assert captured["body"]["spans"][0]["otel_span_id"] == "0102"
    assert captured["body"]["traces"] == []


async def test_http_sink_encodes_both_spans_and_traces():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(202)

    client = _client(handler)
    sink = HttpSink(URL, "k", client=client)
    await sink.write([SPAN], [TRACE])
    await client.aclose()

    assert captured["body"]["spans"][0]["otel_span_id"] == "0102"
    assert captured["body"]["traces"][0]["otel_trace_id"] == "1112"


async def test_http_sink_raises_on_error_status():
    client = _client(lambda request: httpx.Response(401))
    sink = HttpSink(URL, "bad-key", client=client)

    with pytest.raises(httpx.HTTPStatusError):
        await sink.write([SPAN], [])
    await client.aclose()


async def test_http_sink_propagates_transport_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    client = _client(handler)
    sink = HttpSink(URL, "k", client=client)

    with pytest.raises(httpx.ConnectError):
        await sink.write([SPAN], [])
    await client.aclose()
