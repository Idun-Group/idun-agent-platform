# Slack integration (Google ADK)

> Config-only example. To receive Slack events end-to-end you need a real Slack app and a public URL pointed at `/integrations/slack/events`.

ADK chatbot that the engine exposes as a Slack bot. Same `integrations:` block as the [LangGraph variant](../langgraph/README.md); only `agent.type` and the agent code differ.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# fill SLACK_BOT_TOKEN (xoxb-...) and SLACK_SIGNING_SECRET from your Slack app
pip install idun-agent-engine google-adk
idun init
```

Then expose port 8000 publicly (ngrok / Cloudflare Tunnel) and point the Slack app's Event Subscriptions URL at `https://<public-host>/integrations/slack/events`.

See the [LangGraph variant](../langgraph/README.md) for the full Slack app setup checklist.

## Other providers

Switch the `provider:` field to one of `DISCORD`, `GOOGLE_CHAT`, `TEAMS`, `WHATSAPP` and update the `config:` block per the provider's schema.

Source: [`libs/idun_agent_schema/src/idun_agent_schema/engine/integrations/`](https://github.com/Idun-Group/idun-agent-platform/tree/main/libs/idun_agent_schema/src/idun_agent_schema/engine/integrations).
