# Workspace/Project UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ugly native `<select>` elements in the header with polished popover dropdowns, clean up the sidebar, and restyle all settings tabs to match the platform's card-based design language.

**Architecture:** New popover components (workspace, project, user avatar) replace native selects. Header layout flips from left-aligned selectors to right-aligned popover triggers with gear icon. Sidebar loses the ProjectSelector widget. Settings tabs get card-based forms with consistent spacing. All styling uses existing CSS custom properties for light/dark theming.

**Tech Stack:** React 19, styled-components 6, lucide-react icons, CSS custom properties (HSL), react-router-dom, react-i18next

**Spec:** `docs/superpowers/specs/2026-04-10-workspace-project-redesign-design.md`

---

## Deviations from Spec

1. **Popover file paths:** Spec lists `src/components/workspace-popover/` and `src/components/project-popover/`. Plan places them under `src/components/header/` to co-locate header-specific components. This is intentional — the spec paths are updated here.
2. **Account/Preferences (Spec Section 4):** The spec says "No new work needed for the preferences page content itself." The navigation change (sidebar popover → header avatar popover) is handled in Tasks 3 and 5. The existing `/preferences` route and page content are unchanged.
3. **Spec Section 2 contradiction:** The spec says sidebar keeps "Settings link, user account popover" but also says "The sidebar user popover is removed; the header avatar becomes the single access point." The plan follows the latter — user popover moves to header.
4. **Workspace data source:** The existing header fetches workspaces via `getAllWorkspace()` API call, not just from the session hook. The WorkspacePopover must use `getAllWorkspace()` to avoid stale data.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/components/header/workspace-popover/component.tsx` | Workspace selector popover: search, list, create |
| `src/components/header/project-popover/component.tsx` | Project selector popover: list, create |
| `src/components/header/user-avatar-popover/component.tsx` | Header avatar with popover: account settings, sign out |

### Modified Files

| File | Changes |
|---|---|
| `src/layouts/header/layout.tsx` | Full rewrite: right-aligned layout, popover triggers, gear icon, avatar |
| `src/layouts/side-bar/dashboard-side-bar/layout.tsx` | Remove ProjectSelector import/rendering, remove user popover from bottom |
| `src/components/settings/paged-settings-container/component.tsx` | Add icons to tabs, polish spacing/active states |
| `src/components/settings/workspace-general/component.tsx` | Card-based form layout |
| `src/components/settings/workspace-users/component.tsx` | Card-based layout, polished tables |
| `src/components/settings/workspace-projects/component.tsx` | Card-based layout, polished cards |
| `src/components/settings/project-members/component.tsx` | Card-based layout, polished tables |
| `src/pages/settings/page.tsx` | Update tab definitions with icons, rename labels |

### Deprecated (stop rendering)

| File | Action |
|---|---|
| `src/components/project-selector/component.tsx` | No longer imported in sidebar |

---

## Chunk 1: Header Popovers

Three new popover components that power the redesigned header. Built before the header itself so they can be integrated cleanly.

### Task 1: Workspace Popover

**Files:**
- Create: `services/idun_agent_web/src/components/header/workspace-popover/component.tsx`

This component renders a floating popover with search, workspace list, and a "Create workspace" footer. It follows the existing `UserPopover` pattern (click-outside dismiss, `popoverIn` animation, `hsl(var(--popover))` background).

- [ ] **Step 1: Create workspace-popover directory**

```bash
mkdir -p services/idun_agent_web/src/components/header/workspace-popover
```

- [ ] **Step 2: Write the WorkspacePopover component**

Create `services/idun_agent_web/src/components/header/workspace-popover/component.tsx`.

The component receives these props:
```typescript
type WorkspacePopoverProps = {
    workspaces: WorkspaceSummary[];
    selectedWorkspaceId: string | null;
    onSelect: (workspaceId: string) => void;
    onClose: () => void;
};
```

**Important:** The `workspaces` prop must come from a fresh `getAllWorkspace()` API call (not just the session hook), because the session data can be stale if the user was invited to new workspaces. The header component (Task 4) will call `getAllWorkspace()` on mount and pass the result here.

Key implementation details:
- `useRef<HTMLDivElement>` + `useEffect` mousedown listener for click-outside dismiss (same pattern as `src/components/side-bar/user-popover/component.tsx` lines 37-45)
- Local `search` state filters workspaces by name (case-insensitive)
- Each workspace item shows: colored initial square (first letter, gradient background) + name + metadata line ("Owner · N projects" or "Member")
- Current workspace highlighted with `hsla(var(--primary) / 0.10)` background + purple checkmark SVG
- Footer with "Create workspace" link (navigates to `/onboarding` via `useNavigate`)
- Entry animation: reuse `popoverIn` keyframes from user-popover

Styled components to define:
- `PopoverContainer` — absolute positioned, `width: 260px`, `background: hsl(var(--popover))`, `border: 1px solid var(--border-light)`, `border-radius: 10px`, `box-shadow: 0 12px 40px rgba(0,0,0,0.5)`, `z-index: 50`, animation
- `SearchWrapper` — padding `8px`, contains search input
- `SearchInput` — full width, overlay background, subtle border, `font-size: 12px`, search icon via `::before` or inline SVG
- `WorkspaceList` — padding `4px 8px`, `max-height: 240px`, `overflow-y: auto`
- `WorkspaceItem` — flex row, `padding: 8px`, `border-radius: 6px`, `gap: 8px`, hover state `var(--overlay-light)`, active state `hsla(var(--primary) / 0.10)`
- `WorkspaceIcon` — `22px` square, `border-radius: 5px`, gradient background, centered initial letter, `font-size: 10px`, weight 700, white
- `WorkspaceMeta` — flex column: name (13px, weight 500) + subtitle (11px, muted)
- `PopoverFooter` — `border-top: 1px solid var(--border-subtle)`, padding `8px`, "Create workspace" link in primary color

Use `hsl(var(--popover))` for background (NOT hardcoded `#141922`). Use `hsl(var(--foreground))` for text, `hsl(var(--muted-foreground))` for secondary text.

