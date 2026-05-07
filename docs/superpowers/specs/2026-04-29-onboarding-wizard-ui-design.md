# Onboarding Wizard UI Design

> **Sub-project:** C (of A–E from `2026-04-27-idun-onboarding-ux-design.md`)
> **Status:** Locked — ready for implementation plan
> **Depends on:** Sub-project A (`2026-04-28-onboarding-scanner-design.md`, PR #538) and sub-project B (`2026-04-29-onboarding-http-api-design.md`, this branch)
> **Branch:** `feat/onboarding-scanner` (extending the same branch — additive only)

---

## 1. Goal

Build the Next.js wizard UI that consumes sub-project B's three onboarding endpoints. The wizard runs at `/onboarding`, drives the user through the 5-state classification, and lands them on chat with a working agent.

In scope: the wizard pages, the chat-root redirect that triggers it, and the minimal `/login` page that makes password-mode work end-to-end.

Out of scope: the `idun init` CLI (sub-project D), the Driver.js guided tour (sub-project E), the change-password UI, and any traces / logs / settings pages.

## 2. Why

Sub-project B shipped the HTTP layer the wizard needs. Without a UI consumer, the endpoints are unreachable from the browser. The standalone runtime today drops users on `/` with no agent and nothing rendered — this sub-project makes that path successful by guiding the user from "I just ran `idun-standalone`" to "my agent works in the chat UI."

## 3. Out of scope

- `idun init` CLI scaffolder (sub-project D)
- Driver.js post-wizard guided tour (sub-project E)
- Change-password UI (deferred — backend exists, no admin route consumes it yet)
- Logout button (lands with future settings work)
- Theme picker (uses runtime-config theme as-is)
- Active LLM-readiness probe (honor-system reminder text on the done screen — see §4 Q4)

## 4. Locked decisions

These came from brainstorming questions Q1–Q12 and are the foundation for everything below.

| # | Decision |
|---|----------|
| 1 | `/onboarding` dedicated route; chat root redirects on `GET /agent` 404 |
| 2 | Single-page, state-driven wizard (no per-step routes) |
| 3 | MANY_DETECTED uses radio list + separate confirm CTA |
| 4 | LLM readiness: final confirmation screen with honor-system .env reminder; no active probe |
| 5 | Reload-failure: full diagnostic + retry button |
| 6 | Chat root calls `GET /agent`; 404 → `router.replace('/onboarding')` |
| 7 | Password mode → standard `/login` redirect (no auth carveout for onboarding) |
| 8 | Land minimal `/login` UI (form + `?next=` redirect) as part of this sub-project |
| 9 | EMPTY/NO_SUPPORTED: 2 screens (framework picker → name + file-preview confirm) |
| 10 | ONE/MANY_DETECTED: 1 screen each (no second confirm — DB-only writes) |
| 11 | "Re-scan" button on every wizard screen except final Done/error |
| 12 | Bare wizard layout, no chat chrome, themed via runtime config |

## 5. State machine

The wizard is one component holding a step enum and dispatches on it:

```typescript
type WizardStep =
  | { kind: "scanning" }
  | { kind: "scan-result"; data: ScanResponse }
  | { kind: "starter-confirm"; framework: Framework; name: string }
  | { kind: "materializing" }
  | { kind: "done"; agent: AgentRead; framework: Framework; mode: "starter" | "detection" }
  | { kind: "error"; message: string; retry: () => void };
```

Transitions:

```
scanning ──(scan ok, ALREADY_CONFIGURED)──► router.replace('/')
        ──(scan ok, any other state)──► scan-result
        ──(scan 401)──► /login redirect via apiFetch's existing 401 handling

scan-result (EMPTY | NO_SUPPORTED) ──(framework picked)──► starter-confirm
scan-result (ONE_DETECTED | MANY_DETECTED) ──(detection picked)──► materializing
scan-result (any) ──(rescan clicked)──► scanning

starter-confirm ──(confirm clicked)──► materializing
starter-confirm ──(back clicked)──► scan-result (cached scan reused)

materializing ──(2xx)──► done
            ──(409)──► scan-result (toast surfaces the conflict reason)
            ──(500 reload_failed)──► error
            ──(other)──► error

error ──(retry clicked)──► materializing (re-runs same call)
done ──(go-to-chat clicked)──► router.push('/')
```

The tagged union ensures each screen renders only with the data it needs — TypeScript narrows on `kind`.

`mode` on the `done` step is set by the materialize call site so the LLM-readiness reminder picks the right copy: starter mode knows the framework's expected env var name; detection mode falls back to a generic reminder because we don't know which keys the user's code requires.

## 6. Module layout

```
services/idun_agent_standalone_ui/
├── app/
│   ├── page.tsx                          MODIFY: add GET /agent gate; 404 → router.replace('/onboarding')
│   ├── login/page.tsx                    REWRITE: minimal form + ?next= redirect
│   └── onboarding/
│       ├── layout.tsx                    NEW: bare themed shell (logo + step content)
│       └── page.tsx                      NEW: wizard state machine
├── components/
│   └── onboarding/
│       ├── WizardScanning.tsx            NEW: initial scan loading
│       ├── WizardEmpty.tsx               NEW: EMPTY → framework picker (screen 1 of starter flow)
│       ├── WizardNoSupported.tsx         NEW: NO_SUPPORTED → framework picker
│       ├── WizardOneDetected.tsx         NEW: ONE_DETECTED → single-card confirm
│       ├── WizardManyDetected.tsx        NEW: MANY_DETECTED → radio list
│       ├── WizardStarterConfirm.tsx      NEW: screen 2 of starter flow
│       ├── WizardMaterializing.tsx       NEW: loading state during create-* call
│       ├── WizardDone.tsx                NEW: success + .env reminder + Go to chat
│       └── WizardError.tsx               NEW: reload failure + retry
└── lib/api/
    ├── index.ts                          MODIFY: add scan, createFromDetection, createStarter
    └── types/
        └── onboarding.ts                 NEW: wire types
```

### Why the split

- The wizard page owns the state machine; each screen is a presentational component that takes props (the relevant slice of the step plus callbacks). Screens don't reach back into the parent for state.
- `WizardEmpty` and `WizardNoSupported` are separate components even though their forms are similar — the framing copy is different and putting both behind a single conditional adds branching where presentational simplicity matters more.
- The 2-screen starter flow puts the file-preview confirmation in its own component (`WizardStarterConfirm`) so the picker components stay focused.

## 7. API client additions

New file `lib/api/types/onboarding.ts`:

```typescript
import type { AgentRead } from "./agent";

export type OnboardingState =
  | "EMPTY"
  | "NO_SUPPORTED"
  | "ONE_DETECTED"
  | "MANY_DETECTED"
  | "ALREADY_CONFIGURED";

export type Framework = "LANGGRAPH" | "ADK";
export type DetectionConfidence = "HIGH" | "MEDIUM";
export type DetectionSource = "config" | "source" | "langgraph_json";

export interface DetectedAgent {
  framework: Framework;
  filePath: string;
  variableName: string;
  inferredName: string;
  confidence: DetectionConfidence;
  source: DetectionSource;
}

export interface ScanResult {
  root: string;
  detected: DetectedAgent[];
  hasPythonFiles: boolean;
  hasIdunConfig: boolean;
  scanDurationMs: number;
}

export interface ScanResponse {
  state: OnboardingState;
  scanResult: ScanResult;
  currentAgent: AgentRead | null;
}

export interface CreateFromDetectionBody {
  framework: Framework;
  filePath: string;
  variableName: string;
}

export interface CreateStarterBody {
  framework: Framework;
  name?: string;
}
```

Add three methods to `lib/api/index.ts`:

```typescript
scan: () =>
  apiFetch<ScanResponse>(`${ADMIN}/onboarding/scan`, {
    method: "POST",
  }),
createFromDetection: (body: CreateFromDetectionBody) =>
  apiFetch<MutationResponse<AgentRead>>(
    `${ADMIN}/onboarding/create-from-detection`,
    { method: "POST", body: j(body) },
  ),
createStarter: (body: CreateStarterBody) =>
  apiFetch<MutationResponse<AgentRead>>(`${ADMIN}/onboarding/create-starter`, {
    method: "POST",
    body: j(body),
  }),
```

Re-export the new types from `lib/api/index.ts`'s `export * from "./types"` chain (or add an explicit `export * from "./types/onboarding"` if the existing chain doesn't cover it).

