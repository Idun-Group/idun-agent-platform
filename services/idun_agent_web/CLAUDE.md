# CLAUDE.md — Idun Agent Web

## What This Is

`idun_agent_web` is the **React admin dashboard** for the Idun Agent Platform. It provides a UI for managing agents, configuring observability/memory/MCP/guardrails integrations, user management, and settings. It communicates with the manager backend (`idun_agent_manager`) via REST API.

For backend API routes and schemas, see `services/idun_agent_manager/CLAUDE.md` and `libs/idun_agent_schema/CLAUDE.md`.

## Tech Stack

- **React 19** + **TypeScript 5.8** + **Vite 7**
- **styled-components 6** — CSS-in-JS styling with CSS custom properties for theming
- **React Router 7** — Client-side routing
- **i18next** — Internationalization (7 languages, default: French)
- **AG-UI Client** — Agent streaming protocol (`@ag-ui/client`)
- **Monaco Editor** — Code/config editing
- **Lucide React** — Icons
- **react-toastify** — Toast notifications
- **Storybook 9** + **Vitest** + **Playwright** — Testing
- **Plop** — Component scaffolding
- **openapi-typescript** — Auto-generated API types from OpenAPI spec

## Project Layout

```
services/idun_agent_web/
├── src/
│   ├── App.tsx                  # Route definitions (React Router)
│   ├── main.tsx                 # Entry point
│   ├── global-styles.tsx        # Global CSS variables, light/dark theme
│   ├── pages/                   # Page components (one per route)
│   │   ├── login/               # Email/password + OIDC login
│   │   ├── signin/              # User registration
│   │   ├── home/                # Landing page
│   │   ├── agent-dashboard/     # Agent list with search/pagination
│   │   ├── agent-detail/        # Agent view/edit (tabbed: Overview, Gateway, Config, Prompts, Logs)
│   │   ├── agent-form/          # Agent creation wizard
│   │   ├── user-dashboard/      # User management
│   │   ├── user-form/           # User creation
│   │   ├── settings/            # Settings (Profile, Security, Appearance, Language, Notifications)
│   │   ├── prompts-page/        # Prompt management (versioned, grouped by prompt_id)
│   │   ├── application-page/    # Shared page for Observability, Memory, MCP, Guardrails config
│   │   └── observation/         # Observation/metrics page
│   ├── components/
│   │   ├── general/             # Reusable: Button, Form (TextInput, TextArea, Select, TagInput), Modal, Loader, ToggleButton, DynamicForm
│   │   ├── auth/                # RequireAuth guard component
│   │   ├── prompts/             # CreatePromptModal (Monaco editor, markdown preview, tags, Jinja2 variable detection)
│   │   ├── agent-detail/tabs/prompts-tab/  # Read-only tab showing prompts assigned to an agent
│   │   └── ...                  # Feature-specific components (agent detail tabs, settings sections, etc.)
│   ├── layouts/
│   │   ├── header/              # Top navigation bar
│   │   ├── side-bar/            # Dashboard sidebar + Settings sidebar
│   │   ├── data-board/          # Table layout with search, pagination, sorting
│   │   ├── form-paginations/    # Multi-step form layout
│   │   └── popup-layout/        # Modal/popup container
│   ├── hooks/                   # Context providers + custom hooks
│   │   ├── use-auth.tsx         # AuthProvider + useAuth() — session, login, logout, signup, OIDC
│   │   ├── use-workspace.tsx    # WorkspaceProvider + useWorkspace() — multi-tenancy
│   │   ├── use-agent-model.tsx  # AgentProvider — agent creation form state
│   │   ├── use-agent-file.tsx   # AgentFileProvider — agent file upload state
│   │   ├── use-loader.tsx       # LoaderProvider — global loading state
│   │   ├── use-settings-page.tsx # SettingPageProvider — settings tab state
│   │   └── use-toggle-theme.tsx # ToggleThemeModeProvider — dark/light/system theme
│   ├── services/                # API service layer
│   │   ├── agents.ts            # Agent CRUD (list, get, patch, delete)
│   │   ├── prompts.ts           # Prompt CRUD, agent assignment/unassignment
│   │   ├── applications.ts     # Integration config CRUD (observability, memory, MCP, guardrails)
│   │   ├── integrations.ts     # Messaging integrations CRUD (WhatsApp, Discord)
│   │   └── sso.ts              # SSO/OIDC config CRUD
│   ├── utils/
│   │   ├── api.ts               # HTTP client (apiFetch, getJson, postJson, patchJson, deleteRequest)
│   │   ├── agent-config-utils.ts # Agent form state, resource selections, payload building
│   │   ├── auth.ts              # Auth API calls (getSession, loginBasic, logoutBasic, signupBasic)
│   │   ├── jinja.ts             # extractVariables() — parses {{ variable }} from prompt content
│   │   ├── runtime-config.ts    # Runtime config resolution (window.__RUNTIME_CONFIG__ → Vite env → defaults)
│   │   └── style-variables.ts   # Design tokens (color HSL values for light/dark themes)
│   ├── generated/
│   │   └── agent-manager.ts     # Auto-generated TypeScript types from manager OpenAPI spec
│   ├── i18n/
│   │   ├── index.ts             # i18next setup
│   │   └── locales/             # Translation JSON files (fr, en, es, de, ru, pt, it)
│   ├── types/                   # TypeScript type definitions
│   └── data/                    # Mock data (used when USE_MOCKS=true)
├── schema/
│   └── manager-openapi.json     # Manager OpenAPI spec (source for type generation)
├── vite.config.ts
├── package.json
├── plopfile.js                  # Plop generator config
└── .storybook/                  # Storybook configuration
```

