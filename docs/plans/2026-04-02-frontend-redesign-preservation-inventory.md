# Frontend Redesign - Preservation Inventory

This document catalogs everything that MUST be preserved during the frontend rewrite.
The old frontend lives in `services/idun_agent_web/` for reference.
The new frontend lives in `services/web-new/`.

## Files to Copy Verbatim (NO changes)

These files contain zero styling and must be copied as-is:

### Services (API layer)
- `src/services/agents.ts` - Agent CRUD, health checks, restart, graph, engine version
- `src/services/applications.ts` - Observability/Memory/MCP/Guardrails CRUD, connection checks, tool discovery
- `src/services/prompts.ts` - Prompt CRUD, agent assignment
- `src/services/integrations.ts` - Messaging integration CRUD
- `src/services/sso.ts` - SSO/OIDC CRUD
- `src/services/members.ts` - Workspace member CRUD
- `src/services/guardrail-payloads.ts` - Guardrail config building/validation

### Utils
- `src/utils/api.ts` - HTTP client (apiFetch, getJson, postJson, etc.)
- `src/utils/auth.ts` - Auth API (login, logout, signup, session, roles, users)
- `src/utils/agent-config-utils.ts` - Agent form state, selections, payload building
- `src/utils/runtime-config.ts` - Runtime config resolution
- `src/utils/jinja.ts` - Jinja2 variable extraction
- `src/utils/yaml-parser.ts` - YAML parsing for agent configs
- `src/utils/zip-session.ts` - ZIP file operations
- `src/utils/agent-fetch.ts` - Agent URL builder + private network fetch

### Hooks (logic only, styling in providers is minimal)
- `src/hooks/use-auth.tsx` - AuthProvider + useAuth()
- `src/hooks/use-workspace.tsx` - WorkspaceProvider + useWorkspace()
- `src/hooks/use-loader.tsx` - LoaderProvider + useLoader()
- `src/hooks/use-toggle-theme-mode.tsx` - ToggleThemeModeProvider + useToggleThemeMode()
- `src/hooks/use-agent-model.tsx` - AgentProvider + useAgentModel()
- `src/hooks/use-agent-file.tsx` - AgentFileProvider + useAgentFile()
- `src/hooks/use-analytics.ts` - useAnalytics() (PostHog)

### Generated Types
- `src/generated/agent-manager.ts` - Auto-generated from OpenAPI spec
- `src/types/` - All type definitions

### i18n
- `src/i18n/` - All translation files and config

### Config
- `vite.config.ts`
- `tsconfig*.json`
- `package.json` (add IBM Plex Sans)
- `schema/` - OpenAPI spec
- `.storybook/` - Storybook config

## API Endpoints Used (must all still be called)

### Auth
- `POST /api/v1/auth/basic/login` - email/password login
- `POST /api/v1/auth/basic/signup` - registration
- `POST /api/v1/auth/logout` - logout
- `GET /api/v1/auth/me` - session hydration
- `GET /api/v1/auth/providers` - OIDC provider list
- `GET /api/v1/auth/login/{provider}` - OIDC redirect
- `POST /api/v1/auth/roles/assign` - role assignment
- `GET /api/v1/auth/roles` - list roles
- `GET /api/v1/users` - list users

### Agents
- `GET /api/v1/agents/` - list agents
- `GET /api/v1/agents/{id}` - get agent
- `POST /api/v1/agents/` - create agent
- `PUT /api/v1/agents/{id}` - update agent
- `PATCH /api/v1/agents/{id}` - patch agent
- `DELETE /api/v1/agents/{id}` - delete agent
- `PUT /api/v1/agents/{id}/status` - update status
- `GET /api/v1/agents/key?agent_id={id}` - get API key
- `GET {base_url}/health` - agent health check
- `POST {base_url}/reload` - restart agent
- `GET {base_url}/agent/graph` - fetch graph
- `GET {base_url}/openapi.json` - agent OpenAPI spec

### Resources
- `GET/POST/PATCH/DELETE /api/v1/observability/` - observability CRUD
- `POST /api/v1/observability/check-connection` - test connection
- `GET/POST/PATCH/DELETE /api/v1/memory/` - memory CRUD
- `POST /api/v1/memory/check-connection` - test connection
- `GET/POST/PATCH/DELETE /api/v1/mcp-servers/` - MCP CRUD
- `POST /api/v1/mcp-servers/{id}/tools` - discover tools
- `GET/POST/PATCH/DELETE /api/v1/guardrails/` - guardrails CRUD
- `GET/POST/PATCH/DELETE /api/v1/sso/` - SSO CRUD
- `GET/POST/PATCH/DELETE /api/v1/integrations/` - integrations CRUD

### Prompts
- `GET /api/v1/prompts/` - list all prompts
- `POST /api/v1/prompts/` - create prompt
- `DELETE /api/v1/prompts/{id}` - delete prompt
- `GET /api/v1/prompts/agent/{agentId}` - prompts for agent
- `POST /api/v1/prompts/{promptId}/assign/{agentId}` - assign
- `DELETE /api/v1/prompts/{promptId}/assign/{agentId}` - unassign

### Workspaces
- `GET /api/v1/workspaces` - list workspaces
- `POST /api/v1/workspaces/` - create workspace
- `GET/POST/PATCH/DELETE /api/v1/workspaces/{id}/members` - members CRUD
- `DELETE /api/v1/workspaces/{id}/invitations/{id}` - cancel invite

### External
- `https://pypi.org/pypi/idun-agent-engine/json` - latest engine version

## LocalStorage / SessionStorage Keys
- `activeTenantId` - selected workspace ID
- `idun-theme-mode` - theme preference
- `i18nextLng` - language preference
- `returnUrl` (sessionStorage) - post-login redirect
- `idun-github-card-dismissed` - sidebar GitHub card state
- `idun-code-sidebar-width` - code tab sidebar width

## Page Business Logic Summary

Each page's business logic (state, effects, handlers, API calls) is documented in the agent exploration results above. The key pattern across all pages:
- useState for local state
- useEffect for data loading on mount
- Service functions for API calls
- useNavigate for routing
- notify.success/error for toasts
- useTranslation for i18n strings
- Conditional rendering for loading/empty/error states
