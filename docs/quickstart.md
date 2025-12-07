# Getting Started

This guide will walk you through setting up the Idun Agent Platform and deploying your first agent.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Python 3.12+** - Required for running the agent platform [Install python](https://www.python.org/downloads/){:target="_blank"}
- **Docker** and **Docker Compose** - Required for running the platform containers. [Steps to install docker](https://docs.docker.com/get-started){:target="_blank"}.
- **Git** - For cloning the repository
- **uv** - For python package management. [Steps to install uv](https://docs.astral.sh/uv/getting-started/installation/){:target="_blank"}

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

## 3. Create an Agent configuration

![Create agent](images/screenshots/create-agent.png)

Navigate to `http://localhost:3000`, press login (without specifying credentials).

- Click on "Create an agent"
- Name: Specify your agent's name, set it to `My first agent`.
- Base url: Add the url your agents will be accessed from.
  - For local development, set it to `http://localhost:8008`.
- Server Port: For local development, set it to `8008`.
- Agent framwork: Select `ADK` (Agent development kit by Google).
- Click `Next`.
- Name: Specify your agent's name, set it to `My first agent`.
- Agent Definition Path: Specify where your agent code will be located, set it to `my_agent/agent.py:root_agent`
- App Name: ADK require a app name so set it to `firstagent`
- Skip `session service` and `observablity`. This will be addressed later (By default agent memory is set to `InMemory`).
- Click `Next`.
- Skip `MCP Server` and `Guardrails`. This will be addressed later.
- Click `Create Agent`.

![Create agent](images/screenshots/create-agent-2.png)

!!! Congratulation
    Your agent's configuration is created

## 4. Get the Agent API Key

In the Agent Dashboard, click on your agent, then `API Integration`, and press `Show Key`. Copy your agent's KEY. We will use it in the next step

![Get agent api key](images/screenshots/getting-started-get-api-key.png)

## 5. Create your Agent

In a separate folder create an ADK agent.

### Step 1: Create the Project Directory

```bash
mkdir demo-adk-idun-agent
cd demo-adk-idun-agent
```

### Step 2: Init ADK agent

In your code editor setup a Python 3.12 environment.

Follow the ADK Agent python getting started tutorial:
[Python Quickstart for ADK](https://google.github.io/adk-docs/get-started/python/#next-build-your-agent){:target="_blank"}

!!! Tips
    If you using Vertex AI model don't forget to authentificate your gcloud account:
    ```bash
    gcloud auth application-default login
    ```
    When running adk web use a different port because port 8000 is used by the platform
    ```bash
    adk web --port 8010
    ```

### Step 3: Setup idun platform access

Install idun-agent-engine package:

```bash
pip install idun-agent-engine
```

Copy the following key in your agent .env file.

```bash
IDUN_MANAGER_HOST=http://localhost:8000
IDUN_AGENT_API_KEY=<COPY THE AGENT IDUN KEY FROM PREVIOUS STEP 4>
```

or export them in your terminal

```bash
export IDUN_MANAGER_HOST=http://localhost:8000
export IDUN_AGENT_API_KEY=<COPY THE AGENT IDUN KEY FROM PREVIOUS STEP 4>
```

### Step 4: Run your agent

Export the env variable from the .env in your terminal

```bash
set -o allexport
source ./my_agent/.env
set +o allexport
```

Run the agent with the following command

```bash
idun agent serve --source manager
```

!!! Congratulation
    Your ADK agent is up and running with idun agent platform !

## 6. Test your agent

Navigate to the API Info tab of your agent in the manager UI to communicate with your agent.

Test the following question:

```bash
What time is it in Paris ?
```

![Get agent api key](images/screenshots/chat-with-agent.png)

!!! Congratulation
    You're all done !

**Next →** [Add Observability](guides/02-observability-checkpointing.md)

## Next Steps

- [Observability & Checkpointing](guides/02-observability-checkpointing.md) - Monitor your agent's performance and add checkpointing
- [Concepts](concepts/overview.md) - Understand the platform architecture
- [Guides](guides/01-basic-configuration.md) - Detailed walkthroughs
- [CLI](guides/03-cli-setup.md) - Advanced workflows