## 8. Per-screen UX

All screens share a centered Card on a themed background. Idun logo top-left of the page (in the wizard layout). "Re-scan" link in the card footer except where noted.

### `WizardScanning`
Card with `Skeleton` rows + caption "Scanning your project…". Mounted while `api.scan()` is in flight via TanStack Query.

### `WizardEmpty` (state: EMPTY)
- Title: "Let's create your first Idun agent"
- Body: "We didn't find any Python files in this folder. Pick a framework and we'll scaffold a starter for you."
- Form: shadcn `RadioGroup` with two card-styled radios (LangGraph with "Recommended" badge, ADK)
- Footer: "Continue" (primary, disabled until selection) advances to `starter-confirm`. "Re-scan" link.

### `WizardNoSupported` (state: NO_SUPPORTED)
- Title: "We found Python code, but no supported agent"
- Body: "Idun supports LangGraph and Google ADK. Pick one to scaffold a starter alongside your existing code, or re-scan if you just added an agent."
- Form: same `RadioGroup` shape as WizardEmpty
- Footer: same as WizardEmpty

### `WizardOneDetected` (state: ONE_DETECTED)
- Title: "Found your agent"
- Body: "We detected one agent in this folder."
- Detection card: framework badge, inferred name (large), `filePath:variableName` (mono, smaller), confidence pill if MEDIUM (HIGH stays quiet)
- Footer: "Use this agent" (primary) → `materializing`. "Re-scan" link.

