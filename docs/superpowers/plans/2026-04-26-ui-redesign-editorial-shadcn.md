# Editorial Chat + shadcn Admin UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the editorial chat reskin and the shadcn-driven admin redesign per the spec at `docs/superpowers/specs/2026-04-26-ui-redesign-editorial-shadcn-design.md`.

**Architecture:** Tailwind v4 with shadcn semantic CSS variables driven by runtime-config. Geist + Fraunces fonts via `next/font`. `next-themes` provider for dark mode. Three chat layouts share tokens, fonts, and the new MessageView/ReasoningPanel/HistorySidebar components but keep their distinct chrome. Admin uses the shadcn Sidebar + Topbar (Cmd-K command palette + theme toggle + user menu) and rebuilds every page on `<Card>` + `<Tabs>` + `<Form>` + `<Sheet>` patterns.

**Tech stack:** Next 15 + React 19 + Tailwind v4, shadcn/ui (RadixUI primitives), next-themes, react-hook-form + zod, react-markdown + remark-gfm + react-syntax-highlighter, Lucide icons, Monaco (existing).

---

## Wave A — Foundation

### Task A1: Fonts, design tokens, and globals.css

**Files:**
- Create: `services/idun_agent_standalone_ui/lib/fonts.ts`
- Modify: `services/idun_agent_standalone_ui/app/layout.tsx`
- Replace: `services/idun_agent_standalone_ui/app/globals.css`

- [ ] **Step 1: Create `lib/fonts.ts`**

```ts
import { Geist, Fraunces, Geist_Mono } from "next/font/google";

export const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const fontSerif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  axes: ["opsz"],
  display: "swap",
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
```

- [ ] **Step 2: Wire fonts into `app/layout.tsx`** — add `${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}` to `<html>` className and ensure `font-sans` is set on `<body>`.

- [ ] **Step 3: Replace `app/globals.css`**

