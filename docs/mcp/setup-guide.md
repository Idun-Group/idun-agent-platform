# MCP Setup

This guide demonstrates how to integrate Model Context Protocol (MCP) servers with your agents using the Idun platform's web interface. We'll use the Fetch MCP server from Model Context Protocol with an ADK agent.

---

## Overview

MCP (Model Context Protocol) extends agent capabilities by providing external tools through a standardized interface. The Fetch MCP server allows your agent to retrieve and process web content, enabling capabilities like:

- Fetching content from URLs
- Processing web pages
- Extracting information from websites
- Summarizing web content

!!! info "What You'll Learn"
    By the end of this guide, you'll have a fully functional ADK agent with web fetching capabilities, able to retrieve and analyze content from any URL through a simple chat interface.

---

## Prerequisites

!!! warning "Before You Begin"
    Ensure all prerequisites are met before proceeding with the setup.

### Docker Desktop

Download and install from [docker.com](https://www.docker.com/products/docker-desktop/)

```bash
docker --version
```

### Fetch MCP Image

Pull the official Fetch MCP server image:

```bash
docker pull mcp/fetch
```

!!! success "Image Ready"
    Once pulled, the image will be available in Docker Desktop's Images section.

### Google Vertex AI Credentials

The ADK agent requires Google Cloud credentials. Choose one authentication method:

=== "Service Account Key"

    ```bash
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
    ```

=== "Application Default Credentials"

    ```bash
    gcloud auth application-default login
    ```

### Idun Platform

Install the Idun Agent Engine:

```bash
pip install idun-agent-engine
```

!!! note "Manager Service"
    Ensure the Manager service is running and accessible at `http://localhost:8080` (or your configured URL).

---

## Step 1: Clone the Demo ADK Agent

Clone the demo ADK agent repository from GitHub:

```bash
git clone https://github.com/Idun-Group/demo-adk-idun-agent.git
cd demo-adk-idun-agent
```

!!! tip "Repository Contents"
    This repository contains a fully configured ADK agent that we'll enhance with MCP capabilities.

---

## Step 2: Configure Docker Desktop

Open Docker Desktop and verify the following:

1. Docker Desktop is running
2. The `mcp/fetch` image appears in the **Images** section
3. MCP extension is enabled (if available)

!!! success "Docker Ready"
    With Docker Desktop running and the image available, you're ready to configure the MCP server.

---

## Step 3: Configure MCP in Manager UI

Access the Idun Manager web interface at `http://localhost:8080`

### Create Your Agent

Navigate to **Agents** → **Create Agent**

Fill in the agent configuration:

| Setting | Value |
|---------|-------|
| **Agent Name** | `ADK Agent with Fetch MCP` |
| **Agent Type** | `ADK` |
| **Session Service** | `in_memory` |
| **Memory Service** | `in_memory` |
| **Agent Code Path** | `./agent.py:agent` |

### Add MCP Server

Scroll to the **MCP Servers** section and click **Add MCP Server**

Configure the Fetch MCP server:

| Field | Value | Description |
|-------|-------|-------------|
| **Name** | `fetch` | Identifier for this MCP server |
| **Transport** | `stdio` | Communication via standard I/O |
| **Command** | `docker` | Docker CLI command |
| **Args** | `["run", "-i", "--rm", "mcp/fetch"]` | Docker run arguments as JSON array |

!!! tip "Args Format"
    The Args field must be a valid JSON array. Copy the entire value including brackets:

    ```json
    ["run", "-i", "--rm", "mcp/fetch"]
    ```

!!! info "What These Args Do"
    - `run` - Execute a new container
    - `-i` - Interactive mode (keeps STDIN open for communication)
    - `--rm` - Automatically remove container when it stops
    - `mcp/fetch` - The Docker image to run

### Save Your Configuration

![MCP Configuration Form](../images/mcp_input.png)

*The MCP configuration form showing stdio transport, docker command, and args as a JSON array*

Click **Save** to create the agent with MCP integration.

!!! success "Configuration Saved"
    Your agent is now configured with the Fetch MCP server and ready to launch.

---

## Step 4: Verify Credentials

Before launching, verify your Google Cloud credentials:

```bash
# Check credentials path
echo $GOOGLE_APPLICATION_CREDENTIALS

# Test credentials
gcloud auth application-default print-access-token
```

!!! warning "Credentials Required"
    The ADK agent cannot initialize without valid Google Cloud credentials. Ensure this step succeeds before proceeding.

If credentials aren't configured:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account-key.json"
```

---

## Step 5: Launch Your Agent

Navigate to the agent directory and start the engine:

```bash
cd demo-adk-idun-agent
export IDUN_MANAGER_HOST="http://localhost:8080"
export IDUN_AGENT_API_KEY="YOUR_AGENT_API_KEY"

idun agent serve --source manager
```

### Initialization Process

The engine will perform the following steps:

1. **Load Configuration** - Fetch agent config from Manager API
2. **Initialize ADK Agent** - Set up session and memory services
3. **Start MCP Server** - Launch Fetch MCP as Docker container
4. **Register Tools** - Make fetch tool available to agent
5. **Start API Server** - Serve at `http://localhost:8000`

!!! success "Agent Running"
    When you see "Uvicorn running on http://localhost:8000", your agent is ready to accept requests.

---

## Step 6: Test MCP Integration

### Access API Integration

In the Manager UI:

1. Navigate to your agent in the **Agents** list
2. Click on the **API Integration** tab
3. You'll see a chat interface

!!! tip "Interactive Testing"
    The API Integration page provides a real-time chat interface for testing your agent without writing any code.

### Test Queries

Try these example queries in the chat interface:

!!! example "Example 1: Company Information"
    ```
    Give me the information on this website: https://www.idun-group.com/idun-agent-platform
    ```

!!! example "Example 2: News Summary"
    ```
    Go to https://news.ycombinator.com and summarize the top 3 stories
    ```

!!! example "Example 3: Trending Repositories"
    ```
    Fetch https://github.com/trending and list the trending repositories
    ```

### How It Works

When you send a query:

1. Agent receives your message
2. Recognizes it needs web content
3. Invokes the Fetch MCP tool
4. Docker container retrieves URL content
5. Agent processes and responds with analyzed information

![MCP Test Result](../images/adk_mcp.png)

*The chat interface showing successful use of the Fetch MCP tool to retrieve and analyze web content*

!!! success "MCP Working"
    If the agent successfully fetches and analyzes web content, your MCP integration is working correctly.

---

## Verify MCP Server

### Check Docker Container

View running MCP containers:

```bash
docker ps | grep mcp/fetch
```

### View Logs

Check MCP server logs for debugging:

```bash
docker logs $(docker ps -q --filter ancestor=mcp/fetch)
```

!!! tip "Troubleshooting"
    If the agent isn't using the fetch tool, check these logs first for connection or execution errors.

---

## Advanced Configuration

### Multiple MCP Servers

Enhance your agent with additional MCP servers by adding more configurations in the Manager UI.

#### Filesystem Access

| Field | Value |
|-------|-------|
| **Name** | `filesystem` |
| **Transport** | `stdio` |
| **Command** | `npx` |
| **Args** | `["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]` |

!!! info "Use Case"
    Allows the agent to read, write, and manipulate files within specified directories.

#### Custom MCP Server

| Field | Value |
|-------|-------|
| **Name** | `custom` |
| **Transport** | `stdio` |
| **Command** | `docker` |
| **Args** | `["run", "-i", "--rm", "your-registry/your-mcp:latest"]` |

!!! info "Use Case"
    Deploy your own custom MCP servers for specialized functionality like database access, API integrations, or internal tools.

---

## Troubleshooting

### Docker Issues

!!! failure "MCP Server Fails to Connect"

    **Symptoms:** Agent starts but MCP tools aren't available

    **Solutions:**

    - Verify Docker Desktop is running: `docker info`
    - Check image exists: `docker images | grep mcp/fetch`
    - Test container manually: `docker run -i --rm mcp/fetch`
    - Review Docker Desktop logs

### Authentication Issues

!!! failure "Vertex AI Authentication Failed"

    **Symptoms:** Agent fails to initialize with authentication errors

    **Solutions:**

    - Verify credentials: `echo $GOOGLE_APPLICATION_CREDENTIALS`
    - Test credentials: `gcloud auth application-default print-access-token`
    - Re-authenticate: `gcloud auth application-default login`
    - Ensure service account has required permissions

### MCP Tool Not Working

!!! failure "Agent Doesn't Use Fetch Tool"

    **Symptoms:** Agent responds but doesn't fetch web content

    **Solutions:**

    - Check Docker container is running: `docker ps | grep mcp/fetch`
    - Review MCP server logs: `docker logs <container_id>`
    - Try explicit query: "Use the fetch tool to get https://example.com"
    - Restart the agent
    - Verify MCP config saved correctly in Manager UI

### Configuration Errors

!!! failure "Args Format Invalid"

    **Symptoms:** "Invalid args format" error when saving

    **Solution:** Ensure args is a properly formatted JSON array

    ✅ **Correct:**
    ```json
    ["run", "-i", "--rm", "mcp/fetch"]
    ```

    ❌ **Incorrect:**
    ```
    run -i --rm mcp/fetch
    ```

    ❌ **Incorrect:**
    ```
    ["run -i --rm mcp/fetch"]
    ```

---

## Best Practices

!!! tip "Naming Convention"
    Use descriptive, lowercase names for MCP servers: `fetch`, `filesystem`, `database`

!!! tip "Incremental Testing"
    Add one MCP server at a time. Test functionality before adding additional servers.

!!! tip "Monitor Performance"
    Use observability features to track MCP server latency and identify performance bottlenecks.

!!! tip "Secure Credentials"
    Never hardcode sensitive information in MCP configurations. Always use environment variables.

!!! tip "Resource Limits"
    In production environments, set Docker resource constraints to prevent runaway resource usage:
    ```json
    ["run", "-i", "--rm", "--memory=512m", "--cpus=0.5", "mcp/fetch"]
    ```

!!! tip "Logging"
    Configure Docker logging for better observability:
    ```json
    ["run", "-i", "--rm", "--log-driver=json-file", "--log-opt=max-size=10m", "mcp/fetch"]
    ```

---

## Next Steps

Ready to explore more? Check out these resources:

!!! abstract "Related Documentation"

    **[MCP Protocol](https://modelcontextprotocol.io)** - Learn about the Model Context Protocol specification and how to build custom MCP servers

    **[ADK Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/adk)** - Explore Google's Agent Development Kit features and capabilities

    **[Observability Guide](../observability/setup-guide.md)** - Set up monitoring and tracing for your agents

    **[Configuration Reference](../reference/configuration.md#mcp-servers)** - Detailed documentation on all MCP configuration options

!!! question "Need Help?"
    If you encounter issues not covered in this guide, check the [FAQ](../more/faq.md) or [open an issue](https://github.com/Idun-Group/idun-agent-platform/issues).
