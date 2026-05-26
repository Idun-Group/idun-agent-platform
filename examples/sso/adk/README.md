# SSO (Google ADK)

> Config-only example. To test end-to-end you need a real OIDC provider and at least one user whose email satisfies the allowlists.

ADK chatbot whose `/agent/*` routes require a valid OIDC JWT. Same `sso:` block as the [LangGraph variant](../langgraph/README.md); only `agent.type` and the agent code differ.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# edit config.yaml: replace REPLACE_WITH_YOUR_OAUTH_CLIENT_ID and the
# allowed_domains / allowed_emails with values from your OIDC provider
pip install idun-agent-engine google-adk
idun init
```

Unauthenticated requests now return `401`. The bundled chat UI prompts the user to sign in before any conversation starts.

## What gets enforced

Same as the LangGraph variant: every `/agent/*` route requires a valid JWT, claims `aud` / `iss` are matched against config, optional email allowlists are checked. `/health`, `/_engine/info`, and the admin panel stay open.

Source: [`libs/idun_agent_schema/src/idun_agent_schema/engine/sso.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_schema/src/idun_agent_schema/engine/sso.py).

See [SSO docs](https://docs.idun-group.com/auth/sso) for provider-specific notes.
