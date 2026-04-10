# Workspace/Project UI Redesign — Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Header selectors, sidebar cleanup, settings page, account/preferences split

## Implementation Note

All color values in this spec are shown as dark-mode references for readability. Implementations must use the corresponding CSS custom properties from `style-variables.ts` and `global-styles.tsx` to support both light and dark modes. For example: `#141922` → `hsl(var(--popover))`, `rgba(255,255,255,0.04)` → `var(--overlay-subtle)`, `rgba(140,82,255,0.1)` → `hsla(var(--primary) / 0.10)`.

## Problem

The workspace and project features were added incrementally. The header uses native HTML `<select>` elements that don't match the platform's polished design language (purple accents, overlay-based layering, card-based layouts). The settings pages for workspace/project management are visually inconsistent with the rest of the UI.

## Decisions

| Area | Decision |
|---|---|
| Header selector | Popover dropdown, right-aligned, with settings gear |
| Settings page | Workspace/project management with polished sidebar tabs |
| Account/Preferences | Separated from Settings — user-scoped only |
| Sidebar project selector | Removed entirely |
| Onboarding | No changes |

## 1. Header — Workspace/Project Selector

Replace native `<select>` dropdowns with styled popover dropdowns on the right side of the navbar.

### Layout

```
[Logo "Idun"]                    [Workspace ▾] / [Project ▾] [⚙] | [role badge] [avatar]
```

- Logo + "Idun" on the far left
- Workspace/project selectors pushed to the right via flex spacer
- Slash separator between workspace and project triggers
- Gear icon after selectors — navigates to `/settings`
- Vertical divider separating selectors from role badge + avatar

### Workspace Trigger

- Pill-shaped button: workspace icon (colored initial letter, rounded square) + workspace name + chevron down
- Background: `rgba(255,255,255,0.04)` with `1px solid rgba(255,255,255,0.08)` border
- Border radius: 7px
- On click: opens workspace popover below

### Workspace Popover

- Width: ~260px
- Background: `#141922` with `1px solid rgba(255,255,255,0.1)` border
- Border radius: 10px
- Box shadow: `0 12px 40px rgba(0,0,0,0.5)`
- **Search bar** at the top: input with search icon, placeholder "Search workspaces..."
- **Workspace list**: each item shows icon (colored initial) + name + metadata line ("Owner · 3 projects" or "Member · 2 projects") — current workspace highlighted with `rgba(140,82,255,0.1)` background + purple checkmark
- **Footer**: "Create workspace" link with plus icon, separated by border-top

### Project Trigger

- Same pill style as workspace but with project name only (no icon)
- Lighter text color: `rgba(255,255,255,0.7)`
- On click: opens project popover below

### Project Popover

- Same structure as workspace popover but scoped to current workspace
- Items show project name + role + default badge where applicable
- Footer: "Create project" link (visible to workspace owners only)

### Settings Gear Icon

- 30×30px clickable area with 6px border radius
- Icon: gear/cog SVG at 15px
- Border: `1px solid rgba(255,255,255,0.06)`
- Hover: `background: rgba(255,255,255,0.05)`
- On click: navigates to `/settings`

### Avatar

- 28×28px circle with purple gradient background and user initials
- On click: opens a small popover with "Account Settings" (→ `/preferences`) and "Sign out"
- This replaces the current avatar placement in the sidebar bottom. The sidebar user popover is removed; the header avatar becomes the single access point for user account actions.

### Role Badge

- Pill shape: `border-radius: 999px`
- Background: `hsla(var(--primary) / 0.12)`
- Text: role name (admin/contributor/reader), 11px, weight 600, color `hsl(var(--primary))`

## 2. Sidebar

Remove the `ProjectSelector` component from the sidebar entirely. The sidebar becomes pure navigation:

- Navigation menu items (Agents, Observability, Memory, MCP, Prompts, Guardrails, Integrations, SSO)
- Bottom section: Settings link, user account popover

No workspace/project context is shown in the sidebar. The header is the single source of truth for the current workspace/project.

### Files affected

- Remove `src/components/project-selector/component.tsx` (or stop rendering it)
- Update `src/layouts/side-bar/dashboard-side-bar/layout.tsx` to remove `ProjectSelector` usage

## 3. Settings Page (`/settings/:tab`)

Settings page handles workspace and project management. Uses polished sidebar tabs with grouped sections.

### Route

`/settings/:page?` — default page: `workspace-general`

### Navigation Structure

Left sidebar with grouped tabs:

```
WORKSPACE
  ├── General        (workspace-general)
  └── Members        (workspace-users)

PROJECTS
  ├── All Projects   (workspace-projects)
  └── Project Members (project-members)
```

### Sidebar Tab Design

- Group headers: 10px uppercase, weight 600, color `rgba(255,255,255,0.25)`, with letter spacing
- Tab items: 13px, weight 500, with icons (14px SVG)
- Active tab: `background: rgba(140,82,255,0.08)`, `border-left: 2.5px solid #8c52ff`, white text
- Inactive tabs: `color: rgba(255,255,255,0.45)`
- Groups separated by a horizontal divider: `1px solid rgba(255,255,255,0.06)` with 12px vertical margin

### Content Pane Design

- Title: 17px, weight 600
- Subtitle: 12px, color `rgba(255,255,255,0.35)`
- Content uses card-based layout for form sections:
  - Card background: `rgba(255,255,255,0.025)`
  - Card border: `1px solid rgba(255,255,255,0.07)`
  - Card border radius: 10px
  - Card padding: 18px
  - Cards separated by 14px gap
- Form inputs: platform-standard style (overlay background, subtle border, purple focus ring)
- Save buttons: purple gradient (`linear-gradient(135deg, #8c52ff, #7c3aed)`)
- Detail grids: 2-column grid for metadata (ID, slug, role, default project)

### Tab Content

**Workspace General:** Rename workspace (input + save), workspace details grid (ID, slug, role, default project).

**Workspace Members:** Invite section (email input, owner toggle, project assignments with role dropdowns). Members table (name, email, access level, actions). Invitations table (email, access level, assigned projects, cancel action). All owner-only actions gated by `isCurrentWorkspaceOwner`.

**All Projects:** Create project section (name + description inputs, create button). Projects list with cards showing name, default badge, role, description. Inline edit for rename/description. Delete with confirmation modal. Owner-only gating.

**Project Members:** Header with current project context. Add member section (email + role dropdown). Members table with editable roles and remove action. Admin-only gating.

## 4. Account/Preferences (`/preferences/:tab`)

User-scoped settings separated from workspace/project management.

### Route

`/preferences/:page?` — default page: `general`

### Content

- **Appearance** — theme toggle (light/dark/system)
- **Language** — language selector

### Access

- Accessible from the header avatar popover → "Account Settings"
- Not from the sidebar "Settings" link (that goes to workspace settings)
- No new work needed for the preferences page content itself — `AppearanceSettings` and `LanguageSettings` components already exist. The change is moving the access point from the sidebar user popover to the header avatar popover.

## 5. Onboarding

No changes. Current design (centered card, workspace name input, submit button) is clean and already uses the correct design tokens.

## Components to Create/Modify

### New Components

- `src/components/workspace-popover/component.tsx` — workspace selector popover with search, list, create action
- `src/components/project-popover/component.tsx` — project selector popover with list, create action

### Modified Components

- `src/layouts/header/layout.tsx` — replace native selects with popover triggers, move selectors to right side, add gear icon
- `src/layouts/side-bar/dashboard-side-bar/layout.tsx` — remove ProjectSelector rendering
- `src/components/settings/paged-settings-container/component.tsx` — polish sidebar tab design (icons, spacing, active states)
- `src/components/settings/workspace-general/component.tsx` — card-based layout
- `src/components/settings/workspace-users/component.tsx` — card-based layout, polished tables
- `src/components/settings/workspace-projects/component.tsx` — card-based layout, polished project cards
- `src/components/settings/project-members/component.tsx` — card-based layout, polished tables
- `src/pages/settings/page.tsx` — update tab definitions (icons, labels)

### Removed/Deprecated

- `src/components/project-selector/component.tsx` — no longer rendered in sidebar
- Sidebar user popover (bottom of sidebar) — avatar + account actions move to header avatar popover

## Design Tokens Reference

All colors and spacing follow the existing platform design language defined in `src/utils/style-variables.ts` and `src/global-styles.tsx`:

- Primary: `#8c52ff` / `hsl(262.1, 83.3%, 57.8%)`
- Overlay light: `rgba(255,255,255,0.05-0.10)`
- Surface elevated: `hsl(var(--surface-elevated))`
- Border radius (cards): 10px
- Border radius (buttons/inputs): 7px
- Border radius (pills): 999px
- Font sizes: 10-17px range per component role
- Font weights: 500 (body), 600 (headings/labels), 700 (titles)