- [ ] **Step 3: Verify the component renders**

Temporarily import it in the header or a test page. Open the app in the browser (`npm run dev` on port 5173) and confirm the popover renders, search filters, and click-outside dismisses.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/header/workspace-popover/
git commit -m "feat(web): add WorkspacePopover component for header selector"
```

---

### Task 2: Project Popover

**Files:**
- Create: `services/idun_agent_web/src/components/header/project-popover/component.tsx`

Same popover structure as workspace but scoped to projects. Simpler — no search (projects per workspace are typically few), shows project name + role + default badge.

- [ ] **Step 1: Create project-popover directory**

```bash
mkdir -p services/idun_agent_web/src/components/header/project-popover
```

- [ ] **Step 2: Write the ProjectPopover component**

Create `services/idun_agent_web/src/components/header/project-popover/component.tsx`.

Props:
```typescript
type ProjectPopoverProps = {
    projects: ProjectSummary[];
    selectedProjectId: string | null;
    onSelect: (projectId: string) => void;
    onClose: () => void;
    isWorkspaceOwner: boolean;
};
```

Key implementation details:
- Same click-outside pattern and animation as WorkspacePopover
- No search bar (project lists are short)
- Each item shows: project name (13px, weight 500) + role badge (9px, primary color) + "Default" badge if `is_default`
- Current project highlighted same as workspace
- Footer: "Create project" link, only visible when `isWorkspaceOwner` is true (navigates to `/settings/workspace-projects`)

Styled components: reuse same naming/pattern as WorkspacePopover — `PopoverContainer`, `ProjectList`, `ProjectItem`, `PopoverFooter`. Width: `220px`.

- [ ] **Step 3: Verify in browser**

Same approach as Task 1 — temporarily render, confirm behavior.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/header/project-popover/
git commit -m "feat(web): add ProjectPopover component for header selector"
```

---

### Task 3: User Avatar Popover (Header)

**Files:**
- Create: `services/idun_agent_web/src/components/header/user-avatar-popover/component.tsx`

Adapts the existing `src/components/side-bar/user-popover/component.tsx` for the header. Same user info + menu items, but positioned below the avatar (not above like the sidebar version).

- [ ] **Step 1: Create user-avatar-popover directory**

```bash
mkdir -p services/idun_agent_web/src/components/header/user-avatar-popover
```

- [ ] **Step 2: Write the UserAvatarPopover component**

Create `services/idun_agent_web/src/components/header/user-avatar-popover/component.tsx`.

This is largely a copy of `src/components/side-bar/user-popover/component.tsx` with these changes:
- `PopoverContainer` positioning: `top: calc(100% + 8px)` and `right: 0` (opens downward-right instead of upward)
- Width: `240px` (instead of stretching to sidebar width)
- Same user section (avatar/initials + name + email)
- Same menu items: "Account Settings" (→ `/preferences`) and "Sign out"
- Same `popoverIn` animation, same styled components