### `WizardManyDetected` (state: MANY_DETECTED)
- Title: "Pick your agent"
- Body: "We found {N} agents in this folder. Choose one — Idun runs one agent per install."
- Form: `RadioGroup` with one row per detection. Each row: framework badge, inferred name, `filePath:variableName` (mono), MEDIUM-confidence pill if applicable.
- Sort: `confidence` desc → `framework` (LANGGRAPH first) → `inferredName` asc.
- Footer: "Use selected agent" (primary, disabled until selection) → `materializing`. "Re-scan" link.

### `WizardStarterConfirm` (starter flow screen 2)
- Title: "Confirm your starter"
- Body: "We'll create the following files in your project:"
- File list: `agent.py`, `requirements.txt`, `.env.example`, `README.md`, `.gitignore`. Each row has a small `lucide-react` File icon and a mono name.
- Form: `Input` for agent name (optional, placeholder "Starter Agent"). Validation: 1-80 chars if provided.
- Footer: "Create starter" (primary) → `materializing`. "Back" link → returns to `scan-result`. "Re-scan" link.

### `WizardMaterializing`
Card with `Skeleton` + caption "Creating your agent…". Re-scan link hidden during the call to prevent stale clicks. Typical duration: 1-3s (DB write + reload pipeline).

### `WizardDone`
- Title: `"{agentName} is ready"`
- Body: two-row readout — Framework (badge), Source (`baseEngineConfig.agent.config.{graph_definition|agent}` mono).
- Reload status: small line "Reload: reloaded" (or "restart_required" with a hint about restart).
- `Alert` (warn-tone) — env reminder text varies by mode:
  - **starter + LANGGRAPH:** "Set `OPENAI_API_KEY` in your environment before chatting. Copy `.env.example` to `.env` and fill it in, then restart `idun-standalone`."
  - **starter + ADK:** same with `GOOGLE_API_KEY`.
  - **detection (any framework):** "Make sure your agent's environment variables are set before chatting."
- Footer: "Go to chat" (primary) → `router.push('/')`.

