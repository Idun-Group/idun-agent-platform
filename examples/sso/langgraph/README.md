# SSO (LangGraph)

> Config-only example. The agent boots, but `/agent/*` is gated behind OIDC. To test end-to-end you need a real OIDC provider (Google Workspace, Microsoft Entra, Okta, Auth0, or any custom OIDC) and at least one user whose email satisfies the allowlists.

LangGraph chatbot whose `/agent/*` routes require a valid `Authorization: Bearer <jwt>` header. The example uses a Google Workspace preset; swap the `issuer`, `client_id`, `audience` for any OIDC provider.

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
# edit config.yaml: replace REPLACE_WITH_YOUR_OAUTH_CLIENT_ID and the
# allowed_domains / allowed_emails with values from your OIDC provider
pip install idun-agent-engine langgraph langchain-google-genai
idun init
```

Unauthenticated requests now return `401`:

```bash
curl http://localhost:8000/agent/capabilities
# {"detail":"Authorization header missing"}
```

The bundled chat UI prompts the user to sign in with the configured provider before any conversation starts. For programmatic clients, obtain the token through the provider's OAuth 2.0 + PKCE flow and attach it as `Authorization: Bearer <jwt>` on every request.

## What gets enforced

- Every `/agent/*` route (including `/agent/run`, `/agent/stream`, the deprecated `/agent/invoke`).
- `aud` and `iss` claims matched against `audience` and `issuer`.
- JWT signature verified against the issuer's JWKS endpoint.
- If `allowed_domains` or `allowed_emails` is set, the token's `email` claim must satisfy at least one.

`/health`, `/_engine/info`, and the admin panel stay open. The admin panel has its own auth surface (`IDUN_ADMIN_AUTH_MODE`).

## How it works

The engine discovers the JWKS endpoint from `{issuer}/.well-known/openid-configuration` at startup. Per request, the dependency reads `Authorization`, validates the JWT against the JWKS, then checks the email allowlists. Failure at any step returns `401 Unauthorized`. Nothing is cached beyond the JWKS rotation window.

Source: [`libs/idun_agent_schema/src/idun_agent_schema/engine/sso.py`](https://github.com/Idun-Group/idun-agent-platform/blob/main/libs/idun_agent_schema/src/idun_agent_schema/engine/sso.py).

See [SSO docs](https://docs.idun-group.com/auth/sso) for provider-specific notes (Microsoft Entra multi-tenant, Okta audience quirk, custom OIDC).
