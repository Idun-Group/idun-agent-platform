x# Standalone UI Gap Analysis

Date: 2026-04-26

Scope:

- Compare `services/idun_agent_standalone_ui` with the enterprise `services/idun_agent_web` experience.
- Focus on the gap between chat/admin/traces/logs in the standalone product and the broader manager/web UI.
- Recommend what should stay shared in concept, what should diverge, and what should be improved next.

## Summary

The standalone UI is now good enough to support the new product direction. It is not a mini copy of the enterprise web app. It is a single-agent operator UI:

- Chat with this agent.
- Edit this agent.
- Reload this agent when safe.
- Inspect this agent's traces.
- Deploy this agent.

That is the right constraint. The manager/web UI should remain broader:

- Govern many agents.
- Manage workspaces and members.
- Share resource catalogs.
- Attach resources to agents.
- Serve materialized configs to deployed engines.

The main UI risk is product ambiguity. Some standalone pages look like enterprise admin pages, but the standalone product should not imply it manages a fleet. The UI should consistently speak in singular terms: "this agent", "this deployment", "local traces", "admin password", "restart required."

## Current standalone UI capabilities

### Chat

Implemented:

- `/` chat entry.
- Three layout variants: branded, minimal, inspector.
- AG-UI event parsing through `lib/agui.ts`.
- `useChat` hook with message state, event ring, stop support, text streaming, tool calls, thinking, step-aware opener/plan/thought buffers.
- `MESSAGES_SNAPSHOT` hydration for LangGraph patterns that call `llm.invoke()` and do not emit token deltas.
- Runtime theme values via `window.__IDUN_CONFIG__`.

Strength:

- The chat now handles the dominant LangGraph non-streaming-response pattern.
- Inspector layout is valuable for OSS developers because it shows protocol events without requiring external observability.

Gap:

- Layout-specific responsive coverage is still thin.
- `useChat` is necessarily hand-rolled; it needs clear contract tests whenever AG-UI event semantics change.
- Chat history is local to hook state and traces, not a durable user-facing conversation manager.

Recommendation:

- Keep chat narrow and excellent.
- Add E2E for minimal and inspector layouts.
- Document that conversation state depends on configured memory/checkpointer, not UI local state.

### Admin

Implemented pages:

- Dashboard.
- Agent config.
- Guardrails.
- Memory.
- MCP.
- Observability.
- Prompts.
- Integrations.
- Settings.

Implemented shell:

- Sidebar.
- Topbar.
- Breadcrumbs.
- Theme toggle.
- User menu.
- Command palette in admin layout.
- Sheet-based YAML editor.
- Singleton resource editor pattern.

Strength:

- The standalone admin UI has enough breadth to demonstrate the full productionization promise around a single agent.
- Hot reload/restart-required behavior makes the UI operationally meaningful rather than just CRUD.

Gap:

- Some pages can look like a manager-style catalog but actually edit singleton or local resources.
- Command palette behavior is concentrated in admin layout, not consistently global across traces/logs.
- Auth/security affordances need more explicit copy in password mode.

Recommendation:

- Rename labels where needed to reinforce single-agent scope:
  - "Agent settings" rather than "Agents."
  - "Local MCP servers" rather than "MCP catalog."
  - "Local observability providers" rather than "Observability apps."
  - "Admin access" rather than "Workspace users."
- Use a consistent post-save banner:
  - "Reloaded live."
  - "Saved. Restart required."
  - "Save failed. Running config unchanged."

### Traces

Implemented:

- `/traces` session list.
- `/traces/session` event detail.
- Admin API list, detail, search, and delete.
- Trace event capture from engine observer.
- E2E coverage showing traces appear after a chat turn.

Strength:

- This is one of the strongest standalone differentiators for OSS. A developer can run one agent and debug protocol events locally without Langfuse/Phoenix/LangSmith.

Gap:

- Event ordering is still not fully correct for multi-run sessions because API ordering is by `sequence` only.
- Search is server-side LIKE against event type and JSON payload. This is fine for MVP, but should be labeled as simple search.
- Trace UX is useful but not yet a full run explorer.

Recommendation:

- Fix ordering before release.
- Add grouping by run inside a session.
- Show event counts by type.
- Add copy/export JSON for a trace.
- Add a docs note: local traces are for debugging one standalone agent, not fleet observability.

### Logs

Implemented:

- `/logs` route and layout.

Gap:

- Logs are mock-backed.

Recommendation:

- Either hide the page for MVP or implement a minimal real source.
- If kept, label it "Coming soon" and do not include it in shipped feature claims.

## Current manager/web UI capabilities

The enterprise web app is a broader control plane surface:

