<div align="center">

<img alt="Idun Agent Platform" src="docs/images/readme/banner.png">

<p>
  <strong>English</strong> | <a href="docs/readme/README.fr.md">Français</a> | <a href="docs/readme/README.es.md">Español</a> | <a href="docs/readme/README.zh.md">中文</a> | <a href="docs/readme/README.ar.md">العربية</a>
</p>

<br/>

### Productionize LangGraph & ADK agents.

Self-hosted. Open source. No vendor lock-in.

<br/>

[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-purple.svg)](https://www.gnu.org/licenses/gpl-3.0.html)
[![CI](https://github.com/Idun-Group/idun-agent-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Idun-Group/idun-agent-platform/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/idun-agent-engine?color=purple)](https://pypi.org/project/idun-agent-engine/)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-purple?logo=discord&logoColor=white)](https://discord.gg/KCZ6nW2jQe)
[![Stars](https://img.shields.io/github/stars/Idun-Group/idun-agent-platform?style=social)](https://github.com/Idun-Group/idun-agent-platform)
[![Commits](https://img.shields.io/github/commit-activity/m/Idun-Group/idun-agent-platform?color=purple)](https://github.com/Idun-Group/idun-agent-platform)

<br/>

[Cloud](https://cloud.idunplatform.com) · [Try the demos](https://idun-group.com/demo) · [Quickstart](https://docs.idun-group.com/quickstart) · [Docs](https://docs.idun-group.com) · [Discord](https://discord.gg/KCZ6nW2jQe) · [Book a demo](https://calendar.app.google/RSzm7EM5VZY8xVnN9)

⭐ If you find this useful, please star the repo. It helps others discover the project.

</div>

<br/>

<p align="center">Idun Agent Platform is an open-source, self-hosted production wrapper for <b>LangGraph</b> and <b>Google ADK</b> agents. <code>pip install idun-agent-engine</code> and your agent runs as a FastAPI process with built-in chat UI, admin panel, traces, observability, guardrails, memory persistence, MCP tool governance, and prompt management.</p>

<p align="center">
  <img src="docs/images/readme/demo.webp" alt="Idun Agent Platform demo" width="100%"/>
</p>

> **Why Idun?** Teams building agents face a tradeoff: build the production wrapper yourself (FastAPI + traces + guardrails + admin UI — slow), or adopt a SaaS like LangGraph Cloud or LangSmith (sovereignty trade-off). Idun is the third path: pip install a self-sufficient FastAPI process that bundles your agent with chat UI, admin, traces, and guardrails — all open source, all on your infrastructure.

---

## Quick start

> **Prerequisites**: Python 3.12+ and pip.

```bash
pip install idun-agent-engine
idun init my-agent
cd my-agent && idun serve
```

Open [http://localhost:8000](http://localhost:8000). Chat with your agent, then explore the admin at [/admin](http://localhost:8000/admin) and traces at [/admin/traces](http://localhost:8000/admin/traces).

> **What `pip install idun-agent-engine` delivers**
>
> A single wheel that bundles three Python packages:
>
> - **`idun_agent_engine`** — the engine SDK (FastAPI app factory, MCP registry, observability, guardrails).
> - **`idun_agent_standalone`** — the `idun` CLI, the admin REST API, and the chat / admin / traces UIs.
> - **`idun_agent_schema`** — the Pydantic config schemas.
>
> The `idun` command on your `$PATH` (`setup`, `serve`, `init`, `hash-password`, `agent serve`) is provided by the bundled standalone — it is not a separately published package. You won't see `idun-agent-standalone` in the engine's declared PyPI dependencies because it ships co-installed inside the wheel, not as a transitive dep.
>
> See [docs.idun-group.com/architecture](https://docs.idun-group.com/architecture) for the full layering.

## What's inside

<table>
<tr>
<td width="50%" valign="top">

### Observability

Langfuse · Arize Phoenix · LangSmith · GCP Trace · GCP Logging

Trace every agent run. Connect multiple providers at the same time through config.

<img src="docs/images/readme/observability.png" alt="Observability" width="100%"/>

</td>
<td width="50%" valign="top">

### Guardrails

PII detection · Toxic language · Ban lists · Topic restriction · Bias checks · NSFW · 9 more

Apply policies per agent on input, output, or both. Powered by Guardrails AI.

<img src="docs/images/readme/guardrails.png" alt="Guardrails" width="100%"/>

</td>
</tr>
<tr>
<td width="50%" valign="top">

### MCP tool governance

Register MCP servers and control which tools each agent can access. Supports stdio, SSE, streamable HTTP, and WebSocket.

<img src="docs/images/readme/mcp.png" alt="MCP" width="100%"/>

</td>
<td width="50%" valign="top">

### Memory and persistence

PostgreSQL · SQLite · In-memory · Vertex AI · ADK Database

Conversations persist across restarts. Pick a backend per agent.

<img src="docs/images/readme/memory.png" alt="Memory" width="100%"/>

</td>
</tr>
<tr>
<td colspan="2" valign="top" align="center">

### Prompt management

Versioned templates with Jinja2 variables. Assign prompts to agents from the UI or API.

<img src="docs/images/readme/prompts.png" alt="Prompts" width="50%"/>

</td>
</tr>
</table>

> [!NOTE]
> **AG-UI streaming** — Every agent gets a standards-based streaming API, compatible with CopilotKit clients. Built-in chat playground for testing.

<p align="center">
  <img src="docs/images/readme/agent-detail.png" alt="Agent detail" width="100%"/>
</p>

---

## Architecture

Idun ships as one process: **`idun-agent-standalone`**. It bundles the engine SDK, a Next.js chat UI, an admin panel, and a traces viewer — your agent runs inside this process, configured from a YAML file and re-loaded live from the admin REST.

```mermaid
flowchart LR
  subgraph Idun["idun-agent-standalone (one process)"]
    direction TB
    UI["Chat UI / Admin / Traces"] --> ENG["Engine SDK"]
    ENG --> DB[(Postgres / SQLite)]
  end
  Users --> UI
  Admin --> UI
  ENG --> Agent["Your LangGraph / ADK agent"]
  Agent --> LLM["LLMs / MCP / tools"]
```

---

## Integrations

<p align="center">
  <img src="docs/images/logos/langgraph-color.png" alt="LangGraph" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/agent-development-kit.png" alt="ADK" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/langfuse-color.png" alt="Langfuse" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/mcp.png" alt="MCP" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/Postgresql_elephant.png" alt="PostgreSQL" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/phoenix.svg" alt="Phoenix" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/langsmith-color.png" alt="LangSmith" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/google-cloud.png" alt="Google Cloud" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/guardrails-ai.png" alt="Guardrails AI" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/langchain-color.png" alt="LangChain" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/A2A.png" alt="A2A" style="height:36px; margin:6px; vertical-align:middle;" />
  <img src="docs/images/logos/ag-ui.png" alt="AG-UI" style="height:36px; margin:6px; vertical-align:middle;" />
</p>

> [!NOTE]
> **Framework support** — LangGraph and Google ADK are first-class today, with full adapters in the engine. LangChain is supported via the LangGraph adapter; broader native LangChain compatibility is on the [roadmap](https://docs.idun-group.com/roadmap).

---

## Idun vs alternatives

| | **Idun Engine** | **LangGraph Cloud** | **LangSmith** | **DIY (FastAPI + glue)** |
|---|:---:|:---:|:---:|:---:|
| Self-hosted / on-prem | ✅ | ❌ | ❌ | ✅ |
| Multi-framework (LangGraph + ADK) | ✅ | LangGraph only | ❌ obs only | Manual |
| Guardrails (15+ built-in) | ✅ | ❌ | ❌ | Build yourself |
| MCP tool governance | ✅ per-agent | ❌ | ❌ | Build yourself |
| Observability (multi-provider) | ✅ Langfuse, Phoenix, LangSmith, GCP | ❌ LangSmith only | ✅ LangSmith only | Manual |
| Memory / checkpointing | ✅ Postgres, SQLite, in-memory | ✅ | ❌ | Build yourself |
| AG-UI / CopilotKit streaming | ✅ | ✅ | ❌ | Manual |
| Open source (GPLv3) | ✅ | ❌ | ❌ | — |

> [!NOTE]
> Idun is not a replacement for LangSmith (observability) or LangGraph Cloud (hosting). It is the layer between your agent code and production that handles governance, security, and operations, regardless of which observability or hosting you choose.

---

## Configuration

### Components in this install

After `pip install idun-agent-engine`, your `$PATH` and `site-packages` contain:

| Module | Distributed via | Purpose |
|---|---|---|
| `idun_agent_engine` | declared in `requires_dist` | FastAPI app factory, MCP registry, observability, guardrails wiring |
| `idun_agent_schema` | declared in `requires_dist` | Pydantic config models for `config.yaml` |
| `idun_agent_standalone` | **co-bundled in the engine wheel** | `idun` CLI, admin REST under `/admin/api/v1/`, chat / admin / traces UIs at `/`, `/admin/`, `/admin/traces/` |
| `idun` (console script) | `[project.scripts] idun = "idun_agent_standalone.cli:main"` | Subcommands: `setup`, `serve`, `init`, `hash-password`, `agent serve` |

The bundled-install model means **you do not need to `pip install idun-agent-standalone` separately** — it isn't published. To verify your install carries everything:

```bash
python -c "import idun_agent_engine, idun_agent_standalone, idun_agent_schema; print('all 3 modules importable')"
idun --help
```

Both checks are smoke-tested in the release pipeline before any wheel is published.

Heads up: both `pypi.org` and `test.pypi.org` JSON APIs report `entry_points: null` and omit `idun-agent-standalone` from `requires_dist`. This is a Warehouse rendering quirk — the wheel itself still wires the `idun` console script and bundles standalone. The smoke-test commands above are the canonical way to verify a healthy install.

### YAML reference

Every agent is configured through a single YAML file. Here is a complete example with all features enabled:

```yaml
server:
  api:
    port: 8001

agent:
  type: "LANGGRAPH"
  config:
    name: "Support Agent"
    graph_definition: "./agent.py:graph"
    checkpointer:
      type: "sqlite"
      db_url: "sqlite:///checkpoints.db"

observability:
  - provider: "LANGFUSE"
    enabled: true
    config:
      host: "https://cloud.langfuse.com"
      public_key: "${LANGFUSE_PUBLIC_KEY}"
      secret_key: "${LANGFUSE_SECRET_KEY}"

guardrails:
  input:
    - config_id: "DETECT_PII"
      on_fail: "reject"
      reject_message: "Request contains personal information."
  output:
    - config_id: "TOXIC_LANGUAGE"
      on_fail: "reject"

mcp_servers:
  - name: "time"
    transport: "stdio"
    command: "docker"
    args: ["run", "-i", "--rm", "mcp/time"]

prompts:
  - prompt_id: "system-prompt"
    version: 1
    content: "You are a support agent for {{ company_name }}."
    tags: ["latest"]
```

> [!TIP]
> Environment variables like `${LANGFUSE_SECRET_KEY}` are resolved at startup. You can use `.env` files or inject them through Docker/Kubernetes.

Serve the engine directly from a YAML file (no admin UI, just the agent endpoints):

```bash
idun agent serve --source file --path config.yaml
```

> [!IMPORTANT]
> Full config reference: [docs.idun-group.com/configuration](https://docs.idun-group.com/configuration)
>
> 9 runnable agent examples: [idun-agent-template](https://github.com/Idun-Group/idun-agent-template)

---

## Community

| | |
|---|---|
| **Questions and help** | [Discord](https://discord.gg/KCZ6nW2jQe) |
| **Feature requests** | [GitHub Discussions](https://github.com/Idun-Group/idun-agent-platform/discussions) |
| **Bug reports** | [GitHub Issues](https://github.com/Idun-Group/idun-agent-platform/issues) |
| **Contributing** | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| **Roadmap** | [ROADMAP.md](./ROADMAP.md) |

## Commercial support

Maintained by [Idun Group](https://idun-group.com). We help with platform architecture, deployment, and IdP/compliance integration. [Book a call](https://calendar.app.google/RSzm7EM5VZY8xVnN9) · contact@idun-group.com

## Telemetry

Minimal, anonymous usage metrics + masked session replay via PostHog. No message content, no PII beyond email after sign-in (set `IDUN_TELEMETRY_IDENTIFY_USERS=false` to disable). [View source](libs/idun_agent_engine/src/idun_agent_engine/telemetry/telemetry.py). Off: `IDUN_TELEMETRY_ENABLED=false`. Replay-only off: `IDUN_TELEMETRY_SESSION_REPLAY=false`.

## License

[GPLv3](./LICENSE)