## Routes

| Path | Page | Auth | Description |
|---|---|---|---|
| `/` | HomePage | Public | Landing page |
| `/login` | LoginPage | Public | Login (email/password or OIDC redirect) |
| `/signin` | SigninPage | Public | Registration |
| `/agents` | AgentDashboardPage | Protected | Agent list with search/pagination |
| `/agents/:id` | AgentDetailPage | Protected | Agent detail (tabbed view) |
| `/agents/create` | AgentFormPage | Protected | Agent creation wizard |
| `/users` | UserDashboardPage | Protected | User management |
| `/users/create` | UserFormPage | Protected | User creation |
| `/settings` | SettingsPage | Protected | App settings (profile, theme, language, etc.) |
| `/observability` | ObservabilityPage | Protected | Observability integration configs |
| `/memory` | MemoryPage | Protected | Memory/checkpoint configs |
| `/mcp` | MCPPage | Protected | MCP server configs |
| `/guardrails` | GuardrailsPage | Protected | Guardrail configs |
| `/sso` | SSOPage | Protected | SSO/OIDC configuration management |
| `/integrations` | IntegrationsPage | Protected | Messaging integrations (WhatsApp, Discord) |
| `/observation` | ObservationPage | Protected | Observation/metrics view |
| `/onboarding` | OnboardingPage | Protected | First workspace creation (shown when user has no workspaces) |

Protected routes are wrapped with `<RequireAuth />` which:
1. Redirects to `/login` if no session exists
2. Redirects to `/onboarding` if the user has no workspaces (except when already on `/onboarding`)

The `/observability`, `/memory`, `/mcp`, and `/guardrails` routes each have dedicated page components in `src/pages/{feature}-page/page.tsx`. Each page shows a card grid with CRUD, search, and "Used by N agents" badges with delete protection warnings.

## Authentication

Uses session cookies set by the manager backend. Two modes (controlled by `AUTH_DISABLE_USERNAME_PASSWORD` runtime config):

- **Email/password** (default): `POST /api/v1/auth/basic/login` and `/signup`
- **OIDC**: Redirects to `GET /api/v1/auth/login` (manager handles Google OAuth flow)

`AuthProvider` hydrates session on mount via `GET /api/v1/auth/me`. On 401, it re-validates the session once.

### Onboarding Flow
- Signup no longer auto-creates a workspace. New users start with `workspace_ids: []`.
- `LoginPage` and `SigninPage` check `workspace_ids` and redirect to `/onboarding` when empty.
- `OnboardingPage` lets the user create their first workspace, then calls `refresh()` (which hits `/me` and re-signs the cookie), then navigates to `/agents`.
- `syncActiveWorkspace()` in `use-auth.tsx` prefers `default_workspace_id` when selecting the active tenant.

## API Layer

`src/utils/api.ts` provides `apiFetch()` — a thin wrapper around `fetch` with:
- `credentials: 'include'` (session cookies)
- Auto JSON content-type
- 401 handling (notifies registered handlers)
- Base URL resolved from runtime config

Services (`src/services/`) use these helpers for domain-specific CRUD operations.

## Generated Types

Auto-generated from the manager's OpenAPI spec:

```bash
npm run generate:manager-types
# Reads: schema/manager-openapi.json
# Writes: src/generated/agent-manager.ts
```

## Styling

- **styled-components** with CSS custom properties for theming
- **Light/dark mode** via CSS class toggle (`.light`, `.dark`) on the root element
- Design tokens in `src/utils/style-variables.ts` (HSL color values)
- Global styles in `src/global-styles.tsx`
- Components use transient props (`$variant`, `$color`) for dynamic styling

## i18n

7 languages: French (default), English, Spanish, German, Russian, Portuguese, Italian.

- Translation files: `src/i18n/locales/{lang}.json`
- Language persisted to `localStorage`
- Usage: `const { t } = useTranslation(); t('dashboard.agent.title')`

## Runtime Configuration

Config resolution order (per key):
1. `window.__RUNTIME_CONFIG__` — injected at runtime (Docker deployments)
2. `import.meta.env.VITE_*` — Vite environment variables (dev)
3. Hardcoded defaults

| Key | Vite Env | Default | Purpose |
|---|---|---|---|
| `API_URL` | `VITE_API_URL` | `''` (uses proxy) | Manager backend URL |
| `AUTH_DISABLE_USERNAME_PASSWORD` | `VITE_AUTH_DISABLE_USERNAME_PASSWORD` | `false` | Hide email/password login |
| `USE_MOCKS` | `VITE_USE_MOCKS` | `false` | Use mock data instead of API |

