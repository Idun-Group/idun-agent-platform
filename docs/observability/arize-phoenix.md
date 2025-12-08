<p align="center">
  <img src="../images/logo/phoenix.svg" alt="Arize Phoenix logo" width="120"/>
</p>

# Observability with Arize Phoenix

This guide shows you how to set up Arize Phoenix to add observability to your agents for monitoring, tracing, and debugging. With observability enabled, you can track agent execution, view traces, and analyze performance in real-time using Arize Phoenix.

Before starting this guide make sure to follow the [Quickstart Guide](../getting-started/quickstart.md) to have your First Agent running on Idun Agent Platform.

## Setting Up Observability

You can add observability to your agent either when creating it or by editing an existing agent in the Manager UI.

### Step 1: Get Your Phoenix Details

If you are using Arize Phoenix (Cloud):

1. Go to [Arize Phoenix](https://phoenix.arize.com)
2. Sign up or log in to your account
3. Create a new project or select an existing one
4. Note your **Project Name** and the **Collector Endpoint** (usually `https://collector.phoenix.com`)

If you are hosting Phoenix yourself, ensure you have the collector endpoint URL ready.

### Step 2: Navigate to Observability Configuration

1. On **Idun Agent Platform** main page, navigate to **Observability**
2. Go to **Add configuration**
3. Select **Phoenix**
4. Enter a **Configuration Name** (e.g., "Phoenix Prod")
5. Fill in the required details:
    - **Collector Endpoint**: The URL of the Phoenix collector (e.g., `https://collector.phoenix.com` or your custom endpoint)
    - **Project Name**: The name of your project in Phoenix
6. Finnaly, click **Create configuration**

![Add configuration](../images/screenshots/observability-conf.png)

!!! tip
    Your observability configurations are saved and can be reused across multiple agents.

### Step 3: Add Phoenix observability to your agent

1. Navigate to your agent you want to trace and observe with Phoenix
2. Click **Edit Agent**
3. Click **Next** to go to the observability config
4. Select **Phoenix** in observability
5. Click on the Phoenix configuration you want to use for your agent.
6. Click **Next**
7. Finnalize with **Save changes**


Finnaly, on your agent page, click **🔄Restart** to reload the agent configuration and enable Phoenix observability.

## Viewing Observability Data

Once your agent is running with observability enabled:

1. Interact with your agent through the Manager UI or API
2. Open your Phoenix dashboard
3. Navigate to your project to view traces

You'll see detailed traces showing agent execution flows, tool usage, and performance metrics.

![Phoenix tracing](../images/screenshots/phoenix-tracing.avif)

<br>

---

<br>

## Best Practices

- **Use descriptive names** for observability configurations
- **Monitor latency** using Phoenix's performance tools
- **Check traces** regularly to understand agent behavior

## Troubleshooting

!!! warning
    ADK does not currently support simultaneous tracing with multiple providers.

### Observability not working?

1. **Check Collector Endpoint**: Ensure the URL is correct and accessible from the agent
2. **Verify Project Name**: Ensure it matches exactly what is in Phoenix
3. **Check network**: Ensure your agent environment can reach the Phoenix collector