The avatar trigger itself (the 28px circle shown in the header) will be part of the header layout, not this component. This component is just the popover dropdown.

- [ ] **Step 3: Verify in browser**

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/header/user-avatar-popover/
git commit -m "feat(web): add UserAvatarPopover component for header"
```

---

## Chunk 2: Header Redesign

### Task 4: Rewrite Header Layout

**Files:**
- Modify: `services/idun_agent_web/src/layouts/header/layout.tsx`

Full rewrite of the header component. The current 213-line file uses native `<select>` elements on the left side. The new version uses popover triggers on the right side.

- [ ] **Step 1: Read the current header file**

Read `services/idun_agent_web/src/layouts/header/layout.tsx` to understand current imports, hooks used, and overall structure before modifying.

- [ ] **Step 2: Rewrite the Header component**

Replace the entire `Header` component and its styled components. Keep the same imports for hooks (`useWorkspace`, `useProject`, `useAuth`) and add new ones.

**New imports to add:**
```typescript
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import WorkspacePopover from '../../components/header/workspace-popover/component';
import ProjectPopover from '../../components/header/project-popover/component';
import UserAvatarPopover from '../../components/header/user-avatar-popover/component';
```

**New component state:**
```typescript
const [showWorkspacePopover, setShowWorkspacePopover] = useState(false);
const [showProjectPopover, setShowProjectPopover] = useState(false);
const [showUserPopover, setShowUserPopover] = useState(false);
```

**New JSX layout structure:**
```
HeaderContainer (sticky, backdrop-blur — keep existing)
  ├── LeftSection
  │   ├── Logo (Idun icon + "Idun" text — keep existing)
  ├── Spacer (flex: 1)
  ├── RightSection
  │   ├── SelectorGroup
  │   │   ├── WorkspaceTrigger (pill button, onClick → toggle popover)
  │   │   │   ├── WorkspaceIcon (colored initial square)
  │   │   │   ├── workspace name text
  │   │   │   ├── ChevronDown icon
  │   │   │   └── {showWorkspacePopover && <WorkspacePopover />}
  │   │   ├── SlashSeparator ("/")
  │   │   ├── ProjectTrigger (pill button, onClick → toggle popover)
  │   │   │   ├── project name text
  │   │   │   ├── ChevronDown icon
  │   │   │   └── {showProjectPopover && <ProjectPopover />}
  │   │   ├── GearButton (onClick → navigate('/settings'))
  │   ├── Divider (vertical, 1px, 24px tall)
  │   ├── RoleBadge (pill, primary color)
  │   ├── AvatarTrigger (28px circle, onClick → toggle user popover)
  │   │   └── {showUserPopover && <UserAvatarPopover />}
