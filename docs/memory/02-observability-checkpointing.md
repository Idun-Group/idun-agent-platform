# Observability & Checkpointing

## Overview

This guide shows you how to add observability to your agents for monitoring, tracing, and debugging. With observability enabled, you can track agent execution, view traces, and analyze performance in real-time using tools like Langfuse or Arize Phoenix.

## Setting Up Observability

You can add observability to your agent either when creating it or by editing an existing agent in the Manager UI.

### Step 1: Navigate to Observability Configuration

When creating or editing an agent:

1. Navigate to the **Observability** step in the agent creation wizard
2. Select your observability provider from the dropdown (e.g., **Langfuse**, Arize Phoenix)

### Step 2: Choose Configuration Method

You have two options:

#### Option A: Use Existing Configuration
If you've already set up an observability configuration:
- Select **"Use existing configuration"**
- Choose your saved configuration from the dropdown
- Click **Next** to continue

#### Option B: Create New Configuration
To create a new observability configuration:

1. Select **"Create new configuration"**
2. Enter a **Configuration Name** (e.g., "Langfuse Production")
3. Fill in the required API credentials:

**For Langfuse:**
- **Public Key**: Your Langfuse public key (starts with `pk-lf-...`)
- **Secret Key**: Your Langfuse secret key (starts with `sk-lf-...`)
- **Host URL**: Your Langfuse instance URL (e.g., `https://cloud.langfuse.com` or your self-hosted URL)

![Langfuse Setup](../images/observability_langfuse_input.png)

4. Click **Save Configuration** or **Next** to continue

!!! tip
    Your observability configurations are saved and can be reused across multiple agents. You only need to set up your API keys once.

### Step 3: Get Your Langfuse API Keys

If you don't have Langfuse API keys yet:

1. Go to [Langfuse Cloud](https://cloud.langfuse.com) or your self-hosted instance
2. Sign up or log in to your account
3. Create a new project or select an existing one
4. Navigate to **Settings** → **API Keys**
5. Click **Create New API Key**
6. Copy the **Public Key** and **Secret Key**
7. Paste them into the Idun Agent Manager configuration form

!!! warning
    Keep your secret key secure. Never commit it to version control or share it publicly.

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

## Checkpointing

Checkpointing saves your agent's state during execution, enabling recovery from failures and resuming conversations.

**Supported Frameworks:** LangGraph and ADK

### Setup

During agent creation:

1. Navigate to the **Checkpointing** step
2. The available options depend on your selected agent framework
3. Choose your backend (SQLite for development, PostgreSQL for production)
4. Fill in the connection details
5. Click **Next** to continue

!!! note
    Checkpointing configuration options are only available for LangGraph and ADK agents.

<br>

---

<br>

## Best Practices

- **Use descriptive names** for observability configurations to identify them easily
- **Enable observability early** to catch issues during development
- **Monitor costs** through your observability dashboard
- **Use SQLite for local development** and PostgreSQL for production checkpointing

## Troubleshooting

### Observability not working?

1. **Check API keys**: Ensure your public and secret keys are correct
2. **Verify host URL**: Make sure the URL is accessible and correctly formatted
3. **Check agent logs**: Look for connection errors in the agent runtime logs
4. **Test connectivity**: Verify you can reach the Langfuse/Phoenix host from your agent

### Checkpointing issues?

1. **Verify database connection**: Test the connection string independently
2. **Check permissions**: Ensure the agent has write access to the database
3. **Review logs**: Look for checkpoint-related errors in agent logs

## Next Steps

- [Configure guardrails](../concepts/guardrails.md) to add safety constraints to your agent
- [Explore MCP servers](../concepts/configuration.md) to extend your agent's capabilities
- [Learn about deployment](../concepts/deployment.md) options for production
