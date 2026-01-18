# ADK Agents with Idun
![ADK logo](../images/logo/agent-development-kit.png){ width="90" }

This guide shows how to connect an **ADK (Agent Development Kit)** agent to the **Idun Agent Platform** and run it as a managed, observable service.

It continues from the [Quickstart](../getting-started/quickstart.md) and assumes that:

- The platform is running via `docker compose -f docker-compose.dev.yml up --build`.
- You can access the Manager UI at `http://localhost:3000`.
- You are familiar with the basic ADK Python quickstart.

## 1. Create an Agent configuration in Idun

1. Open your browser at `http://localhost:3000` and press **Login** (no credentials needed for local dev).
2. Click **"Create an agent"**.

   ![Create agent](../images/screenshots/create-agent-page-adk.png)

3. Fill in the **basic info**:
   - **Name**: `My first agent`
   - **Base URL**: `http://localhost:8008` (where your ADK agent will be reachable)
   - **Server Port**: `8008` (local development port)
   - **Agent framework**: select **`ADK` (Agent Development Kit by Google)**
4. Click **Next**.
5. Fill in the **framework-specific settings**:
   - **Name**: `My first agent`
   - **Agent Definition Path**: `my_agent/agent.py:root_agent`
     (adjust to match your ADK project layout and entrypoint; for an existing project, point to your current root agent function)
   - **App Name**: `firstagent` (required by ADK)
   - For **session service** and **observability**, keep the default values for now.
     By default, agent memory is set to `AdkInMemory`.
6. Click **Next**.
7. For now, skip **MCP Server** and **Guardrails**; these are covered in their own guides.
8. Click **Create Agent**.

   ![Create agent](../images/screenshots/create-agent-page-2-adk.png)

!!! success "Congratulations"
    Your ADK agent configuration is created in the Idun Agent Manager.

## 2. Get the Agent API Key

1. In the Agent Dashboard, click on your newly created agent.
2. Go to the **API Integration** tab.
3. Click **Show Key** and copy the **Agent API Key**.

   ![Get agent api key](../images/screenshots/getting-started-get-api-key.png)

You will use this key to let your ADK agent fetch its configuration from the Idun Agent Manager.

## 3. Connect your ADK agent project

Now that the Idun Agent Platform is ready, you can connect either an **existing** ADK project or create a **new** one.

- **If you already have an ADK agent project**:
  Keep your current project structure. Make sure the **Agent Definition Path** you configured in Idun points to your existing root agent function. Then follow **Step 3** (configure Idun access) and **Step 4** (run the agent) below from within your existing project.
- **If you don’t have an ADK agent yet**:
  Follow **Step 1** and **Step 2** below to create a new ADK project, then continue with **Step 3** and **Step 4** to connect it to Idun.

### Step 1: Create the project directory (for new projects)

```bash
mkdir demo-adk-idun-agent
cd demo-adk-idun-agent
```

### Step 2: Initialize the ADK agent (for new projects)

1. In your editor, create and activate a **Python 3.12** virtual environment.
2. Follow the official ADK Python quickstart to generate a basic agent:

   [Python Quickstart for ADK](https://google.github.io/adk-docs/get-started/python/#next-build-your-agent){:target="_blank"}

!!! tip
    If you are using Vertex AI models:

    - Authenticate your gcloud account:
      ```bash
      gcloud auth application-default login
      ```
    - Use `gemini-2.5-flash` unless you have enabled Gemini 3 preview and are using the correct region:
      ```bash
      gemini-2.5-flash
      ```
    - When running `adk web`, use a different port than Idun (which uses 8000 internally):
      ```bash
      adk web --port 8010
      ```
    - ADK does not support folder paths that contain spaces.

### Step 3: Configure Idun platform access (for existing or new projects)

Install the Idun Agent Engine package in your ADK project (existing or new):

```bash
pip install idun-agent-engine
```

Create an `.env` file for your agent and add the following variables (adjust host if your Manager is not on localhost):

```bash
IDUN_MANAGER_HOST=http://localhost:8000
IDUN_AGENT_API_KEY=<PASTE_THE_AGENT_KEY_FROM_STEP_2>
```

Make sure you create this `.env` file **inside your ADK project folder** and that any helper scripts you use load it from the correct path.

### Step 4: Run your ADK agent with Idun (for existing or new projects)

Export the environment variables from your `.env` file in your terminal:

```bash
set -o allexport
source ./my_agent/.env
set +o allexport
```

Then start the Idun Agent Engine in **managed mode** so it pulls configuration from the Manager:

```bash
idun agent serve --source manager
```

!!! success "Congratulations"
    Your ADK agent is now running behind the Idun Agent Engine and managed by the Idun Agent Platform.

## 4. Test your agent

1. In the Manager UI, go to your agent’s **API Integration** tab.
2. Use the built-in chat or your own client to send a request.

Try a simple question like:

```bash
What time is it in Paris ?
```

   ![Chat with agent](../images/screenshots/chat-with-agent.png)

!!! success "Congratulations"
    You’ve successfully connected an ADK agent to Idun.

## Next Steps

From here you can enrich your ADK agent with more platform capabilities:

- [Observability](../observability/overview.md) – Monitor your agent’s performance and traces.
- [Memory](../memory/overview.md) – Add conversation and state persistence.
- [MCP](../mcp/overview.md) – Attach MCP tools to your agent.
- [Guardrails](../guardrails/overview.md) – Protect your agents with safety and policy checks.
- [A2A](../a2a/overview.md) – Enable agent-to-agent collaboration.
