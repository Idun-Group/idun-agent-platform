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
│   │   ├── agent-detail/        # Agent view/edit (tabbed: Overview, Gateway, Config, Logs)
│   │   ├── agent-form/          # Agent creation wizard
│   │   ├── user-dashboard/      # User management
│   │   ├── user-form/           # User creation
│   │   ├── settings/            # Settings (Profile, Security, Appearance, Language, Notifications)
│   │   ├── application-page/    # Shared page for Observability, Memory, MCP, Guardrails config
│   │   └── observation/         # Observation/metrics page
│   ├── components/
│   │   ├── general/             # Reusable: Button, Form (TextInput, TextArea, Select, TagInput), Modal, Loader, ToggleButton, DynamicForm
│   │   ├── auth/                # RequireAuth guard component
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
│   │   ├── applications.ts     # Integration config CRUD (observability, memory, MCP, guardrails)
│   │   ├── integrations.ts     # Messaging integrations CRUD (WhatsApp, Discord)
│   │   └── sso.ts              # SSO/OIDC config CRUD
│   ├── utils/
│   │   ├── api.ts               # HTTP client (apiFetch, getJson, postJson, patchJson, deleteRequest)
│   │   ├── auth.ts              # Auth API calls (getSession, loginBasic, logoutBasic, signupBasic)
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
| `/observability` | ApplicationPage | Protected | Observability integration configs |
| `/memory` | ApplicationPage | Protected | Memory/checkpoint configs |
| `/mcp` | ApplicationPage | Protected | MCP server configs |
| `/guardrails` | ApplicationPage | Protected | Guardrail configs |
| `/sso` | SSOPage | Protected | SSO/OIDC configuration management |
| `/integrations` | IntegrationsPage | Protected | Messaging integrations (WhatsApp, Discord) |
| `/observation` | ObservationPage | Protected | Observation/metrics view |

Protected routes are wrapped with `<RequireAuth />` which redirects to `/login` if no session exists.

The `/observability`, `/memory`, `/mcp`, and `/guardrails` routes all use the same `ApplicationPage` component with a different `category` prop.

## Authentication

Uses session cookies set by the manager backend. Two modes (controlled by `AUTH_DISABLE_USERNAME_PASSWORD` runtime config):

- **Email/password** (default): `POST /api/v1/auth/basic/login` and `/signup`
- **OIDC**: Redirects to `GET /api/v1/auth/login` (manager handles Google OAuth flow)

`AuthProvider` hydrates session on mount via `GET /api/v1/auth/me`. On 401, it re-validates the session once.

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

When adding a new feature or config type (like SSO, MCP, Guardrails, etc.), you **must** update all of these locations:

1. **Dedicated page** — `src/pages/{feature}-page/page.tsx` (list view with CRUD)
2. **API service** — `src/services/{feature}.ts` (CRUD functions)
3. **Route** — `src/App.tsx` (register the route)
4. **Sidebar** — `src/layouts/side-bar/dashboard-side-bar/layout.tsx` (add nav entry)
5. **Agent creation form** — `src/pages/agent-form/page.tsx` (Step 3: load configs, add selection UI, include in `engine_config` payload)
6. **Agent edit modal** — `src/components/agent-form-modal/component.tsx` (same as above + extract existing config in edit mode init effect)
7. **Agent dashboard card badges** — `src/components/dashboard/agents/agent-card/feature-icons.tsx` (add detection logic + badge)
8. **i18n** — `src/i18n/locales/*.json` (add translation keys)

Missing any of these will result in the feature being partially integrated (e.g., config exists but can't be assigned to agents, or agents don't show the feature badge).
