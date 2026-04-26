# Editorial Chat + shadcn Admin UI Redesign — Design Spec

**Status:** Shipped — 2026-04-26

**Goal:** Redesign the standalone chat UI to a premium editorial aesthetic with collapsible reasoning, and rebuild the admin UI on shadcn/ui primitives — without breaking the runtime-config theme system or the three named chat layouts in the original MVP spec (D5).

**References:**
- Chat: `Idun-Group/customer-service-adk/web` — single-column editorial layout, cream + terracotta palette, Fraunces serif headlines, Geist body, halo + grain finishes, ReasoningPanel with plan / thoughts / tool calls.
- Admin: `satnaing/shadcn-admin` — collapsible shadcn Sidebar + topbar with breadcrumbs, Cmd-K command palette, dark-mode toggle, avatar dropdown. Heavy use of shadcn primitives.

---

## 1. Design tokens

Adopt shadcn's semantic CSS variable naming so the same tokens drive both shadcn primitives and our hand-rolled chat surfaces. Drop the existing `--color-primary/--color-bg/--color-fg/--color-muted/--color-border` set (no consumers outside this UI).

**Variables exposed via `:root` and `.dark`:**

```
--background, --foreground
--card, --card-foreground
--popover, --popover-foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive, --destructive-foreground
--border, --input, --ring
--radius
--font-sans, --font-serif, --font-mono
```

Plus chat-specific aliases:
```
--canvas (page bg with cream tone — same as --background by default)
--ink (heaviest text — same as --foreground by default)
--rule (hairlines — same as --border by default)
```

**Light theme defaults (editorial):**
- background / canvas: `#f7f6f0`
- card: `#ffffff`
- foreground / ink: `#1d1c1a`
- muted: `#f0eee2`
- muted-foreground: `#6b6a65`
- border / rule: `#e7e4d7`
- primary: `#1d1c1a` (ink as the primary action)
- accent: `#c96442` (terracotta)
- destructive: `#dc2626`
- ring: `#c96442/40`

**Dark theme defaults:** custom dark palette in the same hue family — slate-warm canvas, deep ink, terracotta accent retained for warmth.

**Fonts:** Geist (sans), Fraunces (serif), system mono. Loaded via `next/font/google` so they're inlined into the static export and don't block on Google Fonts at runtime.

---

## 2. Chat UI

### 2.1 Welcome state (first paint, no messages)

Centered logo (theme-driven `logo.imageUrl` falling back to `logo.text`) + serif headline `Hello, *welcome* to your {appName}` (italic on "welcome" in the accent color) + composer pill + halo. Halo and grain rendered as CSS pseudo-elements (no extra DOM). Welcome elements fade in via `welcome-reveal` keyframes (0.05s / 0.18s / 0.32s / 0.46s staggered).

### 2.2 Active state (one or more messages)

- **Header:** 720px wide, hairline rule below, IdunMark logo, "New conversation" pill button, optional account chip and sign-out button (when `auth_mode === "password"`).
- **Thread:** 720px column, 6-unit vertical rhythm, scroll-fade mask on top + bottom 24px.
- **User message:** dark ink bubble, rounded-2xl with `rounded-tr-md`, right-aligned, max-width 78%, soft shadow.
- **Assistant message:** avatar (logo/IdunMark in a surface ring) + content column with:
  - **Opener** — short markdown line (mapped from STEP_STARTED:`acknowledge`).
  - **ReasoningPanel** — collapsible card; header shows current verb ("Thinking…", "Planning", "Reasoning · 3 steps") + pulse-dot when streaming. Body shows Plan, Thoughts (italic), Tool calls (numbered rows with status dot + name + one-liner preview, expandable to syntax-highlighted code + result).
  - **Body** — markdown via react-markdown + remark-gfm, in a `prose-chat` class with editorial typography (Fraunces headings, ink body, accent links, ink code blocks).
- **Composer:** full-width pill within the 720px column, terracotta accent on send button, ENTER submits / Shift+ENTER newlines, disabled while streaming, "Stop" mode while streaming.

### 2.3 ReasoningPanel content model

Maps current AG-UI events to:
- `opener` (string): TEXT_MESSAGE_CONTENT during STEP_STARTED:`acknowledge`
- `plan` (string): TEXT_MESSAGE_CONTENT during STEP_STARTED:`planner`/`analyst`
- `thoughts` (string): THINKING_TEXT_MESSAGE_CONTENT
- `toolCalls`: TOOL_CALL_START / _ARGS / _END / _RESULT
- `body` (string): TEXT_MESSAGE_CONTENT during STEP_STARTED:`responder` or no STEP scope

`useChat` already buffers most of this — extend its `Message` type with `opener?`, `plan?`, `thoughts?`, `currentStep?` and route deltas based on the current STEP.

The panel is collapsed by default once the run finishes; open by default while streaming.

### 2.4 Three layouts (D5 preserved)

All three layouts share: tokens, fonts, scroll-fade, halo (welcome only), hairlines, MessageView, ReasoningPanel, ChatInput, prose-chat.