### `WizardError`
- Title: "Something went wrong"
- `Alert` (destructive-tone): echoes `error.message` verbatim. If `error.code === "reload_failed"`, append: "Edit your `agent.py` to fix the issue, then click Retry."
- Footer: "Retry" (primary) re-runs the same materialize call. "Back to wizard" link returns to `scan-result`.

### Re-scan behavior

The "Re-scan" link invalidates the `["onboarding-scan"]` TanStack Query key. The wizard page sees the query reset to loading state and re-mounts `WizardScanning`. Any user input on the previous screen (a picked detection, a typed name) is discarded — a re-scan is a hard refresh.

## 9. Login page

Single page, single form. Same bare themed shell as the wizard.

- Title: "Sign in"
- Body: "Enter the admin password to manage this Idun deployment."
- Form (react-hook-form + zod):
  - `password: z.string().min(1, "Required")`
  - Submit calls `api.login(password)`.
  - Success → `router.replace(searchParams.get('next') ?? '/')`.
  - 401 → `toast.error("Wrong password")`, clear field. No detail leak — backend already collapses bad-password and missing-row to the same 401 (per anti-enumeration design).
  - Network/other error → generic toast.
- Footer: "Sign in" button (primary, full-width).

The shared `apiFetch` wrapper at `lib/api/client.ts` already redirects to `/login` on 401 and includes `?next=` carrying the originally-requested path. No new logic needed in the wizard page itself; the redirect just happens.

## 10. Routing flow

```
User runs idun-standalone, browser hits /
└─ app/page.tsx mounts
   └─ calls api.getAgent()
      ├─ 200 → render existing chat layouts (BrandedLayout / MinimalLayout / InspectorLayout per runtime config)
      ├─ 404 → router.replace('/onboarding')
      └─ 401 → apiFetch redirects to /login?next=%2F (then loops back here)

/onboarding mounts
└─ app/onboarding/page.tsx mounts
   └─ TanStack Query fires api.scan()
      ├─ 200, state ALREADY_CONFIGURED → router.replace('/')
      ├─ 200, other state → render screen
      └─ 401 → apiFetch redirects to /login?next=%2Fonboarding

/login mounts
└─ user submits password
   └─ api.login(password)
      ├─ 200 → router.replace(?next ?? '/')
      └─ 401 → toast + retry
```

Auth is handled identically to every other admin route: the dependency in `apiFetch` redirects on 401, no per-page logic.

## 11. Theming

The wizard layout (`app/onboarding/layout.tsx`) wraps the page in the same `ThemeLoader`-driven shell that the chat root already uses for runtime-config-driven CSS variables. No theme-mutation UI in this sub-project — the wizard inherits whatever the runtime-config bootstrap provides.

The bare layout means: no sidebar, no top-bar nav, no chat-related chrome. Just the logo, the centered card, and the themed background. Login uses the same shell.

## 12. Concurrency and edge cases

### Re-scan after partial materialize

Not reachable in the happy path because the wizard transitions to `materializing` (which hides re-scan). If a user manages to trigger a re-scan after a successful materialize (e.g., browser back from `done`), the next scan returns ALREADY_CONFIGURED and the wizard auto-redirects to `/`. Handled.

### Already-configured race

Two browser tabs run the wizard concurrently:
1. Both call `/scan` → both see EMPTY.
2. Tab A picks a starter, advances to `materializing`, succeeds.
3. Tab B is still on the picker, picks LangGraph, advances to `materializing`, fails with 409 conflict.
4. Per the state machine, 409 routes Tab B back to `scan-result` (with a toast).
5. The next `/scan` (on tab B's automatic re-mount or manual click) returns ALREADY_CONFIGURED → tab B redirects to `/`.

Acceptable. The backend's two-stage check (outer pre-check + inner mutex re-check from sub-project B's T6 fix) prevents both inserts from succeeding.

### Reload failure recovery

