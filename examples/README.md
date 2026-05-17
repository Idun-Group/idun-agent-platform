# Example Agents

These examples demonstrate the framework-agnostic interaction pattern introduced in issue #355.

## Running an example

```bash
cd examples/langgraph-chat
idun agent serve --source file --path config.yaml
```

## Discovering capabilities

```bash
curl http://localhost:8001/agent/capabilities | jq
```

## Interacting via /agent/run

```bash
curl -X POST http://localhost:8001/agent/run \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "threadId": "t1",
    "runId": "r1",
    "state": {},
    "messages": [{"id": "m1", "role": "user", "content": "Hello"}],
    "tools": [],
    "context": [],
    "forwardedProps": {}
  }'
```

## Examples

| Example | Framework | Input Mode | Output Mode | Port |
| --- | --- | --- | --- | --- |
| langgraph-chat | LangGraph | chat | text | 8001 |
| langgraph-structured | LangGraph | structured | structured | 8002 |
| adk-chat | ADK | chat | text | 8003 |
| adk-structured | ADK | structured | structured | 8004 |
| adk-skills | ADK | chat | text | 8005 |
