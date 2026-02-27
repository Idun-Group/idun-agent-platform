# Discord Integration

Connect your Idun agent to Discord so users can interact with it via slash commands.

---

## Prerequisites

- A running Idun agent (engine)
- A Discord account
- Your engine must be publicly reachable (use [ngrok](https://ngrok.com) for local development)

---

## 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. On the **General Information** page, copy:
    - **Application ID**
    - **Public Key**

---

## 2. Create a Bot

1. Go to the **Bot** tab
2. Click **Reset Token** to generate a **Bot Token** — copy it immediately (it's only shown once)

---

## 3. Invite the Bot to Your Server

1. Go to **OAuth2 → URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions: `Send Messages`
4. Copy the generated URL, open it in your browser, and select your server
5. To get your **Guild ID**: enable Developer Mode in Discord settings (User Settings → Advanced → Developer Mode), then right-click your server name → **Copy Server ID**

---

## 4. Configure the Integration

Add the Discord integration to your engine config:

```yaml
integrations:
  - provider: "DISCORD"
    enabled: true
    config:
      bot_token: "MTI..."
      application_id: "123456789012345678"
      public_key: "abcdef1234567890..."
      guild_id: "987654321098765432"  # optional, scopes commands to a single server
```

Or configure it through the Manager UI on the **Integrations** page.

| Field | Description |
|---|---|
| `bot_token` | Bot token from step 2 |
| `application_id` | Application ID from step 1 |
| `public_key` | Public key from step 1 (used for Ed25519 signature verification) |
| `guild_id` | (Optional) Your Discord server ID. If set, slash commands are scoped to this server and appear instantly |

---

## 5. Set the Interactions Endpoint URL

1. Make sure your engine is running and publicly reachable
2. In the Discord Developer Portal, go to **General Information**
3. Set **Interactions Endpoint URL** to:

```
https://<your-domain>/integrations/discord/webhook
```

Discord will send a PING request to verify the endpoint. The engine handles this automatically.

---

## 6. Register a Slash Command

Discord doesn't create commands automatically — you need to register them via the Discord API.

**Register a guild command** (appears instantly in your server):

```bash
curl -X POST \
  "https://discord.com/api/v10/applications/{APPLICATION_ID}/guilds/{GUILD_ID}/commands" \
  -H "Authorization: Bot {BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ask",
    "description": "Ask the agent a question",
    "options": [
      {
        "name": "query",
        "description": "Your question",
        "type": 3,
        "required": true
      }
    ]
  }'
```

Replace `{APPLICATION_ID}`, `{GUILD_ID}`, and `{BOT_TOKEN}` with your values.

!!! note
    `"type": 3` means a **STRING** option. The engine extracts this as the query text sent to your agent.

!!! tip
    To register a **global command** (available in all servers the bot is in), omit `/guilds/{GUILD_ID}` from the URL. Global commands can take up to 1 hour to appear.

---

## 7. Test It

1. Go to your Discord server
2. Type `/ask query: Hello`
3. The bot shows a "thinking..." indicator (deferred response), then replies with your agent's answer

---

## How It Works

1. User sends `/ask query: ...` in Discord
2. Discord POSTs the interaction to your engine's webhook
3. Engine verifies the Ed25519 signature
4. Engine immediately defers the response (Discord requires a reply within 3 seconds)
5. Engine invokes the agent asynchronously with the query text
6. Engine edits the deferred message with the agent's reply

- **Session tracking**: The Discord user ID is used as the session ID, so conversation context is maintained per user
- **Message limit**: Discord messages are capped at 2000 characters — longer replies are truncated
