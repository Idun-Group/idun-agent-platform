
  ![Langfuse logo](../images/logo/langfuse-color.png){ width=120 }

# Observability with Langfuse

This guide shows you how to set up Langfuse to add observability to your agents for monitoring, tracing, and debugging. With observability enabled, you can track agent execution, view traces, and analyze performance in real-time using Langfuse.

Before starting this guide, follow the [Quickstart guide](../getting-started/quickstart.md) to have your first agent running on Idun Agent Platform.

## Setting Up Observability

You can add observability to your agent either when creating it or by editing an existing agent in the Manager UI.

### Step 1: Get Your Langfuse API Keys

If you don't have Langfuse API keys yet:

1. Go to [Langfuse Cloud](https://cloud.langfuse.com) or your [self-hosted](https://langfuse.com/self-hosting) instance
2. Sign up or log in to your account
3. Create a new project or select an existing one
4. Navigate to **Settings** → **API Keys**
5. Click **Create New API Key**
6. Copy the **Public Key** and **Secret Key**

### Step 2: Navigate to Observability Configuration

1. On **Idun Agent Platform** main page, navigate to **Observability**
2. Go to **Add configuration**
3. Select **Langfuse**
4. Enter a **Configuration Name** (e.g., "Langfuse Server 1")
5. Fill in the required API credentials:
    - **Host URL**: Your Langfuse instance URL (e.g., `https://cloud.langfuse.com` or your self-hosted URL)
    - **Public Key**: Your Langfuse public key (starts with `pk-lf-...`)
    - **Secret Key**: Your Langfuse secret key (starts with `sk-lf-...`)
6. Finally, click **Create configuration**

![Add configuration](../images/screenshots/observability-conf.png)
![Add langfuse configuration 2](../images/screenshots/observability-add-langfuse-conf.png)

!!! warning
    Keep your secret key secure. Never commit it to version control or share it publicly.

!!! tip
    Your observability configurations are saved and can be reused across multiple agents. You only need to set up your API keys once.

### Step 3: Add Langfuse observability to your agent

1. Navigate to your agent you want to trace and observe with Langfuse
2. Click **Edit Agent**
3. Click **Next** to go to the observability config
4. Select **Langfuse** in observability
5. Click on the Langfuse configuration you want to use for your agent.
6. Click **Next**
7. Finnalize with **Save changes**

![Add langfuse configuration to agent](../images/screenshots/add-langfuse-to-agent.png)

Finnaly, on your agent page, click **🔄Restart** to reload the agent configuration and enable Langfuse observability.

## Viewing Observability Data

Once your agent is running with observability enabled:

1. Interact with your agent through the Manager UI or API
2. Open your Langfuse dashboard at [cloud.langfuse.com](https://cloud.langfuse.com)
3. Navigate to your project to view traces

You'll see detailed traces showing:
- Agent execution flow
- LLM calls and responses
- Tool usage and results
- Execution time and costs
- Error traces and debugging information

![Langfuse tracing](../images/screenshots/langfuse-tracing.png)

<br>

---

<br>

## Best Practices

- **Use descriptive names** for observability configurations to identify them easily
- **Enable observability early** to catch issues during development
- **Monitor costs** through your observability dashboard

## Troubleshooting

!!! warning
    ADK does not currently support simultaneous tracing with both Langfuse and GCP tracing.
    If you are interested by this feature, please reach out via [GitHub issues](https://github.com/Idun-Group/idun-agent-platform/issues) or join our [Discord Server](https://discord.gg/KCZ6nW2jQe).

### Observability not working?

1. **Check API keys**: Ensure your public and secret keys are correct
2. **Verify host URL**: Make sure the URL is accessible and correctly formatted
3. **Check agent logs**: Look for connection errors in the agent runtime logs
4. **Test connectivity**: Verify you can reach the Langfuse/Phoenix host from your agent

## Next Steps

- [Configure guardrails](../guardrails/overview.md) to add safety constraints to your agent
- [Add MCP server](../mcp/overview.md) to extend your agent's capabilities add any MCP server tools to your agents
- [Learn about deployment](../deployment/concepts.md) options for production