```css
@import "tailwindcss";

@plugin "tailwindcss-animate";

@custom-variant dark (&:is(.dark *));

:root {
  --background: #f7f6f0;
  --foreground: #1d1c1a;
  --card: #ffffff;
  --card-foreground: #1d1c1a;
  --popover: #ffffff;
  --popover-foreground: #1d1c1a;
  --primary: #1d1c1a;
  --primary-foreground: #f7f6f0;
  --secondary: #f0eee2;
  --secondary-foreground: #1d1c1a;
  --muted: #f0eee2;
  --muted-foreground: #6b6a65;
  --accent: #c96442;
  --accent-foreground: #ffffff;
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --border: #e7e4d7;
  --input: #e7e4d7;
  --ring: rgba(201, 100, 66, 0.4);
  --radius: 0.625rem;

  --canvas: var(--background);
  --ink: var(--foreground);
  --rule: var(--border);

  --grain: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.dark {
  --background: #15140f;
  --foreground: #f5f4ec;
  --card: #1d1c1a;
  --card-foreground: #f5f4ec;
  --popover: #1d1c1a;
  --popover-foreground: #f5f4ec;
  --primary: #f5f4ec;
  --primary-foreground: #15140f;
  --secondary: #2a2925;
  --secondary-foreground: #f5f4ec;
  --muted: #2a2925;
  --muted-foreground: #a1a097;
  --accent: #d97757;
  --accent-foreground: #15140f;
  --destructive: #ef4444;
  --destructive-foreground: #f5f4ec;
  --border: #2a2925;
  --input: #2a2925;
  --ring: rgba(217, 119, 87, 0.5);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-canvas: var(--canvas);
  --color-ink: var(--ink);
  --color-rule: var(--rule);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);
}

html, body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans, ui-sans-serif, system-ui);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: var(--grain);
  opacity: 0.04;
  pointer-events: none;
  z-index: 1;
  mix-blend-mode: multiply;
}

.prose-chat p { margin: 0.4em 0; }
.prose-chat ul, .prose-chat ol { margin: 0.4em 0 0.4em 1.2em; }
.prose-chat h1, .prose-chat h2, .prose-chat h3 {
  font-family: var(--font-serif), Georgia, serif;
  font-weight: 500; margin-top: 0.8em; margin-bottom: 0.3em; letter-spacing: -0.01em;
}
.prose-chat h1 { font-size: 1.4rem; }
.prose-chat h2 { font-size: 1.18rem; }
.prose-chat h3 { font-size: 1.05rem; }
.prose-chat code { background: var(--muted); padding: 0 4px; border-radius: 3px; font-size: 0.9em; }
.prose-chat pre { background: var(--ink); color: var(--canvas); padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; }
.prose-chat pre code { background: transparent; padding: 0; }
.prose-chat a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.prose-chat table { border-collapse: collapse; margin: 0.6em 0; }
.prose-chat th, .prose-chat td { border: 1px solid var(--rule); padding: 4px 8px; text-align: left; }
.prose-chat th { background: var(--muted); }
.prose-chat blockquote { border-left: 3px solid var(--accent); padding-left: 10px; color: var(--muted-foreground); margin: 0.5em 0; }

.chat-code { font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.78rem; }

.scroll-fade {
  mask-image: linear-gradient(to bottom, transparent, black 24px, black calc(100% - 24px), transparent);
}

.pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }

.shimmer {
  background: linear-gradient(90deg, var(--muted) 0%, var(--card) 50%, var(--muted) 100%);
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.welcome-reveal > * { animation: riseIn 0.75s cubic-bezier(0.16, 1, 0.3, 1) both; }
.welcome-reveal > *:nth-child(1) { animation-delay: 0.05s; }
.welcome-reveal > *:nth-child(2) { animation-delay: 0.18s; }
.welcome-reveal > *:nth-child(3) { animation-delay: 0.32s; }
.welcome-reveal > *:nth-child(4) { animation-delay: 0.46s; }
@keyframes riseIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.halo {
  position: absolute;
  inset: -30% -10% auto -10%;
  height: 440px;
  background:
    radial-gradient(40% 60% at 50% 40%, color-mix(in oklab, var(--accent) 15%, transparent), transparent 70%),
    radial-gradient(60% 80% at 50% 60%, color-mix(in oklab, var(--accent) 6%, transparent), transparent 75%);
  filter: blur(18px);
  pointer-events: none;
  z-index: 0;
  animation: breathe 9s ease-in-out infinite;
}
@keyframes breathe { 0%,100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.05); opacity: 1; } }

.hairline {
  background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--ink) 18%, transparent), transparent);
  height: 1px;
}
```

- [ ] **Step 4: Run `pnpm typecheck && pnpm build`** — verify Tailwind v4 picks up the new tokens. Commit.

```bash
cd services/idun_agent_standalone_ui && pnpm typecheck && pnpm build
git add lib/fonts.ts app/layout.tsx app/globals.css
git commit -m "feat(ui): adopt editorial design tokens + Geist/Fraunces fonts"
```

---

### Task A2: Runtime-config schema + backend defaults + ThemeLoader

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/runtime-config.ts`
- Modify: `services/idun_agent_standalone_ui/lib/theme-loader.tsx`
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/theme/runtime_config.py`

- [ ] **Step 1: Replace `lib/runtime-config.ts` `ThemeColors` and `ThemeConfig` with the spec §4.1 shape.** Keep `getRuntimeConfig()` and `DEFAULT_RUNTIME_CONFIG` exports; the default `colors` object holds the editorial palette light/dark from the spec §1.

- [ ] **Step 2: Rewrite `lib/theme-loader.tsx`** to write every shadcn variable from `theme.colors.light` to `:root` and `theme.colors.dark` to `.dark`. Also write `--font-sans/--font-serif/--font-mono` and `--radius`.

- [ ] **Step 3: Update backend `theme/runtime_config.py`** `DEFAULT_THEME` Pydantic model to match the new shape and ship the editorial palette as the default. Add fields, drop the legacy ones. Update any tests that assert on the default theme.