## Vite Dev Proxy

In development, Vite proxies API calls to avoid CORS:

| Path | Target | Purpose |
|---|---|---|
| `/api/*` | `localhost:8000` | Manager backend |
| `/openapi.json` | `localhost:8000` | OpenAPI spec |

## State Management

Context-based (React Context API, no external state library):

| Provider | Hook | Purpose |
|---|---|---|
| `AuthProvider` | `useAuth()` | Session, login/logout/signup, OIDC |
| `WorkspaceProvider` | `useWorkspace()` | Multi-tenancy workspace selection |
| `ToggleThemeModeProvider` | `useToggleThemeMode()` | Dark/light/system theme |
| `LoaderProvider` | `useLoader()` | Global loading spinner |
| `AgentProvider` | `useAgent()` | Agent creation form state |
| `AgentFileProvider` | `useAgentFile()` | Agent file upload state |
| `SettingPageProvider` | `useSettingsPage()` | Settings tab navigation |

## Agent Config & Resource Model

Agents reference managed resources by ID (not by embedding full configs). The backend assembles the full `engine_config` JSONB from relational data.

### Key Utility: `src/utils/agent-config-utils.ts`

Centralizes all agent form state management:
- `AgentFormState` — name, version, baseUrl, description, serverPort, agentType, agentConfig
- `AgentSelections` — selected resource IDs (memory, SSO, guardrails, MCP, observability, integrations)
- `buildAgentPatchPayload(state, selections)` — Builds the API payload with a `resources` field containing resource IDs
- `extractSelectionsFromAgent(response, framework, resources)` — Reads resource IDs from `response.resources` to populate UI selections
- `extractAgentConfig(engineConfig)` — Extracts framework-specific agent config fields
- `validateAgentForm(state)` — Validates required fields

### Payload Shape

Agent create/patch sends:
```typescript
{
  name, version, base_url, description,
  engine_config: { server: {...}, agent: {...} },  // Only server + agent config
  resources: {
    memory_id: "uuid" | null,
    sso_id: "uuid" | null,
    guardrail_ids: [{ id: "uuid", position: "input"|"output", sort_order: 0 }],
    mcp_server_ids: ["uuid"],
    observability_ids: ["uuid"],
    integration_ids: ["uuid"],
  }
}
```

The backend resolves resource IDs to full configs, assembles the complete `engine_config`, and stores it as a materialized JSONB cache. See `services/idun_agent_manager/CLAUDE.md` for details.

### Resource Pages

Each resource type has a dedicated page (`src/pages/{feature}-page/page.tsx`) showing:
- Card grid with search and CRUD
- "Used by N agents" badge per resource (from `agentCount` in API response)
- Delete protection: warns when resource is in use, backend returns 409 on delete attempt

## Code Generation

```bash
# Generate a new component/page/layout/hook from templates
npm run plop
```

Plop uses `PLOP_IMPORT` and `PLOP_ROUTE` markers in `App.tsx` to auto-wire new pages.

## Development

```bash
# Install dependencies
npm install

# Dev server (port 5173, proxies to backend on 8000)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Storybook (port 6006)
npm run storybook

# Regenerate API types from OpenAPI spec
npm run generate:manager-types
```

## Conventions

- Each component lives in its own folder: `component.tsx` + optional `component.stories.tsx`
- Pages are in `src/pages/{page-name}/page.tsx`
- Layouts are in `src/layouts/{layout-name}/layout.tsx`
- Hooks/providers are in `src/hooks/use-{name}.tsx`
- All API calls go through `src/utils/api.ts` — never use `fetch` directly
- Use `useTranslation()` for all user-facing strings

### Adding New Features / Config Types

When adding a new resource type (like SSO, MCP, Guardrails, etc.), update all of these:

1. **Dedicated page** — `src/pages/{feature}-page/page.tsx` (card grid with CRUD, search, agent count badges)
2. **API service** — `src/services/{feature}.ts` (CRUD functions, map `agent_count` from response)
3. **Route** — `src/App.tsx` (register the route)
4. **Sidebar** — `src/layouts/side-bar/dashboard-side-bar/layout.tsx` (add nav entry)
5. **Agent config utils** — `src/utils/agent-config-utils.ts`:
   - Add selection field to `AgentSelections`
   - Add resource list to `AvailableResources`
   - Update `buildAgentPatchPayload()` to include the ID in `resources`
   - Update `extractSelectionsFromAgent()` to read from `response.resources`
6. **Agent overview resources section** — `src/components/agent-detail/tabs/overview-tab/sections/resources-section.tsx` (add selection UI)
7. **Agent dashboard card badges** — `src/components/dashboard/agents/agent-card/feature-icons.tsx` (add detection logic + badge)
8. **Backend** — Add junction table/FK, update `engine_config.py` assembly, add cascade recompute to resource router
9. **i18n** — `src/i18n/locales/*.json` (add translation keys)

Missing any of these will result in the feature being partially integrated.