- Agent dashboard.
- Agent detail.
- Agent creation/editing.
- Chat playground.
- API integration view.
- Prompt assignment.
- Configuration view.
- Resource pages for memory, MCP, observability, guardrails, SSO, integrations, prompts.
- Workspaces.
- Users/members.
- Settings.
- Onboarding.

The manager backend supports the model the enterprise UI needs:

- Many agents.
- Relational resource associations.
- Materialized `engine_config`.
- Workspaces and members.
- API-key managed mode.
- SSO resources.

Current gap:

- `npm run build` currently fails in `services/idun_agent_web` due existing TypeScript drift.
- The manager/web surface should not be marketed as production-ready enterprise UI until build health is restored.

## Deliberate divergence

The standalone UI should not try to become the manager UI.

### Standalone should own

- Single-agent chat.
- Single-agent local admin.
- Local traces.
- Local deployment settings.
- Local auth mode.
- Runtime theme.
- Reload/restart status.
- Cloud Run and Docker deployment proof.

### Manager/web should own

- Workspaces.
- Users/members.
- RBAC.
- Many agents.
- Fleet dashboards.
- Shared prompt/resource catalogs.
- Agent enrollment.
- Config distribution.
- Enterprise SSO.
- Central governance and audit.

### Shared concepts, not necessarily shared components

The two UIs should share language and schema concepts, but they do not need to share React components immediately.

Share:

- Config vocabulary.
- Provider names.
- Resource type names.
- Reload/restart semantics.
- AG-UI event terms.
- Error wording for failed validation.
- Docs and decision guides.

Avoid premature sharing:

- Layout components.
- Design system implementation.
- Form abstractions.
- Routing assumptions.

Reason:

- Standalone is Next.js static export bundled into a Python wheel.
- Manager web is Vite React with styled-components and generated manager types.
- Forcing component sharing now would likely slow both surfaces and blur product scope.

## Design system gap

Standalone has moved toward shadcn/ui and semantic CSS variables. Manager web still uses styled-components and older dashboard patterns.

Recommendation:

- Do not block standalone release on unifying the design systems.
- Instead, align visual language at the brand/token level:
  - Typography.
  - Primary/accent colors.
  - Badge labels.
  - Empty states.
  - Error/success copy.
  - Navigation naming.
- Later, choose whether manager web migrates toward the standalone shadcn-style system.

## UX copy recommendations

Use singular language in standalone.

Preferred:

- "This agent"
- "Local traces"
- "Admin password"
- "Reload this deployment"
- "Restart required"
- "Deploy this agent"
- "Export config"

Avoid:

- "Workspace"
- "Fleet"
- "Users"
- "Agents"
- "Catalog"
- "Organization"
- "Governance"

Use enterprise language in manager/web.

Preferred:

- "Workspace"
- "Members"
- "Resource catalog"
- "Managed agents"
- "Assign resources"
- "Fleet governance"
- "Materialized config"
- "Enrollment"

## Testing gap

### Standalone UI test status

Passed locally:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e` on rerun without concurrent Next build

Coverage strengths:

- `useChat` hydration.
- Chat input.
- Message rendering.
- Reasoning panel.
- History sidebar.
- Breadcrumbs.
- Topbar.
- Playwright chat/admin/traces smoke.

Coverage gaps:

- Password auth browser flow.
- Failed login.
- Logout.
- Mobile/responsive states.
- Minimal and inspector layouts.
- Theme persistence through save/reload.
- Trace ordering across multiple runs.
- Logs page real data.
- Keyboard navigation and command palette across all shells.

### Manager/web test status

Passed locally:

- Targeted Vitest: `deployment.test.ts`, `agent-fetch.test.ts`, `agents.test.ts`.

Failed locally:

- `npm run build`.

Recommendation:

- Add a manager/web build gate before public enterprise positioning.
- Add at least one manager UI E2E create/edit/enroll path after type health is restored.

## Release priorities

### Must fix before standalone MVP release

1. Trace event ordering.
2. README/docs terminology.
3. Logs page feature claim, either implement or hide.
4. Password-mode E2E.
5. First-run no-LLM quickstart proof.

### Should fix soon after MVP

1. Mobile and responsive layout pass.
2. Trace grouping/export.
3. Theme contract parity tests.
4. Accessibility audit for custom controls.
5. Command palette consistency.

### Enterprise follow-up

1. Fix `idun_agent_web` TypeScript build.
2. Reconcile manager config assembly with docs claims, especially prompts and SSO.
3. Add manager-to-engine integration smoke around materialized config fetch.
4. Decide whether manager web adopts the standalone design system over time.

## Final recommendation

Keep the standalone UI intentionally smaller than the manager UI. Its job is not to show every enterprise concept in miniature. Its job is to make one agent feel complete, inspectable, editable, and deployable.

That constraint is what makes the new product direction easier to understand. Standalone earns OSS trust; Manager earns enterprise scale.