- [ ] **Step 4: Run backend tests** — `uv run pytest libs/idun_agent_standalone/tests -q` — fix any default-theme assertions. Commit.

---

### Task A3: Install shadcn/ui CLI + primitives + replace hand-rolled UI components

**Files:**
- Create: `services/idun_agent_standalone_ui/components.json`
- Add (via CLI): `services/idun_agent_standalone_ui/components/ui/{button,card,input,label,textarea,select,switch,checkbox,radio-group,form,tabs,accordion,separator,scroll-area,sheet,dialog,popover,tooltip,dropdown-menu,command,sidebar,table,badge,avatar,alert,sonner,skeleton}.tsx`
- Delete: `services/idun_agent_standalone_ui/components/ui/{Badge,Button,Card,Input,Textarea}.tsx`

- [ ] **Step 1: Initialize shadcn**

```bash
cd services/idun_agent_standalone_ui
pnpm dlx shadcn@latest init -d --base-color neutral --style default
```

Edit the resulting `components.json` to set `aliases.utils = "@/lib/utils"` and `tailwind.cssVariables = true`.

- [ ] **Step 2: Add primitives**

```bash
pnpm dlx shadcn@latest add -y button card input label textarea select switch checkbox radio-group form tabs accordion separator scroll-area sheet dialog popover tooltip dropdown-menu command sidebar table badge avatar alert sonner skeleton
```

- [ ] **Step 3: Update all imports** — find every `import { Button } from "@/components/ui/Button"` (and the other 4) and replace with the lowercase shadcn paths (`@/components/ui/button` etc.). Then delete the 5 old PascalCase files.

- [ ] **Step 4: Add cmdk + react-syntax-highlighter + next-themes**

```bash
pnpm add react-syntax-highlighter next-themes
pnpm add -D @types/react-syntax-highlighter
```

