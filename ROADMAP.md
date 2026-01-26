## Roadmap

High-level roadmap (no fixed dates). Items are grouped by **status** and **priority**.

### 💬 Help shape the roadmap

Have an idea, integration request, or feedback on priorities? Please start a thread in **[GitHub Discussions](https://github.com/Idun-Group/idun-agent-platform/discussions)** — we use it to collect proposals, discuss trade-offs, and shape upcoming roadmap items with the community.

### ✅ Done / shipped

- **Agent frameworks**: LangGraph, ADK, Haystack compatibility foundation (ongoing maintenance)
- **API (built-in)**: Simple Invoke + Batch Invoke
- **API (AG-UI / CopilotKit)**: initial event streaming + front interaction support
- **Observability foundation**: OpenTelemetry, Langfuse, LangSmith, Phoenix, GCP Trace/Logging (baseline integrations)
- **MCP**: foundation + custom integrations (baseline)
- **Agent Manager**: unified API to govern agents
- **Guardrails**: Guardrails AI integration (baseline)
- **A2A**: foundation support

### 🔥 Priority / now

- **Templates d’agent**: standard agent templates (create + validate)
- **Manager access control (RBAC)**: OKTA-based role access
- **Manager SSO**: OKTA / Auth0 (and similar)
- **Idun CLI (standalone agent)**: generate/run configs without the full platform
- **Agent SSO**: SSO for agent access paths
- **Deployment foundation**: hardening self-hosting + runtime deployment workflow
- **MCP foundation (scale)**: broaden coverage + operationalize MCP tool governance

### 🗺️ Next (planned)

- **Deployment**: GCP (Terraform)
- **Deployment**: Kubernetes (Helm)
- **Agent gateway**: gateway for A2A and external flows
- **A2A full support**: expanded A2A protocol coverage
- **Tools library**: shared external tools library for agents
- **Secrets library**: secure secrets management library
- **Guardrails**: custom LLM guardrails

### 🔭 Future (later in the roadmap)

- **LLM Gateway (foundation)** + **LiteLLM**
- **Manager dashboarding & logs**
- **Manager FinOps**: costs + budgets
- **MCP Hub**: official MCP registry integration
- **Guardrails**: Nvidia NeMo

### 🧪 To be defined / exploration

The following items are intentionally marked as exploratory:

- **UI templates** (deployable UI per agent)
- **Vector DB ingestion pipeline**
- **Multimodal compatibility** (image-to-text, speech-to-speech, …)
- **API: A2UI**
- **Evaluation pipeline** (hallucination, accuracy, …)
- **More agent frameworks**: LlamaIndex, AutoGen, CrewAI, OpenAI
- **More observability**: Datadog
- **More guardrails**: LLM Guard, Lakera, Prompt Armor
- **More deployments**: Azure/AWS/OVH (Terraform), OVH/Scaleway PaaS hosting
- **More LLM gateways**: OpenRouter, vLLM, Ray Serve
- **More MCP hubs**: Composio/Rube, Pipedream, Portkey, PulseMCP