`/create-starter` writes 5 files BEFORE the reload step. If reload fails, the files persist but the agent row is rolled back (per spec §5.3 of sub-project B). The wizard's error screen shows the diagnostic; on Retry, the materialize call re-runs:
- For starter: the scaffolder pre-check sees existing files and returns 409 `scaffold_conflict` → wizard goes back to scan-result. The user must manually reconcile (delete or edit the partial files) before re-trying.
- For detection: the materialize is idempotent against re-scan, so Retry just runs again. If the underlying issue (e.g., import error in `agent.py`) is unfixed, it'll fail the same way.

The `WizardError` screen's "Back to wizard" link is the escape hatch for both cases.

### Browser refresh mid-wizard

The user refreshes during `starter-confirm` (after picking a framework, before clicking Create). The page re-mounts, re-scans, and lands on whatever state the project is in now. The user's framework pick is lost; they re-pick. Acceptable for a 30-second flow.

## 13. Testing strategy

### Unit tests (Vitest + React Testing Library)

`__tests__/lib/api/onboarding.test.ts` (~6 tests):
- `api.scan()` calls the right endpoint with no body.
- `api.createFromDetection` and `api.createStarter` post typed bodies, parse `MutationResponse<AgentRead>`.
- 401 from any onboarding endpoint triggers the existing `/login` redirect (smoke test against the shared client wrapper).
- 409 envelope parses to `ApiError` with the right code.
- 500 reload_failed envelope parses to `ApiError` with `code: "reload_failed"`.

`__tests__/components/onboarding/Wizard*.test.tsx` (~16 tests across 9 components):
- Each picker-style screen: renders options, "Continue/Use" disabled until selection, fires the right callback with the selected value.
- Confidence pill rules: HIGH hides, MEDIUM shows.
- Sort order in MANY_DETECTED.
- File-preview list in StarterConfirm matches the 5 expected files.
- Done screen: framework-correct env reminder for starter mode; generic reminder for detection mode.
- Error screen: reload_failed appends recovery hint; other errors don't.

`__tests__/app/login.test.tsx` (~4 tests):
- Renders form; submit calls `api.login` with the typed password.
- Success → redirects to `?next=` (default `/`).
- 401 → toast.error fires, field cleared.
- Empty submit shows validation error, doesn't call API.

`__tests__/app/page-redirect.test.tsx` (~2 tests):
- 200 from `getAgent` → renders chat layout (smoke).
- 404 from `getAgent` → calls `router.replace('/onboarding')`.

Total unit tests: ~28.

### E2E tests (Playwright)

`e2e/onboarding.spec.ts` — 7 flows:
1. Empty project → user picks LangGraph → confirms scaffold → done shows OPENAI_API_KEY reminder.
2. One detection → user clicks "Use this" → done shows generic env reminder.
3. Many detections → user picks the second → confirms → done.
4. Already configured → wizard auto-redirects to `/`.
5. Reload failure → error screen with diagnostic + Retry → second attempt 200 → done.
6. Re-scan: EMPTY → user clicks Re-scan → backend returns ONE_DETECTED → screen flips.
7. Login redirect (password mode): `/onboarding` 401 → `/login` → submit → back to `/onboarding`.

### Test infrastructure

- Component tests: standard `render(<Wizard... />)` with mocked props. No router needed; the parent owns transitions.
- Page-redirect test: mock `next/navigation`'s `useRouter`, assert on `router.replace` calls.
- E2E: route mocking via Playwright (matches existing `e2e/` pattern).
- Reuse the existing `vitest.config.ts` and `playwright.config.ts` — no new config.

### Out of scope for this layer's tests

- Backend behavior (sub-project B's 47 tests cover it).
- TanStack Query internals (trust the library).
- Theme application (existing `ThemeLoader` covers it).
- Chat flow post-wizard (chat already works; no regression risk introduced here).

## 14. Future work (deferred)

- Driver.js post-wizard guided tour (sub-project E) — kicks off after the user clicks "Go to chat" once.
- Logout button + change-password UI — settings work, separate sub-project.
- Active LLM-readiness probe — would replace the honor-system reminder on Done with a real "we tested your key" check. Needs a new backend endpoint.
- Theme picker on login — currently inherits runtime-config theme.

## 15. Open questions

None at time of locking.
