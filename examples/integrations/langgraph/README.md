# Slack integration (LangGraph)

> Config-only example. The agent boots and registers the Slack webhook, but reaching it requires a real Slack app, a `bot_token` / `signing_secret`, and a public URL (ngrok, Cloudflare Tunnel, deployed instance) so Slack can POST to `/integrations/slack/events`.

LangGraph chatbot that the engine exposes as a Slack bot. Every message in a channel the bot is invited to is routed to the agent via `/agent/run` and the reply is posted back to the channel.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# fill SLACK_BOT_TOKEN (xoxb-...) and SLACK_SIGNING_SECRET from your Slack app
pip install idun-agent-engine langgraph langchain-google-genai
idun init
```

To actually receive Slack events you also need:

1. A Slack app at [api.slack.com/apps](https://api.slack.com/apps) with the `chat:write` and `app_mentions:read` scopes (plus `im:history` / `channels:history` depending on which channels the bot listens in).
2. The Event Subscriptions URL pointed at `https://<public-host>/integrations/slack/events`.
3. The bot installed to a workspace.

For local development, ngrok or Cloudflare Tunnel works:

```bash
ngrok http 8000
# paste the https URL into Slack Event Subscriptions
```

## Other providers

Switch the `provider:` field to one of `DISCORD`, `GOOGLE_CHAT`, `TEAMS`, `WHATSAPP` and update the `config:` block per the provider's schema.

## How it works

The engine reads the `integrations:` list at boot, validates each entry against its provider-specific config model, and registers a webhook FastAPI router per enabled integration. The webhook handler verifies the request signature (HMAC-SHA256 for Slack), extracts the message, calls the agent, and posts the reply back through the provider's API.

Source: [`libs/idun_agent_schema/src/idun_agent_schema/engine/integrations/`](https://github.com/Idun-Group/idun-agent-platform/tree/main/libs/idun_agent_schema/src/idun_agent_schema/engine/integrations).
