## Overview

MCP (Model Context Protocol) extends agent capabilities by providing external tools through a standardized interface. MCP servers allow your agents to access a wide range of functionality beyond their built-in capabilities, including:

- **Web Content Retrieval** - Fetch and process content from URLs
- **File System Access** - Read, write, and manipulate files
- **Database Operations** - Query and manage data stores
- **Custom Integrations** - Connect to APIs, internal tools, and specialized services

The Idun Agent Platform supports MCP integration through multiple approaches, giving you flexibility in how you deploy and manage these capabilities.

---

## Integration Approaches

### Docker MCP Toolkit

The Docker MCP Toolkit provides pre-built MCP servers packaged as Docker containers. This approach is ideal for quickly adding common capabilities like web fetching, file system access, and more without writing custom code.

**Best for:**

- Quick prototyping and getting started
- Using community-maintained MCP servers
- Standardized tools with minimal configuration

**[Get Started with Docker MCP →](docker-mcp.md)**

---

### Custom MCP Servers

Host your own MCP servers, either self-hosted or available online. This approach gives you complete control over the MCP server implementation, allowing you to create specialized tools tailored to your specific needs.

**Best for:**

- Custom business logic and integrations
- Proprietary data sources or APIs
- Advanced security or compliance requirements
- Specialized functionality not available in pre-built servers

**[Learn About Custom MCP Servers →](mcp-server.md)**

---

## How MCP Works

When integrated with the Idun Platform:

1. **Configuration** - Define MCP servers in the Manager UI with transport settings and connection details
2. **Discovery** - The agent engine discovers available tools from each configured MCP server
3. **Invocation** - During conversation, agents can invoke MCP tools as needed to fulfill requests
4. **Response** - Tool results are passed back to the agent for processing and response generation

---

## Next Steps

Choose the integration approach that best fits your needs:

- **[Docker MCP Toolkit Guide](docker-mcp.md)** - Start using pre-built MCP servers from the Docker toolkit
- **[Custom MCP Server Guide](mcp-server.md)** - Deploy and configure your own MCP servers