- [ ] **Step 5: Wire `next-themes` into `app/layout.tsx`** — wrap the app in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`. Make sure `ThemeLoader` runs *inside* the provider so runtime CSS variables stack on top of the dark/light class.

- [ ] **Step 6: Run typecheck + build + commit.**

---

## Wave B — Chat reskin

### Task B1: Extend `useChat` with opener / plan / thoughts buffers

**Files:**
- Modify: `services/idun_agent_standalone_ui/lib/use-chat.ts`
- Modify: `services/idun_agent_standalone_ui/lib/agui.ts` (Message type)
- Test: `services/idun_agent_standalone_ui/__tests__/use-chat.test.ts`

- [ ] **Step 1: Extend `Message` type** — add `opener?: string`, `plan?: string`, `thoughts?: string`, `currentStep?: string`, `streaming?: boolean`.

- [ ] **Step 2: Track `currentStep` in `useChat`** — handle `STEP_STARTED` / `STEP_FINISHED`. Route `TEXT_MESSAGE_CONTENT` deltas based on step:
  - `acknowledge` → `opener`
  - `planner` / `analyst` → `plan`
  - `responder` or no step → `text`
- [ ] **Step 3: Map `THINKING_TEXT_MESSAGE_CONTENT` → `thoughts`** (additive). `THINKING_END` clears `thinking` flag.

- [ ] **Step 4: Add a Vitest test** asserting that a fake stream (acknowledge + planner + responder) populates `opener`, `plan`, `text` correctly. Run, fix, commit.

---

### Task B2: WelcomeHero + HistorySidebar

**Files:**
- Create: `services/idun_agent_standalone_ui/components/chat/WelcomeHero.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/HistorySidebar.tsx`
- Delete: `services/idun_agent_standalone_ui/components/chat/{EmptyState,SessionList,SessionSwitcher}.tsx`

- [ ] **Step 1: WelcomeHero** — renders centered logo (theme `logo.imageUrl` or `logo.text`), serif headline `Hello, *welcome* to your {appName}` (italic on "welcome" in `text-accent`), `greeting` paragraph in muted-foreground, ChatInput pill, halo + welcome-reveal classes. Accept `onSend` prop.

- [ ] **Step 2: HistorySidebar** — 300px width, serif "History" header in Fraunces, `+ New` pill button, `listSessions()` from `lib/api.ts`, shimmer skeletons while loading, relative time formatting (`just now`, `5m ago`, `3h ago`, `2d ago`), active row highlighted with `bg-card ring-1 ring-accent/30`.

- [ ] **Step 3: Smoke-render both in dev** — temporarily import WelcomeHero in `app/page.tsx` to verify visually. Revert after. Commit.

---

### Task B3: MessageView + ReasoningPanel + ToolCallRow

**Files:**
- Create: `services/idun_agent_standalone_ui/components/chat/MessageView.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/ReasoningPanel.tsx`
- Create: `services/idun_agent_standalone_ui/components/chat/ToolCallRow.tsx`
- Delete: `services/idun_agent_standalone_ui/components/chat/ChatMessage.tsx`
- Test: `services/idun_agent_standalone_ui/__tests__/reasoning-panel.test.tsx`

- [ ] **Step 1: MessageView** — user vs assistant routing per spec §2.2. User: ink bubble, rounded-2xl + rounded-tr-md, max-78%, soft shadow. Assistant: avatar (logo in surface ring) + content column with `opener` (if any) + ReasoningPanel + body via react-markdown in `prose-chat`. Streaming cursor while `streaming === true`.

- [ ] **Step 2: ReasoningPanel** — collapsible card with header showing the current verb + pulse-dot when streaming. Body shows Plan, Thoughts (italic), Tool calls. Default: open while streaming, collapsed when `streaming === false`. Header label rules from spec §2.2.

- [ ] **Step 3: ToolCallRow** — numbered row with status dot (running=amber pulse, ok=emerald, error=rose), tool name in mono, one-liner preview, expandable. Open shows syntax-highlighted Python via `react-syntax-highlighter` (Prism, oneDark, custom override matching the editorial codeStyle from the reference) for `execute_python` style tools, JSON for others. Result shown below code.

- [ ] **Step 4: Vitest** — render an assistant Message with mock `plan + thoughts + 2 toolCalls`, assert ReasoningPanel header shows "Reasoning · 2 steps", clicking a tool row reveals the code block. Run, fix, commit.

---

### Task B4: ChatInput + HeaderActions refactor

**Files:**
- Modify: `services/idun_agent_standalone_ui/components/chat/ChatInput.tsx`
- Modify: `services/idun_agent_standalone_ui/components/chat/HeaderActions.tsx`

- [ ] **Step 1: ChatInput pill** — full-width rounded-3xl, `border-rule bg-card shadow-soft`, focus-within accent border + lift shadow. Textarea auto-grows (min 80px), placeholder `Message {appName}…`, ENTER sends / Shift+ENTER newline. Send button: `bottom-3 right-3`, `h-10 w-10 rounded-full bg-ink text-canvas hover:bg-accent`. While `streaming`: ArrowUp icon → stop icon, `onClick = onStop`. Disable send while `!input.trim() || streaming`.

- [ ] **Step 2: HeaderActions** — account chip (when `auth_mode === password`, show `email.split('@')[0]` from `useAuth`), "New conversation" pill (calls `onNewSession`), "Sign out" pill if authed. Pills: `rounded-full border border-rule bg-card/70 px-3.5 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:border-ink/20 hover:text-ink`. Link to `/admin/` for the Admin button.

- [ ] **Step 3: Smoke-build and commit.**

---

### Task B5: Reskin BrandedLayout (default)

**Files:**
- Replace: `services/idun_agent_standalone_ui/components/chat/BrandedLayout.tsx`

- [ ] **Step 1: Layout** — `flex h-screen bg-canvas`. Left: HistorySidebar. Right column: relative flex-col with min-w-0. If `messages.length === 0` show WelcomeHero centered; otherwise show header (720px IdunMark + HeaderActions + hairline below) + thread (`scroll-fade flex-1 overflow-y-auto`, 720px max-w, py-8) + composer (gradient-to-t-from-canvas at bottom).

- [ ] **Step 2: Wire `useChat`** — `messages, send, stop, status` propagate to MessageView + ChatInput. New session resets thread + threadId.

- [ ] **Step 3: Run dev server**, click around, commit.

---

### Task B6: Reskin MinimalLayout

**Files:**
- Replace: `services/idun_agent_standalone_ui/components/chat/MinimalLayout.tsx`

- [ ] **Step 1: Layout** — single column, no sidebar, no halo, simpler header (just IdunMark and Stop button if streaming), 720px column on `bg-background`. Same MessageView + ReasoningPanel + ChatInput. Welcome state: just centered composer + greeting (no headline halo).

- [ ] **Step 2: Commit.**

---

### Task B7: Reskin InspectorLayout

**Files:**
- Replace: `services/idun_agent_standalone_ui/components/chat/InspectorLayout.tsx`

- [ ] **Step 1: 3-column grid** `[260px_1fr_320px]`. Left: HistorySidebar (use compact density). Middle: header (with IdunMark + HeaderActions) + thread + ChatInput. Right: raw event ring panel — keep its current behavior (live event rows + selected event detail) but reskin to use `bg-card border border-rule`, `font-mono text-[11px]`, header in serif/uppercase tracking-wider.

- [ ] **Step 2: Commit.**

---

## Wave C — Admin shell

### Task C1: AppSidebar (shadcn Sidebar)

**Files:**
- Create: `services/idun_agent_standalone_ui/components/admin/AppSidebar.tsx`
- Delete: `services/idun_agent_standalone_ui/components/admin/Sidebar.tsx`

- [ ] **Step 1: AppSidebar** — uses shadcn `<Sidebar collapsible="icon">` with header (logo + app name), groups (`Overview`, `Agent`, `System`) using `<SidebarGroup>` + `<SidebarGroupLabel>` + `<SidebarMenu>` + `<SidebarMenuItem>` + `<SidebarMenuButton asChild isActive={...}>`. Each item: Lucide icon + label + Next `<Link>`. Footer: user avatar + dropdown (logout, change password) when `auth_mode === "password"`.

- [ ] **Step 2: Commit.**

---

### Task C2: Topbar + Breadcrumbs + ThemeToggle + UserMenu + admin layout

**Files:**
- Create: `services/idun_agent_standalone_ui/components/admin/{Topbar,Breadcrumbs,ThemeToggle,UserMenu}.tsx`
- Replace: `services/idun_agent_standalone_ui/app/admin/layout.tsx`

- [ ] **Step 1: Breadcrumbs** — parses pathname into segments, capitalizes each, links via Next `<Link>`, last segment is `<BreadcrumbPage>`.

- [ ] **Step 2: ThemeToggle** — DropdownMenu with Light / Dark / System; calls `setTheme()` from `next-themes`. Sun/Moon Lucide icons with `dark:` swap.

- [ ] **Step 3: UserMenu** — Avatar + DropdownMenu with "Profile", "Change password", "Sign out". Hidden when `auth_mode !== "password"`.

- [ ] **Step 4: Topbar** — flex row: SidebarTrigger + Breadcrumbs (left), GlobalCommand placeholder + ThemeToggle + UserMenu (right). Sticky top, bg-card/80 backdrop-blur, border-b.

- [ ] **Step 5: app/admin/layout.tsx** — `<SidebarProvider>` wrapping `<AppSidebar />` and `<SidebarInset>` containing Topbar + main. Wrap in `<AuthGuard>`.

- [ ] **Step 6: Commit.**

---

### Task C3: GlobalCommand (Cmd-K palette)

**Files:**
- Create: `services/idun_agent_standalone_ui/components/admin/GlobalCommand.tsx`

- [ ] **Step 1: GlobalCommand** — uses shadcn `<CommandDialog>` opened on `Cmd+K` / `Ctrl+K` via `useEffect` keyboard listener. Sections: Pages (every admin route), Recent traces (top 10 from `api.listTraceSessions()`), Actions (Reload config, Switch theme, Sign out, Open chat). Each item navigates / runs the action and closes.

- [ ] **Step 2: Wire into Topbar** — Topbar passes a state-controlled open/onOpenChange; the keyboard listener flips it. The Topbar shows a `<Button variant="outline" size="sm">` with `⌘K` hint that also opens it.

- [ ] **Step 3: Commit.**

---

## Wave D — Admin pages

> **Per-page template:** every singleton page follows the same shell:
> ```tsx
> <div className="flex flex-col gap-6 p-6 max-w-4xl">
>   <header><h1 className="text-2xl font-serif">Title</h1><p className="text-muted-foreground">desc</p></header>
>   <Card>
>     <Tabs defaultValue={current.type}>
>       <TabsList>{providers.map(...)}</TabsList>
>       {providers.map(p => <TabsContent value={p}><Form>...</Form></TabsContent>)}
>     </Tabs>
>   </Card>
>   <SaveToolbar />
>   <EditYamlSheet />  {/* opens on click of "Edit YAML" button */}
> </div>
> ```
> Use `react-hook-form` + zod for the form; the existing `lib/api.ts` calls stay unchanged.

### Task D1: EditYamlSheet shared component

**Files:**
- Create: `services/idun_agent_standalone_ui/components/admin/EditYamlSheet.tsx`

- [ ] **Step 1:** `<Sheet side="right">` with `<SheetContent className="sm:max-w-2xl">` containing the existing Monaco YAML editor + Cancel / Save buttons. Save parses YAML and calls `props.onSave(parsed)`. Errors shown via shadcn `<Alert variant="destructive">`. Commit.

---

### Task D2: /admin/agent

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/agent/page.tsx`

