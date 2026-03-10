# Project UI — Navbar Picker, Invitation Flow, Settings Page

## Goal

Deliver three connected UI features for the project management system: a polished breadcrumb-style project picker in the navbar, project assignment during member invitation, and a role-aware project management page in settings.

## Naming

The feature is called **"Projects"** (replacing the earlier "Spaces" label). Use the term sparingly in the UI — it should feel natural, not overloaded.

---

## 1. Navbar Redesign

### Layout

Three-zone navbar: logo left, search center, project picker right.

| Zone | Content |
|------|---------|
| Left | Logo icon + "Idun Platform" text (clickable → `/agents`) |
| Center | Search bar placeholder (visual only, not functional — shows `⌘K` hint) |
| Right | Breadcrumb project picker: `Project / {name}` |

### Project Picker — Breadcrumb Style

**Default state:** Static label "Project" in muted text, separator `/`, then the active project name in a subtle button with a chevron-down icon.

**Dropdown (on click):**
- Filter input at top ("Filter projects...")
- List of projects with checkmark on the currently selected one
- Default project shows a "Default" badge
- Separator line, then "Manage projects" link at the bottom (navigates to `/settings/projects`)
- "Manage projects" is visible only if the user is a workspace owner or admin of at least one project

**Behavior:**
- A project is always selected (no "All projects" option)
- On first load, selects the default project (persisted to `localStorage`)
- Switching projects updates the `X-Project-Id` header on all subsequent API calls
- Dropdown closes on selection or outside click

### Search Bar (Placeholder)

- Centered, flexible width (`max-width: 420px`)
- Search icon + "Search..." placeholder text + `⌘K` keyboard hint
- Subtle background (`rgba` fill), no border focus state
- No functionality — purely visual shell for future implementation

### What Changes

- **Remove:** Current `<select>` dropdown for projects (left side of header)
- **Remove:** `ProjectManager` modal triggered from `__manage__` option
- **Remove:** Disabled workspace selector code
- **Add:** Three-zone layout with `justify-content: space-between`
- **Add:** `ProjectPickerDropdown` component (breadcrumb trigger + floating dropdown)
- **Add:** Search bar placeholder component

### Files

- Modify: `services/idun_agent_web/src/layouts/header/layout.tsx` — rewrite layout
- Create: `services/idun_agent_web/src/components/project-picker/component.tsx` — new picker component
- Delete: `services/idun_agent_web/src/components/project-manager/component.tsx` — modal replaced by settings page

---

## 2. Invitation Flow — Project Assignment

### Current State

The invite dialog collects email + workspace role (Owner/Member toggle). The backend already accepts `project_assignments` in the `MemberAdd` schema but the frontend doesn't send it.

### Design

When inviting a **Member** (non-owner):
1. Email input
2. Workspace role toggle (Owner / Member)
3. **Project access section** — list of all workspace projects as checkboxes
   - Each checked project shows a role dropdown: Admin / Contributor / Reader
   - Unchecked projects show a dash (`—`)
   - Help text: "Select which projects this member can access and their role in each."

When inviting an **Owner**:
1. Email input
2. Workspace role toggle (Owner / Member) — Owner selected
3. **Info note** replacing the project section: "Workspace owners have admin access to all projects by default. No project assignment needed."

### Data Flow

The frontend sends to `POST /workspaces/{id}/members`:
```json
{
  "email": "user@example.com",
  "is_owner": false,
  "project_assignments": [
    { "project_id": "uuid", "role": "contributor" },
    { "project_id": "uuid", "role": "reader" }
  ]
}
```

For owners, `project_assignments` is omitted or sent as `[]`.

### What Changes

- Modify: `services/idun_agent_web/src/components/settings/workspace-users/component.tsx` — update `InviteMemberDialog`
- Modify: `services/idun_agent_web/src/services/members.ts` — update `addMember()` to include `project_assignments`
- No backend changes — the API already supports this

### Files

- Modify: `services/idun_agent_web/src/components/settings/workspace-users/component.tsx`
- Modify: `services/idun_agent_web/src/services/members.ts`

---

## 3. Project Management in Settings

### Current State

Projects are managed through a `ProjectManager` modal triggered from the navbar dropdown. Settings page has two tabs: General and Members (under "Workspaces" group).

### Design

Add a "Projects" tab to the settings page. The entire settings page adapts based on the user's role:

**Workspace Owners:**
- Sidebar group heading: "Workspace"
- Tabs: General, Members, Projects
- Projects tab shows all workspace projects
- Full CRUD: create, rename, delete
- Each project card shows: icon, name, default badge (if applicable), resource count, member count, edit/delete buttons

**Project Admins** (admin on at least one project, not a workspace owner):
- Sidebar group heading: "Project Settings"
- Tabs: Projects only (General and Members hidden — those are owner-only)
- Projects tab shows only projects where user has admin role
- Each card shows "Admin" role badge
- Can rename but cannot create new projects or delete

**Contributors / Readers:**
- No access to settings page at all
- "Manage projects" link hidden in picker dropdown
- Settings route guard redirects them away

### Project Card Layout

Each project is a horizontal card with:
- Left: colored icon (grid pattern), project name, optional badges (Default, Admin)
- Below name: resource count + member count in muted text
- Right: edit (pencil) and delete (trash) icon buttons
- Delete button hidden for default projects (owners) and entirely for admins

### Settings Page Visibility Logic

The settings page entry point (sidebar nav) should only render for:
1. Workspace owners — always
2. Project admins — when they have admin on at least one project
3. Everyone else — hidden

This requires checking the user's project memberships to determine visibility. The `useProject` hook or a new endpoint can provide this.

### What Changes

- Create: `services/idun_agent_web/src/components/settings/workspace-projects/component.tsx` — new projects settings tab
- Modify: `services/idun_agent_web/src/pages/settings/page.tsx` — add Projects tab, role-based tab filtering
- Modify: `services/idun_agent_web/src/layouts/side-bar/` — update sidebar to show/hide settings based on role
- Delete: `services/idun_agent_web/src/components/project-manager/component.tsx` — replaced by settings tab
- Modify: i18n files for new translation keys

### Files

- Create: `services/idun_agent_web/src/components/settings/workspace-projects/component.tsx`
- Modify: `services/idun_agent_web/src/pages/settings/page.tsx`
- Modify: `services/idun_agent_web/src/hooks/use-project.tsx` (may need role info)
- Modify: i18n locale files

---

## 4. Shared Concerns

### Backend — Already Done

The backend already supports everything needed:
- `GET /api/v1/projects/` — lists projects (owners see all, non-owners see assigned)
- `POST /api/v1/projects/` — create (owner only)
- `PATCH /api/v1/projects/{id}` — rename
- `DELETE /api/v1/projects/{id}` — delete (owner only, not last project)
- `POST /workspaces/{id}/members` — accepts `project_assignments`
- `GET /projects/{id}/members` — list project members with roles

No backend changes are needed for this spec.

### Frontend — Project Context

The `useProject` hook already provides `projects`, `selectedProjectId`, `createProject`, `updateProject`, `deleteProject`. It may need:
- A way to determine the user's role on each project (for admin filtering)
- Integration with the `X-Project-Id` header for API calls

### i18n

New keys needed under `projects.*` and `settings.*` namespaces. Existing project-related keys in `en.json` should be audited and updated.

### Removal

- Delete `ProjectManager` modal component entirely
- Remove `__manage__` option from old select dropdown
- Clean up unused i18n keys from the old project modal
