# Authentication

## Overview

The Agent Manager supports multiple authentication methods for secure access control.

## API Keys

Generate and manage API keys for programmatic access to the manager.

```bash
idun manager create-api-key --name my-app
```

## OAuth 2.0

Configure OAuth 2.0 for user authentication with external identity providers.

## Role-Based Access Control

Define roles and permissions to control access to agent management operations.

### Roles

Common roles include Admin, Developer, and Viewer with different permission levels.

## Session Management

Configure session timeouts and token refresh policies for security.

### Cookie Configuration

Session cookies are configured via environment variables on the Manager service:

| Variable | Description | Default |
|---|---|---|
| `AUTH__SESSION_SECRET` | Secret key for signing session cookies. Must be at least 32 random characters. | (placeholder) |
| `AUTH__SESSION_TTL_SECONDS` | Session lifetime in seconds. | `86400` (24 hours) |
| `AUTH__COOKIE_SECURE` | Set to `true` on any HTTPS deployment. Controls the `Secure` flag on cookies. | `false` |

`SameSite` is derived automatically:

- When `AUTH__COOKIE_SECURE=false` (local HTTP dev): `SameSite=Lax`
- When `AUTH__COOKIE_SECURE=true` and frontend/backend share the same origin (same-domain SaaS): `SameSite=Lax`
- When `AUTH__COOKIE_SECURE=true` and frontend/backend are on different origins (cross-origin SaaS): `SameSite=None`

The origin comparison uses `AUTH__FRONTEND_URL` and `AUTH__REDIRECT_URI` to determine if the frontend and backend are same-origin.

## Security Best Practices

Recommendations for securing your Agent Manager deployment and credentials.