- **Branded** (default): full editorial shell — left HistorySidebar (300px) + main 720px column + welcome hero. Logo top-left of the sidebar; chat header floats above the thread.
- **Minimal** (embed): no sidebar, no halo, simpler header (no "New conversation" button), 720px column on plain background. Same MessageView + ReasoningPanel.
- **Inspector** (developer): 3-column grid `[260px_1fr_320px]` — sessions left, chat middle, raw event ring right. Reskinned with editorial palette + hairlines; right rail keeps its purpose (raw AG-UI event timeline) but uses the same typography as the rest.

### 2.5 New / refactored chat components

```
components/chat/
  WelcomeHero.tsx          NEW   empty-state hero (logo + serif headline + composer + halo)
  MessageView.tsx          NEW   replaces ChatMessage; user vs assistant routing, owns avatar + ReasoningPanel + body
  ReasoningPanel.tsx       NEW   collapsible reasoning surface
  ToolCallRow.tsx          NEW   single tool call row inside ReasoningPanel
  HistorySidebar.tsx       NEW   replaces SessionList; serif "History" header, shimmer skeletons, relative time, "+ New"
  ChatInput.tsx            REFACTOR   composer pill with terracotta send + Stop button while streaming
  BrandedLayout.tsx        RESKIN
  MinimalLayout.tsx        RESKIN
  InspectorLayout.tsx      RESKIN
  EmptyState.tsx           DELETE (folded into WelcomeHero)
  HeaderActions.tsx        REFACTOR (account chip + sign-out)
  SessionList.tsx          DELETE
  SessionSwitcher.tsx      DELETE (functionality lives in HistorySidebar)
```

### 2.6 New CSS utilities (`app/globals.css`)

`.scroll-fade`, `.hairline`, `.halo`, `.shimmer`, `.welcome-reveal`, `.prose-chat`, `.chat-code`, `.pulse-dot`. Keyframes: `riseIn`, `breathe`, `pulse`, `shimmer`, `fadeIn`. Plus the grain noise as a base64 SVG bound to `--grain` and applied to `body::before`.

---

## 3. Admin UI

### 3.1 shadcn primitives to install

Via `pnpm dlx shadcn@latest add`:

`button card input label textarea select switch checkbox radio-group form tabs accordion separator scroll-area sheet dialog popover tooltip dropdown-menu command sidebar table badge avatar alert sonner skeleton`

The shadcn `Sidebar` component replaces our hand-rolled `components/admin/Sidebar.tsx`.

### 3.2 Admin shell

```
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <Topbar>
      <SidebarTrigger />
      <Breadcrumbs />        // parsed from pathname
      <GlobalCommand />      // Cmd+K palette
      <ThemeToggle />        // light/dark/system via next-themes
      <UserMenu />           // logout, change password, profile
    </Topbar>
    <main>{page}</main>
  </SidebarInset>
</SidebarProvider>
```

**Sidebar sections (collapsible, with Lucide icons):**
- **Overview** — Dashboard `/admin/`, Traces `/traces/`, Logs `/logs/`
- **Agent** — Configuration, Guardrails, Memory, MCP, Observability, Prompts, Integrations
- **System** — Settings (Profile / Appearance / Layout / Password)

Active route highlighted via shadcn `SidebarMenuButton`'s `isActive`. User avatar at the bottom with logout.

### 3.3 Page templates

**Singleton config pages** (Agent, Guardrails, Memory, MCP, Observability, Prompts, Integrations):
- `<Card>` with page header + description.
- `<Tabs>` per provider/sub-config (Agent: LangGraph / ADK; Memory: in-memory / SQLite / Postgres).
- `<Form>` with `react-hook-form` + zod resolvers; fields use shadcn `Input`, `Select`, `Switch`, `Textarea`.
- "Edit YAML" button opens a `<Sheet>` (right side) with the existing Monaco editor; saving the sheet writes the structured form fields back via parse → `form.reset(parsed)`.
- Save toolbar at bottom of card: shadcn `<Button>` + status indicator + "Restart required" `<Alert>` when the structural change is detected.

**Settings page:** top-level `<Tabs>` for Profile / Appearance / Layout / Password.
- Profile: read-only username, last login.
- Appearance: theme toggle (light/dark/system), accent color picker, logo URL/text, app name, greeting.
- Layout: chat layout switcher (Branded / Minimal / Inspector) with preview thumbnails.
- Password: current + new + confirm with zod validation; calls existing `/admin/api/v1/auth/password` endpoint.

**Traces sessions list:** `<Table>` with sortable columns + search input + per-row "Open" → opens a `<Sheet>` (full height, ~70% width) with the timeline + event detail; existing `?search=` API param wired to the search box.

**Logs:** `<Table>` with auto-scroll to bottom + search filter; level tags as `<Badge>` (info/warn/error variants).

### 3.4 Command palette (Cmd-K)