- [ ] **Step 1:** `<Tabs>` per framework (`langgraph`, `adk`). LangGraph form fields: name, graph_definition, checkpointer (Select: memory / sqlite / postgres), checkpointer.url. ADK form fields per existing schema. Edit YAML sheet writes back via `form.reset(parsed)`. Save calls `api.updateAgent(values)`; if response is 202 show "Restart required" `<Alert>`. Commit.

---

### Task D3: /admin/guardrails

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/guardrails/page.tsx`

- [ ] **Step 1:** Tabs per provider (Idun, OpenAI Moderation, Promptfoo, …). Form fields per existing schema. Same SaveToolbar + EditYamlSheet pattern. Commit.

---

### Task D4: /admin/memory

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/memory/page.tsx`

- [ ] **Step 1:** Tabs: in-memory / SQLite / Postgres. Postgres form: connection_url. SQLite: path. In-memory: nothing. Save toolbar. Commit.

---

### Task D5: /admin/mcp

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/mcp/page.tsx`

- [ ] **Step 1:** List of MCP servers in a shadcn `<Table>`; per row Edit (Sheet) and Delete (AlertDialog confirm). "Add server" button opens a Sheet with a form (transport: stdio / http / sse, command/url, args, env). Save toolbar applies all changes via `api.updateMcp({servers})`. Commit.

---

### Task D6: /admin/observability

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/observability/page.tsx`