```

**New styled components to define (replacing all existing ones except `HeaderContainer`):**

- `HeaderContainer` — keep existing: sticky, `height: 52px`, backdrop-blur, bottom border
- `LeftSection` — flex, align-items center, gap 8px
- `Logo` — keep existing link to `/agents` with icon + text
- `Spacer` — `flex: 1`
- `RightSection` — flex, align-items center, gap 14px
- `SelectorGroup` — flex, align-items center, gap 0 (triggers are adjacent with slash between)
- `TriggerButton` — flex, align-items center, gap 6px, `padding: 6px 10px`, `border-radius: 7px`, `background: var(--overlay-subtle)`, `border: 1px solid var(--border-subtle)`, cursor pointer, position relative (for popover positioning). Hover: `var(--overlay-light)`
- `WorkspaceIcon` — `20px` square, `border-radius: 5px`, gradient background, initial letter centered
- `TriggerText` — `font-size: 13px`, weight 500, `color: hsl(var(--foreground))`
- `MutedTriggerText` — same but `color: hsl(var(--muted-foreground))`
- `ChevronIcon` — svg, `opacity: 0.4`
- `SlashSeparator` — `font-size: 16px`, `color: var(--border-subtle)`, weight 300, `margin: 0 6px`
- `GearButton` — `width: 30px`, `height: 30px`, flex center, `border-radius: 6px`, `border: 1px solid var(--border-subtle)`, hover `var(--overlay-light)`, transition
- `VerticalDivider` — `width: 1px`, `height: 24px`, `background: var(--border-subtle)`, `margin: 0 2px`
- `RoleBadge` — `border-radius: 999px`, `background: hsla(var(--primary) / 0.12)`, `font-size: 11px`, weight 600, `color: hsl(var(--primary))`, `padding: 3px 8px`
- `AvatarTrigger` — `width: 28px`, `height: 28px`, position relative, cursor pointer. Contains the avatar circle (gradient background, initials)
- `AvatarCircle` — `border-radius: 50%`, `background: hsl(var(--primary))`, initials centered, white text

**Hook usage — wire the popover triggers to existing hooks:**
```typescript
const { selectedWorkspaceId, setSelectedWorkspaceId, workspaces, currentWorkspace, isCurrentWorkspaceOwner } = useWorkspace();
const { selectedProjectId, setSelectedProjectId, projects, currentProject, currentRole } = useProject();
const { session } = useAuth();
const navigate = useNavigate();
```

WorkspaceTrigger onClick: `setShowWorkspacePopover(prev => !prev)` — close other popovers.
ProjectTrigger onClick: `setShowProjectPopover(prev => !prev)` — close other popovers.
AvatarTrigger onClick: `setShowUserPopover(prev => !prev)` — close other popovers.

Pass `onClose` callbacks to each popover that set their show state to false.

- [ ] **Step 3: Verify in browser**

Run `npm run dev`, open `http://localhost:5173`. Confirm:
- Logo on left, selectors on right
- Clicking workspace trigger opens workspace popover
- Selecting a workspace switches it and closes the popover
- Clicking project trigger opens project popover
- Gear icon navigates to `/settings`
- Role badge shows current role
- Avatar opens user popover with "Account Settings" and "Sign out"

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/layouts/header/layout.tsx
git commit -m "feat(web): redesign header with right-aligned popover selectors and gear icon"
```

---

## Chunk 3: Sidebar Cleanup

### Task 5: Remove ProjectSelector and User Popover from Sidebar

**Files:**
- Modify: `services/idun_agent_web/src/layouts/side-bar/dashboard-side-bar/layout.tsx`

Two removals: (1) ProjectSelector widget no longer rendered, (2) user avatar/popover at sidebar bottom removed (now lives in header).

- [ ] **Step 1: Read the current sidebar file**

Read `services/idun_agent_web/src/layouts/side-bar/dashboard-side-bar/layout.tsx`. Note:
- Line ~4: `import ProjectSelector from ...` 
- Line ~119: `<ProjectSelector />` rendered when sidebar is expanded
- Bottom section: `UserRow` with avatar that toggles `UserPopover`

- [ ] **Step 2: Remove ProjectSelector**

1. Remove the import of `ProjectSelector`
2. Remove the `<ProjectSelector />` JSX element from the sidebar body
3. Remove any conditional logic around it (e.g., `{!collapsed && <ProjectSelector />}`)

- [ ] **Step 3: Remove user popover from sidebar bottom**

1. Remove the import of `UserPopover` from `../../components/side-bar/user-popover/component`
2. Remove the `showUserPopover` state and the `UserPopover` rendering
3. Remove the `UserRow` / `UserRowWrapper` section at the bottom of the sidebar
4. Remove the unused styled components: `UserRow`, `UserRowWrapper`, `AvatarImg`
5. Keep the Settings link, Upgrade link, Support link, and version label — those stay

- [ ] **Step 4: Verify in browser**

Confirm:
- Sidebar shows only navigation items + bottom links (Settings, Upgrade, Support, Version)
- No project selector card at top
- No user avatar at bottom
- The user avatar in the header (from Task 4) is the only place to access account settings and sign out

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_web/src/layouts/side-bar/dashboard-side-bar/layout.tsx
git commit -m "refactor(web): remove ProjectSelector and user popover from sidebar"
```

---

## Chunk 4: Settings Page Polish

### Task 6: Polish PagedSettingsContainer

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/paged-settings-container/component.tsx`

Add icon support to tab items, polish spacing and active states per spec.

- [ ] **Step 1: Read the current file**

Read `services/idun_agent_web/src/components/settings/paged-settings-container/component.tsx`. Note the `SettingsPage` type and `TabItem` styled component.

- [ ] **Step 2: Add icon support to SettingsPage type**

The `SettingsPage` type needs an optional `icon` field:
```typescript
type SettingsPage = {
    title: string;
    slug: string;
    group: string;
    content: React.ReactNode;
    icon?: React.ReactNode;  // Add this
};
```

- [ ] **Step 3: Update TabItem to render icons**

In the JSX where `TabItem` is rendered, add the icon before the title text:
```tsx
<TabItem
    key={page.slug}
    $isActive={page.slug === activeSlug}
    onClick={() => onPageChange(page.slug)}
