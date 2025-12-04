# Getting Started

This guide will walk you through setting up the Idun Agent Platform and deploying your first agent.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Python 3.12+** - Required for running the agent platform
- **Docker** and **Docker Compose** - Required for running the platform containers. [Steps to install docker](https://docs.docker.com/get-started).
- **Git** - For cloning the repository
- **uv** - For python package management. [Steps to install uv](https://docs.astral.sh/uv/getting-started/installation/)

## 1. Clone the Repository

```bash
git clone https://github.com/Idun-Group/idun-agent-platform.git
cd idun-agent-platform
```

## 2. Start the Platform

!!! tip
    Make sure you start the docker daemon before running the container

Launch the Docker containers:

```bash
docker compose -f docker-compose.dev.yml up --build
```

The manager UI will be available at `http://localhost:3000`

## 3. Create an Agent

![Create Image](images/create.png)

Navigate to `http://localhost:3000`, press login (without specifying credentials) and create a new agent through the web interface. When creating your agent:

- Specify your agent's info
- Use an unused port in the base URL and ensure the same port is configured in the runtime settings. You can choose any available port except for `8000` (used by the manager) and `8001` used by copilot-kit.
- Press Next
- Specify the correct path to your agent's entrypoint in the graph definition field (e.g., for a LangGraph CompiledGraph, use `./agent.py:graph`)
- Optional: Add your checkpointing (ADK or Langgraph) and your observability platform of your choice, and fill out each required field.
- Skip the guardrails and MCP section for now, and press Next.

!!! note
    For guardrails you can only choose from: Ban List (to block specific words/phrases) or PII Detector (to detect sensitive information).
    More guardrails will be supported soon.
    This requires setting the GUARDRAILS_API_KEY env var

You can use this example agent as a reference: [https://github.com/Idun-Group/demo-adk-idun-agent](https://github.com/Idun-Group/demo-adk-idun-agent)

## 4. Get the Agent API Key

In the Agent Dashboard, click on your agent, then API Integration, and press Show Key. Copy your agent's KEY. We will use it in the next step

## 5. Launch the Agent Server

Open a new terminal and set up the environment:

```bash
uv sync
```

Activate the virtual environment:

=== "Mac/Linux"
    ```bash
    source .venv/bin/activate
    ```

=== "Windows (PowerShell)"
    ```powershell
    .venv\Scripts\Activate.ps1
    ```

Start the agent server with your API key:

!!! note
    Before running the command below, make sure the agent source path that you defined when creating your agent, matches the path you're running the command from. For example: if your entrypoint is this: `agents/agent.py:graph`, your current working directory needs to be `agents`

=== "Mac/Linux"
    ```bash
    IDUN_MANAGER_HOST="http://localhost:8000" IDUN_AGENT_API_KEY=<YOUR-API_KEY> idun agent serve --source=manager
    ```

=== "Windows (PowerShell)"
    ```powershell
    $env:IDUN_MANAGER_HOST="http://localhost:8000"; $env:IDUN_AGENT_API_KEY="<YOUR-API_KEY>"; idun agent serve --source=manager
    ```

## 6. Interact with Your Agent

![Chat with agent](images/chat.png)

Navigate to the API Info tab of your agent in the manager UI to communicate with your agent.

!!! tip
    See the [full documentation](https://idun-group.github.io/idun-agent-platform/) for detailed guides and examples.

## Next Steps

- Explore the [Concepts](concepts/overview.md) section to understand the platform architecture
- Check out the [Guides](guides/01-basic-configuration.md) for detailed walkthroughs
- Read about [Observability & Checkpointing](guides/02-observability-checkpointing.md) to enhance your agents
- Learn how to use the [CLI](guides/03-cli-setup.md) for advanced workflows