- [ ] **Step 1:** Tabs per provider (langfuse / phoenix / langsmith / otel). Form fields: enabled (Switch), public_key, secret_key, host. Commit.

---

### Task D7: /admin/prompts

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/prompts/page.tsx`

- [ ] **Step 1:** List prompts in a Table; click opens Sheet with Monaco editor + variables panel. "New prompt" Sheet. Save toolbar. Commit.

---

### Task D8: /admin/integrations

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/integrations/page.tsx`

- [ ] **Step 1:** Card grid with toggles for each integration. Each card shows status, configure button (Sheet). Commit.

---

### Task D9: /admin/settings

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/settings/page.tsx`

- [ ] **Step 1:** Top-level `<Tabs>` Profile / Appearance / Layout / Password.
  - **Profile:** read-only; show `me.username`, last login.
  - **Appearance:** color pickers for accent + primary, light/dark sub-tabs, app name/greeting/logo URL/text inputs, font dropdown (Geist / Fraunces / system). Save persists via `api.updateTheme()`.
  - **Layout:** RadioGroup with Branded / Minimal / Inspector + a thumbnail per option.
  - **Password:** current + new + confirm with zod (min 12 chars, must match). Submits to `api.changePassword()`. Toast on success via sonner.
- [ ] **Step 2: Commit.**

---

### Task D10: /admin/ dashboard

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/admin/page.tsx`