>
    {page.icon && <TabIcon>{page.icon}</TabIcon>}
    {page.title}
</TabItem>
```

Add `TabIcon` styled component:
```typescript
const TabIcon = styled.span`
    display: flex;
    align-items: center;
    flex-shrink: 0;

    svg {
        width: 14px;
        height: 14px;
    }
`;
```

- [ ] **Step 4: Polish TabItem styled component**

Update the `TabItem` styled component to match the spec:
- Add `display: flex`, `align-items: center`, `gap: 8px`
- Active state: `background: hsla(var(--primary) / 0.08)`, `border-left: 2.5px solid hsl(var(--primary))`, `color: hsl(var(--foreground))`, `font-weight: 500`
- Inactive: `color: hsl(var(--muted-foreground))`
- `padding: 8px 10px`, `border-radius: 7px`, `font-size: 13px`
- Hover (inactive): `background: var(--overlay-subtle)`

Update `GroupLabel` styling:
- `font-size: 10px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.5px`
- `color: hsl(var(--muted-foreground))` with reduced opacity
- `padding: 6px 10px`, `margin-bottom: 4px`

Add a divider between groups:
- After each group (except the last), render a `<GroupDivider />` styled as `height: 1px; background: var(--border-subtle); margin: 12px 10px;`

- [ ] **Step 5: Verify in browser**

Navigate to `/settings` and confirm:
- Tabs show icons + labels
- Active tab has purple left border + purple-tinted background
- Groups are visually separated by dividers
- Mobile dropdown still works

- [ ] **Step 6: Commit**

```bash
git add services/idun_agent_web/src/components/settings/paged-settings-container/component.tsx
git commit -m "style(web): polish settings container tabs with icons and active states"
```

---

### Task 7: Update Settings Page Tab Definitions

**Files:**
- Modify: `services/idun_agent_web/src/pages/settings/page.tsx`

Add icons to each tab definition and update labels to match spec.

- [ ] **Step 1: Read the current file**

Read `services/idun_agent_web/src/pages/settings/page.tsx`. Note the `pages` array definition.

- [ ] **Step 2: Add lucide-react icon imports**

```typescript
import { Settings as SettingsIcon, Users, FolderOpen, UserPlus } from 'lucide-react';
```

- [ ] **Step 3: Update the pages array**

Update each page definition to include the `icon` prop:
```typescript
const pages = [
    {
        title: t('settings.tabs.workspaceGeneral', 'General'),
        slug: 'workspace-general',
        group: t('settings.groups.workspace', 'Workspace'),
        icon: <SettingsIcon size={14} />,
        content: <WorkspaceGeneralTab />,
    },
    {
        title: t('settings.tabs.workspaceUsers', 'Members'),
        slug: 'workspace-users',
        group: t('settings.groups.workspace', 'Workspace'),
        icon: <Users size={14} />,
        content: <WorkspaceUsersTab />,
    },
    {
        title: t('settings.tabs.workspaceProjects', 'All Projects'),
        slug: 'workspace-projects',
        group: t('settings.groups.projects', 'Projects'),
        icon: <FolderOpen size={14} />,
        content: <WorkspaceProjectsTab />,
    },
    {
        title: t('settings.tabs.projectMembers', 'Project Members'),
        slug: 'project-members',
        group: t('settings.groups.projects', 'Projects'),
        icon: <UserPlus size={14} />,
        content: <ProjectMembersTab />,
    },
];
```

- [ ] **Step 4: Verify in browser**

Navigate to `/settings` and confirm all tabs show their icons.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_web/src/pages/settings/page.tsx
git commit -m "feat(web): add icons and update labels for settings tabs"
```

---

### Task 8: Update i18n Locale Files

**Files:**
- Modify: `services/idun_agent_web/src/i18n/locales/en.json` (and other locale files)

Add the new settings tab keys used in Task 7.

- [ ] **Step 1: Add English locale keys**

