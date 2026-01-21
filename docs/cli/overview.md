# CLI Overview

The Idun CLI provides an interactive Terminal User Interface (TUI) for configuring, deploying, and testing AI agents without writing any code. It's the fastest way to get started with the Idun Agent Platform.

![CLI Main Menu](../images/tui-home.png)

## Why Use the CLI?

- **No Code Required**: Configure complex agent setups through an intuitive interface
- **Visual Feedback**: See your configuration in real-time with syntax highlighting
- **Integrated Testing**: Chat with your agent immediately after deployment
- **Live Logs**: Monitor server activity without leaving the terminal
- **All-in-One**: Agent configuration, deployment, testing, and monitoring in a single tool

## Installation

Install the Idun Agent Engine which includes the CLI:

```bash
pip install idun-agent-engine
```

## Quick Start

Launch the CLI with a single command:

```bash
idun init
```

This opens the interactive TUI where you can configure your agent through a step-by-step interface.

---

## CLI Walkthrough

### Main Menu

When you first launch `idun init`, you're greeted with the main menu:

![CLI Main Menu](../images/tui-home.png)

The main menu displays:
- **Configure a new Agent** button to start the setup process
- **Exit** To close the app.

!!! tip
    More features are comming soon. Stay tuned!


Click the button or press Enter to begin configuring your agent.

---

### Agent Information

The first step is to configure your agent's basic identity and framework.

![Agent Information](../images/tui-agent.png)

#### Identity Section

Configure the basic details:

- **Name**: Your agent's identifier (e.g., `my-agent`, `customer-support-bot`)
- **Framework**: Choose between LANGGRAPH, ADK, or HAYSTACK
- **Port**: Network port for the agent API (default: 8008)

#### Graph/Agent Definition

Select the Python file and variable that contains your agent implementation:

1. **Select Python File**: Browse your project directory using the file tree
2. **Select Variable**: Choose the variable that contains your agent/graph instance
3. **Agent Path**: View the complete path (e.g., `./agent.py:app`)

!!! tip "Variable Selection"
    The CLI automatically parses your Python file and lists all available variables. You must explicitly select a variable before proceeding.

!!! warning "Validation"
    Both the file path and variable name are required. The CLI will prevent you from proceeding if either is missing.

**Navigation**: Press **Next** to save and continue.

---

### Memory & Checkpointing

Configure how your agent persists conversation state and memory.

![Memory Configuration](../images/tui-mem.png)

Choose from three checkpoint types:

#### In-Memory (Default)
- Stores state in RAM
- Fastest performance
- State lost on restart
- Best for development and testing

```yaml
checkpointer:
  type: memory
```

#### SQLite
- Persists state to a local SQLite database
- Survives restarts
- Good for single-instance deployments

```yaml
checkpointer:
  type: sqlite
  db_path: ./checkpoints.db
```

#### PostgreSQL
- Production-grade persistence
- Supports distributed deployments
- Requires external database

```yaml
checkpointer:
  type: postgres
  connection_string: postgresql://user:pass@localhost:5432/db
```

!!! note "Framework Support"
    Memory configuration is only available for LangGraph agents. ADK and Haystack are coming soon.

**Navigation**: Press **Next** to save and continue, or **Back** to return.

---

### Observability

Configure observability providers to monitor and trace your agent's execution.

![Observability Configuration](../images/tui-obs.png)

Choose from multiple observability providers:

#### Off (Default)
No observability tracking enabled.

#### Langfuse
Open-source LLM observability platform.

- **Public Key**: Your Langfuse public key
- **Secret Key**: Your Langfuse secret key
- **Host**: Langfuse server URL (default: `https://cloud.langfuse.com`)

#### Arize Phoenix
ML observability and explainability platform.

- **Host**: Phoenix server endpoint: this is `localhost` by default
- **Port**: Phoenix server port

#### LangSmith
LangChain's official tracing platform.

- **API Key**: Your LangSmith API key
- **Project**: Project name for organizing traces

#### Google Cloud Platform (GCP)
- **GCP Trace**: Distributed tracing
- **GCP Logging**: Cloud logging integration
- **Project ID**: Your GCP project identifier

!!! tip "Starting Simple"
    Start with observability **Off** for development. Enable it when you need to debug or monitor production agents.

**Navigation**: Press **Next** to save and continue.

---

### Guardrails

Add safety guardrails to validate and filter agent inputs and outputs.

![Guardrails Configuration](../images/tui-guardrails.png)

#### Available Guardrails

Configure multiple guardrails to protect your agent:

- **Bias Check**: Detect biased language
- **Competition Check**: Flag competitor mentions
- **Correct Language**: Validate language requirements
- **Ban List**: Bans the use of specific words
- **Detect PII**: Detect Personal information.
- **Gibberish Detection**: Filter nonsensical input

Coming Soon:

- **NSFW Filter**: Block inappropriate content
- **Jailbreak Detection**: Prevent prompt injection attacks
- **Prompt Injection**: Additional injection protection
- **RAG Hallucination**: Detect hallucinations in RAG responses
- **Restrict to Topic**: Keep conversations on-topic
- **Toxic Language**: Filter toxic or harmful language
- **Code Scanner**: Scan and validate code snippets

#### Configuration

 Guardrails require:
- **API Key**: Your Guardrails AI API key
- **Reject Message**: Custom message shown when input is rejected
- **Additional Parameters**: Guardrail-specific settings (e.g., threshold, allowed topics)

