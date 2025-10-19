# Idun Engine — Front-end

Short documentation and usage guide for the front-end application.

## Overview

The front-end is a React + TypeScript SPA (Vite) for Idun Engine. It provides the admin interface to manage agents, connected applications, settings, and observability. The project uses reusable components, application hooks/providers, and Storybook for UI development.

## Tech Stack

-   React + TypeScript
-   Vite (dev server / build)
-   styled-components (styles)
-   react-i18next (i18n)
-   Storybook (UI component sandbox)
-   Mockoon (API mocks provided in `mockoon/`)

## Key Structure

-   `src/main.tsx` — application entry point
-   `src/pages/` — application pages (routes)
-   `src/layouts/` — layouts (header, side-bar, data-board, etc.)
-   `src/components/` — reusable components
-   `src/hooks/` — hooks and providers (Loader, Workspace, AgentFile, SettingsPage...)
-   `src/types/` — TypeScript definitions
-   `src/i18n/` — i18n configuration and locale files
-   `src/templates` — component template files
-   `mockoon/` — Mockoon configuration to simulate the local API

## Prerequisites

Before you begin, ensure you have the following installed on your system:

-   **Node.js**: We recommend using the latest LTS version (e.g., `v18.x` or `v20.x`). You can download it from [nodejs.org](https://nodejs.org/).
-   **npm**: This is the Node Package Manager and is included with Node.js. The project is configured to use `npm`, but you can also use `pnpm` or `yarn`.
-   **Docker**: (Optional) If you prefer to run the application in a containerized environment. You can download it from [docker.com](https://www.docker.com/products/docker-desktop).

## Commands (PowerShell)

Install dependencies:

```powershell
npm install
```

Start the development server (Vite):

```powershell
npm run dev
```

Build for production:

```powershell
npm run build
```

Start Storybook:

```powershell
npm run storybook
```

Lint / typecheck (if scripts are present):

```powershell
npm run lint
npm run typecheck
```

> Replace `npm` with `pnpm` or `yarn` if you use another package manager.

## Running via docker-compose (recommended for dev)

- When you start the project with the root `docker-compose.dev.yml`, the frontend container runs `npm ci` inside the container and starts Vite in dev mode with the source mounted as a volume. You do NOT need to install Node packages on your host for the app to run in Docker.

### IDE type-checking (optional but recommended)

- If you want local IntelliSense/TypeScript to work in your editor (outside Docker), install deps once on your host:

```bash
cd services/idun_agent_web
npm ci
```

- Env base URL (optional): create `.env` with `VITE_API_URL=http://localhost:8000` to point to the backend in dev; the code also defaults to `http://localhost:8000` if unset.

## Test Configuration: Using Mockoon

For test configuration, we use [Mockoon](https://mockoon.com/), a tool to simulate a local back-end.

### Installing Mockoon

You can download Mockoon here: [https://mockoon.com/download/](https://mockoon.com/download/)

### Importing and Launching the Configuration

1. Open Mockoon after installation.
2. Import the configuration file `idun-engine-mockoon-config.json` located in the `services/idun_agent_web/mockoon/` folder.
3. Start the mock server in Mockoon to launch the fake back-end.

This allows you to simulate back-end responses during front-end development or testing.

## Storybook — Practical Notes

-   Many components use hooks that require providers (Router, i18n, Loader, Workspace, AgentFile, SettingPage). If a story fails with `useX must be used within a Provider`, provide the provider as a local decorator (`.stories.tsx`) or global (`.storybook/preview.tsx`).
-   To avoid network calls in Storybook, mock `fetch` in the story or provide a wrapper that intercepts `window.fetch`.
-   Lazy components should be rendered with a `Suspense` fallback in stories to avoid rendering errors.

## i18n

-   Initialization: `src/i18n/index.ts`.
-   Locales: `src/i18n/locales/{fr,en,es,de,ru,pt,it}.json`.
-   To add a language: create the JSON file, import and register it in `src/i18n/index.ts` (resources + supportedLngs).

## Mocks / API

-   The front-end calls `http://localhost:4001/api/...`. You can start Mockoon with the configuration provided in `mockoon/idun-engine-mockoon-config.json`.
-   In Storybook, wrappers are often used to intercept `window.fetch` and return test data.

## Common Errors & Quick Fixes

-   `useX must be used within a Provider` — wrap the story/app with the corresponding provider (see `src/hooks/*` for the exact name).
-   Storybook + lazy — add a `Suspense` fallback around the story.
-   Typescript errors — check that values respect unions in `src/types/*` (e.g. `AgentStatus`, `FrameworkType`).

## Contributions & Best Practices

-   Respect TypeScript types.
-   Add/complete stories for each new component.
-   Prefer centralizing common providers in `.storybook/preview.tsx` if several stories need them.

-   Use Plop to generate files (components/pages/layouts/hook): run `npm run plop` and follow the prompt.
    To modify the templates used by Plop, edit the files in `src/templates/*.hbs`.

    Files generated by Plop are automatically sorted by category (e.g. `src/components/...`, `src/pages/...`, `src/layouts/...`, `src/hooks/...`). When a `page` is created via Plop, the generator also modifies `src/App.tsx` to automatically import the page and inject the corresponding route (check the markers `// PLOP_IMPORT` and `/* PLOP_ROUTE */` in `src/App.tsx`).

## Files to Check First

-   `src/main.tsx` — provider mounting in production.
-   `src/i18n/index.ts` — i18n configuration.
-   `src/hooks/` — list of providers to consider for stories.

## Recommended Next Improvements

-   Centralize Storybook decorators in `.storybook/preview.tsx`.
-   Add more complete mock fixtures for Storybook.
-   Complete the `ru` / `pt` translation files with real translations.

---

If you want, I can:

-   automatically add a `.storybook/preview.tsx` with global providers, or
-   enrich the README (story examples, commit conventions, etc.).