Shadcn `<Command>` dialog. Sections:
- **Pages** — every admin route
- **Recent traces** — top 10 sessions (cached from /admin/api/v1/traces)
- **Actions** — "Reload config", "Switch theme (light/dark)", "Sign out", "Open chat"

Triggered globally with Cmd+K / Ctrl+K via a keyboard listener in `Topbar`.

---

## 4. Theme system

### 4.1 Runtime-config schema (`lib/runtime-config.ts`)

```ts
type ThemeColors = {
  background: string; foreground: string;
  card: string; cardForeground: string;
  popover: string; popoverForeground: string;
  primary: string; primaryForeground: string;
  secondary: string; secondaryForeground: string;
  muted: string; mutedForeground: string;
  accent: string; accentForeground: string;
  destructive: string; destructiveForeground: string;
  border: string; input: string; ring: string;
};

type ThemeConfig = {
  appName: string;
  greeting: string;
  starterPrompts: string[];
  logo: { text: string; imageUrl?: string };
  layout: "branded" | "minimal" | "inspector";
  colors: { light: ThemeColors; dark: ThemeColors };
  radius: string;
  fontSans: string;
  fontSerif: string;
  fontMono: string;
  defaultColorScheme: "light" | "dark" | "system";
};
```

Backend `theme/runtime_config.py` ships the editorial palette as `DEFAULT_THEME`.

### 4.2 ThemeLoader

`ThemeLoader` writes every variable to `:root` (light) and to `.dark` scope (dark). `next-themes` provider wraps the app so the `dark` class is toggled based on user pref / system / theme override.

Admin `ThemeToggle` calls `setTheme("light" | "dark" | "system")` from `next-themes`.

---

## 5. Folder layout (target)

```
services/idun_agent_standalone_ui/
  app/
    layout.tsx
    page.tsx
    login/page.tsx
    admin/
      layout.tsx
      page.tsx
      agent/page.tsx
      guardrails/page.tsx
      memory/page.tsx
      mcp/page.tsx
      observability/page.tsx
      prompts/page.tsx
      integrations/page.tsx
      settings/page.tsx
    traces/
      page.tsx
      [id]/page.tsx
    logs/page.tsx
    globals.css
  components/
    ui/                  // shadcn primitives (~25 files)
    chat/
      WelcomeHero.tsx
      MessageView.tsx
      ReasoningPanel.tsx
      ToolCallRow.tsx
      HistorySidebar.tsx
      ChatInput.tsx
      BrandedLayout.tsx
      MinimalLayout.tsx
      InspectorLayout.tsx
      HeaderActions.tsx
    admin/
      AppSidebar.tsx
      Topbar.tsx
      Breadcrumbs.tsx
      GlobalCommand.tsx
      ThemeToggle.tsx
      UserMenu.tsx
      AuthGuard.tsx
      EditYamlSheet.tsx
      JsonEditor.tsx       // unchanged, used inside sheets
      YamlEditor.tsx       // unchanged
      SingletonEditor.tsx  // unchanged
      SaveToolbar.tsx      // refactored to shadcn Button
    common/
      ComingSoonBadge.tsx
  lib/
    api.ts
    use-chat.ts            // extended with opener/plan/thoughts
    runtime-config.ts      // extended ThemeConfig
    theme-loader.tsx
    use-theme.ts           // wrapper around next-themes
    fonts.ts               // next/font definitions
    utils.ts               // cn() (already exists)
    agui.ts
    use-auth.ts
    query-client.tsx
```

---

## 6. Backwards compatibility & migration

- D5 layouts preserved (3 named layouts).
- Runtime-config still drives theme; old field names removed (no consumers outside this UI).
- Backend `theme/runtime_config.py` ships new `DEFAULT_THEME` matching the editorial palette.
- `idun-standalone init` template scaffold updated to the new theme defaults.
- Admin API endpoints unchanged (theme persistence still uses the same shape — just with new fields).

---

## 7. Out of scope

- Mobile responsiveness audit (phase 2). Responsive Tailwind classes are used everywhere but a full mobile pass is post-MVP.
- New traces/logs analytics features. Reskin only.
- Replacing Monaco. Sheet-based YAML editor still uses Monaco.
- I18n. Existing strings stay English.

---

## 8. Acceptance criteria

- All three chat layouts render the new editorial palette with Geist + Fraunces fonts and the halo/grain finishes on welcome.
- Assistant messages render the ReasoningPanel with collapsible plan/thoughts/tool-calls; tool call code blocks are syntax-highlighted.
- Admin shell uses the shadcn `Sidebar` (collapsible) + topbar with breadcrumbs, Cmd-K command palette, theme toggle, and user menu.
- All admin singleton pages use shadcn `<Card>` + `<Tabs>` + `<Form>` + Sheet-based YAML edit.
- Traces and logs pages use shadcn `<Table>` and `<Sheet>` for detail.
- Light/dark mode switches cleanly via `next-themes`; runtime-config theme overrides shadcn variables.
- Lint, typecheck, Vitest, and Playwright E2E all pass.
- Static export builds; standalone wheel boots and serves the redesigned UI.