!!! example "Example Configuration"
    ```yaml
    guardrails:
      - config_id: bias_check
        api_key: eyXXX # <- this is set for all guardrails when you populate the api key
        guard_url: hub://guardrails/bias_check # <- this is set implicitly
        reject_message: "Bias detected in your input"
        threshold: 0.7
    ```

**Navigation**: Press **Next** to save and continue.

---

### MCP Servers

Configure Model Context Protocol (MCP) servers to extend your agent's capabilities.

![MCP Configuration](../images/tui-mcp.png)

MCP servers provide tools and resources to your agent:

- **File System Access**: Read/write files
- **Database Queries**: Execute SQL queries
- **API Integrations**: Connect to external services
- **Custom Tools**: Add domain-specific functionality

#### Adding MCP Servers

1. **Server Name**: Identifier for the MCP server
2. **Command**: Executable command to start the server
3. **Arguments**: Command-line arguments (optional)
4. **Environment Variables**: Required environment configuration

!!! example "Example MCP Configuration"
    ```yaml
    mcp_servers:
      filesystem:
        command: npx
        args:
          - -y
          - "@modelcontextprotocol/server-filesystem"
          - /allowed/path
        env:
          ALLOWED_DIRECTORY: /allowed/path
    ```

**Navigation**: Press **Next** to save and continue.

---

### Validate & Run

Review your complete agent configuration and deploy it.

![Validate and Run](../images/tui-deploy.png)

#### Configuration Preview

The YAML configuration is displayed with:
- Syntax highlighting
- Line numbers
- All configured sections (agent, memory, observability, guardrails, MCP)

#### Deployment Options

Two buttons are available:

**Save and Exit**
- Saves configuration to `~/.idun/<agent-name>.yaml`
- Exits the CLI
- Requires server to be stopped first

**Save and Run**
- Saves configuration
- Starts the agent server
- Shows live server logs
- Changes to **Kill Server** when running

#### Server Logs

When the server is running, live logs are displayed:

```
Starting server for agent: my-agent
Config: /Users/user/.idun/my-agent.yaml
INFO: Started server process [12345]
INFO: Waiting for application startup.
INFO: Application startup complete.
INFO: Uvicorn running on http://0.0.0.0:8008
INFO: POST ...
```

!!! tip "Server Management"
    - **Kill Server** button stops the running server
    - You must stop the server before using **Save and Exit**
    - The server runs in the background while you navigate other sections

**Alternative Deployment**

You can also run the agent separately using:

```bash
idun agent serve --source=file --path=~/.idun/my-agent.yaml
```

---

### Chat Interface

Test your agent with an integrated chat interface.

![Chat Interface](../images/tui-chat.png)

#### Features

- **Real-time Chat**: Send messages and receive responses
- **Connection Status**: Automatic server health checks
- **Thinking Indicator**: Visual spinner while agent processes your message
- **Word Wrap**: Long responses automatically wrap to new lines
- **Error Handling**: Clear error messages for connection issues

#### Using the Chat

1. Ensure your agent server is running (start it in the **Validate & Run** section)
2. Navigate to the **Chat** section
3. Type your message in the input field
4. Press **Enter** or click **Send**
5. Watch the "Thinking..." indicator while the agent processes
6. View the agent's response

!!! warning "Server Required"
    The chat interface requires the agent server to be running. If you see connection errors, go back to **Validate & Run** and start the server.

#### Keyboard Shortcuts

- **Enter**: Send message
- **Tab**: Navigate between input and send button
- **Ctrl+Q**: Exit CLI (must stop server first)

---

## Navigation

### Keyboard Shortcuts

- **Tab**: Move between sections and inputs
- **Arrow Keys**: Navigate lists and options
- **Enter**: Select options or submit
- **Ctrl+Q**: Exit the CLI

### Section Navigation

The left sidebar shows all configuration sections:

1. **Agent Information** ✓
2. **Memory** ✓
3. **Observability** ✓
4. **Guardrails** ✓
5. **MCPs** ✓
6. **Validate & Run**
7. **Chat**

When sections are validated and saved, they become green.

### Buttons

- **Back**: Return to previous section
- **Next**: Validate, save, and move to next section

---

## Configuration Files

All configurations are saved to `~/.idun/<agent-name>.yaml`.

### File Structure

```yaml
server:
  api:
    port: 8008

agent:
  type: LANGGRAPH
  config:
    name: my-agent
    graph_definition: ./agent.py:app
    checkpointer:
      type: memory

observability:
  provider: OFF

guardrails: []

mcp_servers: []
```

### Reusing Configurations

Load existing configurations:

```bash
idun agent serve --source=file --path=~/.idun/my-agent.yaml
```

---

### API Access

Once deployed, your agent is available via REST API:

```bash
# Health check
curl http://localhost:8008/health

# Invoke agent
curl -X POST http://localhost:8008/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"session_id": "123", "query": "Hello"}'

# API documentation
open http://localhost:8008/docs
```

---

### Getting Help

- [📚 Documentation](https://idun-group.github.io/idun-agent-platform)
- [💬 Discord Community](https://discord.gg/KCZ6nW2jQe)
- [🐛 GitHub Issues](https://github.com/Idun-Group/idun-agent-platform/issues)

---


## Tips & Best Practices

!!! tip "Start Simple"
    Begin with minimal configuration (just agent info) and add features incrementally.

!!! tip "Use In-Memory for Development"
    In-Memory checkpointing is perfect for rapid iteration. Switch to PostgreSQL for production.

!!! tip "Test Before Deploying"
    Always test your agent using the chat interface before deploying to production.

!!! tip "Monitor in Production"
    Always enable observability (Langfuse/Phoenix/LangSmith) for production agents.
