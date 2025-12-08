# Getting Started

This guide will walk you through setting up the Idun Agent Platform and deploying your first agent.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Python 3.12** - Required for running the agent platform [Install Python](https://www.python.org/downloads/){:target="_blank"}
- **Docker** and **Docker Compose** - Required for running the platform containers. [Steps to install Docker](https://docs.docker.com/get-started){:target="_blank"}.
- **Git** - For cloning the repository
- **uv** - For Python package management. [Steps to install uv](https://docs.astral.sh/uv/getting-started/installation/){:target="_blank"}

## 1. Clone the Repository

```bash
git clone https://github.com/Idun-Group/idun-agent-platform.git
cd idun-agent-platform
```

## 2. Copy env file

```bash
cp .env.example .env
```

## 3. Start the Platform

!!! tip
    Make sure you start the Docker daemon before running the container

Launch the Docker containers:

```bash
docker compose -f docker-compose.dev.yml up --build
```

The manager UI will be available at `http://localhost:3000`

## 4. Create an Agent configuration

Navigate to `http://localhost:3000`, press login (without specifying credentials).

![Create agent](../images/screenshots/create-agent-page.png)

- Click on "Create an agent"
- Name: Specify your agent's name, set it to `My first agent`.
- Base url: Add the URL your agents will be accessed from, set it to `http://localhost:8008`.
- Server Port: For local development, set it to `8008`.
- Agent framework: Select `ADK` (Agent development kit by Google).
- Click `Next`.
- Name: Specify your agent's name, set it to `My first agent`.
- Agent Definition Path: Specify where your agent code will be located, set it to `my_agent/agent.py:root_agent`
- App Name: ADK requires an app name so set it to `firstagent`
- For `session service` and `observability` keep default value. This will be addressed later (By default agent memory is set to `AdkInMemory`).
- Click `Next`.
- Skip `MCP Server` and `Guardrails`. This will be addressed later.
- Click `Create Agent`.

![Create agent](../images/screenshots/create-agent-page-2.png)

!!! success "Congratulations"
    Your agent's configuration is created

## 5. Get the Agent API Key

In the Agent Dashboard, click on your agent, then `API Integration`, and press `Show Key`. Copy your agent's KEY. We will use it in the next step

![Get agent api key](../images/screenshots/getting-started-get-api-key.png)

## 6. Create your Agent

Now the idun agent platform is ready. You can start developing agents and connect them to the platform.
Start a new agent project with your favorite code editor in a separate folder like you're starting a new agent project.
In this example we will start with a simple ADK agent.

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
    If you are using Vertex AI model don't forget to authenticate your gcloud account:
    ```bash
    gcloud auth application-default login
    ```
    Keep using gemini 2.5 instead of gemini 3 pro preview if you didn't activate gemini preview or if you don't use us-central1 as location
    ```bash
    gemini-2.5-flash
    ```
    When running ADK web use a different port because port 8000 is used by the platform
    ```bash
    adk web --port 8010
    ```
    ADK does not support folder paths that contain spaces.

### Step 3: Setup Idun platform access

Install idun-agent-engine package:

```bash
pip install idun-agent-engine
```

Copy the following key in your agent .env file.

```bash
IDUN_MANAGER_HOST=http://localhost:8000
IDUN_AGENT_API_KEY=<COPY THE AGENT IDUN KEY FROM PREVIOUS STEP 5>
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

!!! success "Congratulations"
    Your ADK agent is up and running with Idun agent platform !

## 7. Test your agent

Navigate to the API Integration tab of your agent in the manager UI to communicate with your agent.

Test the following question:

```bash
What time is it in Paris ?
```

![Get agent api key](../images/screenshots/chat-with-agent.png)

!!! success "Congratulations"
    You're all done !

**Next →** [Add Observability](../observability/setup-guide.md)

## Next Steps

- [Observability & Checkpointing](../observability/setup-guide.md) - Monitor your agent's performance and add checkpointing
- [Concepts](../concepts/overview.md) - Understand the platform architecture
- [Guides](../guides/basic-configuration.md) - Detailed walkthroughs
- [CLI](../guides/cli-setup.md) - Advanced workflows