Add these keys to `en.json` under a `settings` section:
```json
{
  "settings": {
    "tabs": {
      "workspaceGeneral": "General",
      "workspaceUsers": "Members",
      "workspaceProjects": "All Projects",
      "projectMembers": "Project Members"
    },
    "groups": {
      "workspace": "Workspace",
      "projects": "Projects"
    }
  }
}
```

Do the same for `fr.json` (with French translations: "Général", "Membres", "Tous les projets", "Membres du projet", "Espace de travail", "Projets") and the other 5 locale files with appropriate translations.

- [ ] **Step 2: Commit**

```bash
git add services/idun_agent_web/src/i18n/locales/
git commit -m "feat(web): add i18n keys for redesigned settings tabs"
```

---

### Task 9: Polish WorkspaceGeneralTab

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/workspace-general/component.tsx`

Restyle from flat layout to card-based sections.

- [ ] **Step 1: Read the current file**

Read the full file (~290 lines). Note the existing styled components and JSX structure.

- [ ] **Step 2: Restyle the component**

Replace the existing styled components with card-based design. The component logic (state, API calls, handlers) stays the same — only the styled components and JSX layout change.

**New styled components pattern** (apply to all settings tabs — Tasks 8-11):

```typescript
const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const SectionCard = styled.div`
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 18px;
`;

const SectionTitle = styled.h4`
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 0 0 12px;
`;

const FormRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: flex-start;
`;

const StyledInput = styled.input`
    flex: 1;
    padding: 9px 12px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 7px;
    font-size: 13px;
    color: hsl(var(--foreground));
    font-family: inherit;
    transition: border-color 150ms ease;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.2);
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const PrimaryButton = styled.button`
    padding: 9px 16px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition: opacity 150ms ease;

    &:hover { opacity: 0.9; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const MetaGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
`;

const MetaItem = styled.div``;

const MetaLabel = styled.div`
    font-size: 10px;
    color: hsl(var(--muted-foreground));
    margin-bottom: 3px;
`;

const MetaValue = styled.div`
    font-size: 12px;
    color: hsl(var(--foreground));
    opacity: 0.7;
    font-family: var(--font-mono, monospace);
`;
```

**JSX structure:**
```tsx
<Container>
    {/* Rename card */}
    <SectionCard>
        <SectionTitle>{t(...)}</SectionTitle>
        <FormRow>
            <StyledInput value={name} onChange={...} />
            <PrimaryButton onClick={handleSave} disabled={!hasChanges || saving}>
                {saving ? '...' : t('save')}
            </PrimaryButton>
        </FormRow>
    </SectionCard>

    {/* Details card */}
    <SectionCard>
        <SectionTitle>{t(...)}</SectionTitle>
        <MetaGrid>
            <MetaItem>
                <MetaLabel>ID</MetaLabel>
                <MetaValue>{workspace?.id}</MetaValue>
            </MetaItem>
            <MetaItem>
                <MetaLabel>Slug</MetaLabel>
                <MetaValue>{workspace?.slug}</MetaValue>
            </MetaItem>
            <MetaItem>
                <MetaLabel>Role</MetaLabel>
                <MetaValue style={{ color: 'hsl(var(--primary))', fontFamily: 'inherit' }}>
                    {isCurrentWorkspaceOwner ? 'Owner' : 'Member'}
                </MetaValue>
            </MetaItem>
            <MetaItem>
                <MetaLabel>Default Project</MetaLabel>
                <MetaValue style={{ fontFamily: 'inherit' }}>
                    {workspace?.default_project_id ?? '—'}
                </MetaValue>
            </MetaItem>
        </MetaGrid>
    </SectionCard>
</Container>
```

- [ ] **Step 3: Verify in browser**

Navigate to `/settings/workspace-general` and confirm card layout, spacing, and colors.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-general/component.tsx
git commit -m "style(web): restyle WorkspaceGeneralTab with card-based layout"
```

---

