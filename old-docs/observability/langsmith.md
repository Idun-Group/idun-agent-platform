  ![LangSmith logo](../images/logo/langsmith-color.png){ width=120 }

# Observability with LangSmith

This guide shows you how to set up LangSmith to add observability to your agents for monitoring, tracing, and debugging. With observability enabled, you can track agent execution, view traces, and analyze performance in real-time using LangSmith.

Before starting this guide make sure to follow the [Quickstart Guide](../getting-started/quickstart.md) to have your First Agent running on Idun Agent Platform.

## Setting Up Observability

You can add observability to your agent either when creating it or by editing an existing agent in the Manager UI.

### Step 1: Get Your LangSmith API Key

If you don't have a LangSmith API key yet:

1. Go to [LangSmith](https://smith.langchain.com/)
2. Sign up or log in to your account
3. Navigate to **Settings** (gear icon) → **API Keys**
4. Click **Create API Key**
5. Copy your **API Key**

### Step 2: Navigate to Observability Configuration

1. On **Idun Agent Platform** main page, navigate to **Observability**
2. Go to **Add configuration**
3. Select **LangSmith**
4. Enter a **Configuration Name** (e.g., "LangSmith Prod")
5. Fill in the required details:
    - **API Key**: Your LangSmith API key (starts with `lsv2-...`)
    - **Project Name**: The name of the project in LangSmith (e.g., `default` or `prod-agent`)
    - **Project ID**: (Optional) The specific project identifier if needed
    - **Endpoint**: (Optional) Custom endpoint if you are self-hosting LangSmith (e.g., `https://api.smith.langchain.com`)
    - **Tracing Enabled**: Toggle to enable/disable tracing globally
    - **Capture Inputs/Outputs**: Toggle to log full text of inputs and outputs
6. Finnaly, click **Create configuration**

![Add configuration](../images/screenshots/observability-conf.png)

!!! warning
    Keep your API key secure. Never commit it to version control or share it publicly.

### Step 3: Add LangSmith observability to your agent

1. Navigate to your agent you want to trace and observe with LangSmith
2. Click **Edit Agent**
3. Click **Next** to go to the observability config
4. Select **LangSmith** in observability
5. Click on the LangSmith configuration you want to use for your agent.
6. Click **Next**
7. Finnalize with **Save changes**

Finnaly, on your agent page, click **🔄Restart** to reload the agent configuration and enable LangSmith observability.

## Viewing Observability Data

Once your agent is running with observability enabled:

1. Interact with your agent through the Manager UI or API
2. Open your LangSmith dashboard at [smith.langchain.com](https://smith.langchain.com/)
3. Navigate to your project to view traces

You'll see detailed traces showing the execution run tree, LLM inputs/outputs, and latency information.
![LangSmith tracing](../images/screenshots/langsmith-tracing.png)

<br>

---

<br>

## Best Practices

- **Use distinct projects** for development and production
- **Tag runs** if supported to filter traces easily (configured within agent logic)
- **Review error traces** in LangSmith to debug issues quickly

## Troubleshooting

### Observability not working?

1. **Check API Key**: Ensure it is valid and has permissions
2. **Verify Project Name**: Traces will be sent to the "default" project if not specified or incorrect
3. **Check Tracing Enabled**: Ensure the toggle is set to true in the configuration