- [ ] **Step 1:** Cards grid with KPI tiles (Sessions today, Total runs, Avg latency, Errors). Each card: title + big number + small delta. Pull from `api.dashboardSummary()` if exists; otherwise show static placeholder + ComingSoonBadge. Recent activity Table below the KPIs. Commit.

---

## Wave E — Traces & Logs

### Task E1: /traces (sessions list + detail Sheet)

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/traces/page.tsx`
- Modify: `services/idun_agent_standalone_ui/app/traces/[id]/page.tsx` — repoint to a Sheet inside the same page if simpler, OR keep the dedicated route reskinned.

- [ ] **Step 1:** Search input (debounced, calls `api.listTraceSessions({search})`); Table with columns Session ID / Started at / Events / Status. Per row: "Open" → opens Sheet with timeline + selected event detail. Sheet has its own search input wired to `/admin/api/v1/traces/sessions/{sid}/events?search=`. Commit.

---

### Task E2: /logs

**Files:**
- Replace: `services/idun_agent_standalone_ui/app/logs/page.tsx`

- [ ] **Step 1:** Header with search input + level filter (multi-select). Table with columns Timestamp / Level (Badge) / Message. Auto-scroll to bottom on new entries. Commit.

---

## Wave F — Tests + polish + verification

### Task F1: Vitest test sweep

- [ ] **Step 1:** Add unit tests for `MessageView` (user vs assistant), `ReasoningPanel` (collapsed/open + step labels), `HistorySidebar` (loading skeleton + empty state), `ChatInput` (Enter sends, Shift+Enter newline, disabled while streaming). Add tests for Topbar's keyboard listener (Cmd+K opens command), and Breadcrumbs path parsing.

- [ ] **Step 2:** `pnpm test` — all green. Commit.

---

### Task F2: Playwright E2E sweep

- [ ] **Step 1:** Update `e2e/chat.spec.ts` to expect the new editorial selectors (text "Hello, welcome to your", `.prose-chat`, ReasoningPanel toggle). Update `e2e/admin-edit-reload.spec.ts` to use shadcn `[role=tab]` selectors and the Sheet-based YAML editor. Add a new `e2e/admin-shell.spec.ts` covering Cmd-K palette + sidebar collapse + theme toggle.

- [ ] **Step 2:** `pnpm test:e2e` against the boot script — fix selector drift. Commit.

---

### Task F3: Build + smoke-launch the standalone server

- [ ] **Step 1:** `make build-standalone-ui` then `make build-standalone-wheel` — verify the wheel includes the new static export.

- [ ] **Step 2:** Boot `idun-standalone serve --config <example.yaml>` against the Gemini Planner agent (existing config from prior session). Visit `/`, `/admin/`, `/admin/settings`, `/traces/`, `/logs/`. Verify:
  - Chat welcome hero renders with serif headline + halo.
  - Send a message; assistant message shows ReasoningPanel; tool call rows expand to syntax-highlighted code.
  - Cmd-K opens palette in admin.
  - Sidebar collapses; theme toggle flips to dark and back.
  - Agent / Memory / MCP edit-reload works via Sheet YAML.
  - Traces page shows sessions; clicking opens Sheet with timeline.

- [ ] **Step 3:** Commit any final fixes. Push branch.

---

## Wrap-up

After Wave F: dispatch the `superpowers:code-reviewer` agent for a final review, then invoke `superpowers:finishing-a-development-branch` to open the PR.