### Task 10: Polish WorkspaceUsersTab

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/workspace-users/component.tsx`

Restyle the invite form and member tables with card-based layout.

- [ ] **Step 1: Read the current file**

Read the full file (~472 lines). Note the three visual sections: invite form, members table, invitations table.

- [ ] **Step 2: Restyle with card-based sections**

Same `SectionCard` pattern as Task 8. The component logic (state, API calls, handlers) stays the same.

Key changes:
- Wrap invite form in a `SectionCard` with title "Invite Member"
- Replace native checkbox with a styled toggle or keep as checkbox with better styling
- Wrap project assignments in a cleaner list (each project as a row with checkbox + role dropdown)
- Wrap members table in a `SectionCard` with title "Members (N)"
- Wrap invitations table in a `SectionCard` with title "Pending Invitations (N)"
- Style `<table>` elements: remove borders, use subtle row separators (`var(--border-subtle)`), increase padding
- Replace inline danger buttons with styled buttons matching platform design
- Replace native `<select>` for role assignment with styled select: `background: var(--overlay-subtle)`, `border: 1px solid var(--border-subtle)`, `border-radius: 6px`, `padding: 4px 8px`, `font-size: 12px`

- [ ] **Step 3: Verify in browser**

Navigate to `/settings/workspace-users` and confirm all three sections render correctly with card layout.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-users/component.tsx
git commit -m "style(web): restyle WorkspaceUsersTab with card-based layout"
```

---

### Task 11: Polish WorkspaceProjectsTab

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/workspace-projects/component.tsx`

Restyle project list with card-based layout.

- [ ] **Step 1: Read the current file**

Read the full file (~362 lines). Note the create form, project list with inline editing, and delete modal.

- [ ] **Step 2: Restyle with card-based sections**

Key changes:
- Wrap create form in a `SectionCard` with title "Create Project"
- Two inputs side by side (name + description) using `FormRow` with flex
- Project list: each project as its own mini-card inside a list container
  - Project card: `background: var(--overlay-subtle)`, `border: 1px solid var(--border-subtle)`, `border-radius: 8px`, `padding: 14px 16px`
  - Left: project name (13px, weight 600) + badges (Default in primary, Role in muted)
  - Right: action buttons (Rename, Delete) — styled as small ghost buttons
  - Inline edit mode: same card but inputs replace text
- `DeleteConfirmModal` usage stays the same

- [ ] **Step 3: Verify in browser**

Navigate to `/settings/workspace-projects` and confirm project cards, create form, and inline editing.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-projects/component.tsx
git commit -m "style(web): restyle WorkspaceProjectsTab with card-based layout"
```

---

### Task 12: Polish ProjectMembersTab

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/project-members/component.tsx`

Restyle member table with card-based layout.

- [ ] **Step 1: Read the current file**

Read the full file (~313 lines). Note the add-member form and members table.

- [ ] **Step 2: Restyle with card-based sections**

Key changes:
- Header: show current project name + role badge using styled components from spec
- Wrap add-member form in a `SectionCard` with title "Add Member"
  - Email input + role select + add button in a `FormRow`
  - Style the role select same as workspace-users (overlay background, subtle border)
- Wrap members table in a `SectionCard` with title "Members (N)"
  - Same table styling as workspace-users: no borders, subtle row separators, increased padding
  - Role select in each row styled consistently
  - Remove button styled as ghost danger button

- [ ] **Step 3: Verify in browser**

Navigate to `/settings/project-members` and confirm card layout, add form, and table.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/settings/project-members/component.tsx
git commit -m "style(web): restyle ProjectMembersTab with card-based layout"
```

---

## Chunk 5: Final Integration and Cleanup

### Task 13: Final Verification and Cleanup

**Files:**
- Potentially: all files from previous tasks

- [ ] **Step 1: Run linter**

```bash
cd services/idun_agent_web && npm run lint
```

Fix any lint errors.

- [ ] **Step 2: Full walkthrough in browser**

Test the complete flow:
1. Open app → header shows workspace/project selectors on the right
2. Click workspace trigger → popover opens, search works, switch workspace
3. Click project trigger → popover opens, switch project
4. Click gear icon → navigates to `/settings`
5. Settings page: sidebar tabs show icons, active states work
6. Each settings tab renders with card-based layout
7. Click avatar → user popover opens with "Account Settings" and "Sign out"
8. "Account Settings" → navigates to `/preferences`
9. Sidebar has no project selector, no user popover
10. Light mode: toggle theme and verify all colors work (no hardcoded dark values)

- [ ] **Step 3: Fix hardcoded colors**

In `services/idun_agent_web/src/pages/settings/page.tsx`, replace any `color: #ffffff` with `color: hsl(var(--foreground))`. Check `src/pages/user-preferences/page.tsx` for the same issue.

- [ ] **Step 4: Remove unused imports**

Check all modified files for unused imports (old styled components, removed features).

- [ ] **Step 5: Final commit**

```bash
git add services/idun_agent_web/src/
git commit -m "chore(web): cleanup unused imports, fix hardcoded colors, lint fixes"
```
