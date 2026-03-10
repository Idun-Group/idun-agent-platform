# Project UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three connected frontend features: a breadcrumb-style project picker in the navbar, project assignment during member invitation, and a role-aware project management page in settings.

**Architecture:** Pure frontend changes — the backend already supports all needed APIs. We add a `ProjectPickerDropdown` component for the navbar, extend `InviteMemberDialog` with project assignment checkboxes, create a `WorkspaceProjectsTab` settings component, and enhance the `useProject` hook with user role information. Role-based visibility is determined by `is_owner` from workspace membership and project-level roles from a new project members endpoint.

**Tech Stack:** React 19, TypeScript, styled-components, React Router 7, i18next, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-10-project-ui-design.md`

---

## Chunk 1: Foundation and Navbar

### Task 1: Add i18n translation keys

**Files:**
- Modify: `services/idun_agent_web/src/i18n/locales/en.json`

- [ ] **Step 1: Add new translation keys to en.json**

Add/update these keys in the JSON file. Merge into existing structure — don't duplicate existing keys.

Under `"header"`:
```json
"header": {
  "project": {
    "label": "Project",
    "filter": "Filter projects...",
    "manage": "Manage projects"
  },
  "search": "Search..."
}
```

Under `"projects"` (merge with existing):
```json
"projects": {
  "manage": "Manage Projects",
  "create": "Create project",
  "default": "Default",
  "namePlaceholder": "Project name",
  "createSuccess": "Project created",
  "updateSuccess": "Project updated",
  "deleteSuccess": "Project deleted",
  "delete": {
    "confirm": "Delete this project? Resources will be moved to the default project.",
    "title": "Delete project"
  },
  "rename": "Rename",
  "noProjects": "No projects yet.",
  "resourceCount_one": "{{count}} resource",
  "resourceCount_other": "{{count}} resources",
  "memberCount_one": "{{count}} member",
  "memberCount_other": "{{count}} members",
  "roles": {
    "admin": "Admin",
    "contributor": "Contributor",
    "reader": "Reader"
  }
}
```

Under `"settings"`:
```json
"settings": {
  "group": {
    "workspaces": "Workspace",
    "projectSettings": "Project Settings"
  },
  "workspaces": {
    "projects": "Projects",
    "general": "General",
    "users": "Members"
  },
  "projects": {
    "title": "Projects",
    "description": "Manage projects in this workspace.",
    "createButton": "New project",
    "ownerInfo": "Workspace owners have admin access to all projects by default. No project assignment needed.",
    "projectAccess": "Project access",
    "projectAccessHelp": "Select which projects this member can access and their role in each."
  }
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `cd services/idun_agent_web && node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8')); console.log('OK')"`

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/i18n/locales/en.json
git commit -m "feat: add i18n keys for project UI features"
```

---

### Task 2: Enhance useProject hook with role info and auto-select

The hook needs to: (a) auto-select the default project when none is selected, and (b) expose user role per project so settings and sidebar can determine visibility.

**Files:**
- Modify: `services/idun_agent_web/src/hooks/use-project.tsx`

**Context:**
- Current hook: `services/idun_agent_web/src/hooks/use-project.tsx` (107 lines)
- Exports: `Project` type, `ProjectProvider`, `useProject()`
- API: `GET /api/v1/projects/` returns `Project[]`
- API: `GET /api/v1/projects/{id}/members` returns `{ members: ProjectMemberRead[], total }`
- API: `GET /api/v1/workspaces/{id}/members` returns `{ members: [{user_id, is_owner, ...}], total }`
- Backend `GET /api/v1/projects/` returns only projects the user can see (owners see all, members see assigned)
- The `Session` type from `../utils/auth` has `principal?.user_id` (properly typed, no need for `any` cast)
- `X-Project-Id` header is already attached to API calls in `src/utils/api.ts:31-32` via `localStorage.getItem('activeProjectId')` — no changes needed for this.

**Approach:** Add a `projectRoles` map (`Record<string, ProjectRole>`) to the context. Fetch workspace members to determine `is_owner`, then for non-owners fetch each project's members to find the user's role. Auto-select default project on first load.

- [ ] **Step 1: Add project role types and extend context interface**

Add after the `Project` type definition:

```typescript
export type ProjectRole = 'admin' | 'contributor' | 'reader';

type ProjectMemberRead = {
    user_id: string;
    role: ProjectRole;
};

type ProjectMemberListResponse = {
    members: ProjectMemberRead[];
    total: number;
};
```

Extend `ProjectContextValue` interface to add:

```typescript
interface ProjectContextValue {
    selectedProjectId: string | null;
    setSelectedProjectId: (id: string | null) => void;
    projects: Project[];
    projectRoles: Record<string, ProjectRole>;
    isWorkspaceOwner: boolean;
    canAccessSettings: boolean;
    refreshProjects: () => Promise<void>;
    createProject: (name: string) => Promise<Project>;
    updateProject: (id: string, name: string) => Promise<Project>;
    deleteProject: (id: string) => Promise<void>;
}
```

- [ ] **Step 2: Implement role fetching and auto-select in the provider**

In `ProjectProvider`, add state for roles and import auth:

```typescript
import { useAuth } from './use-auth';
import type { Session } from '../utils/auth';
```

In the provider body, add:

```typescript
const { session } = useAuth();
const [projectRoles, setProjectRoles] = useState<Record<string, ProjectRole>>({});
const [isWorkspaceOwner, setIsWorkspaceOwner] = useState(false);
```

Update `refreshProjects` to include auto-select:

```typescript
const refreshProjects = useCallback(async () => {
    try {
        const data = await getJson<Project[]>('/api/v1/projects/');
        setProjects(data);

        // Auto-select: if no project selected or selected project not in list, pick default
        const currentId = localStorage.getItem(STORAGE_KEY);
        const validSelection = currentId && data.some((p) => p.id === currentId);
        if (!validSelection && data.length > 0) {
            const defaultProject = data.find((p) => p.is_default) ?? data[0];
            setSelectedProjectId(defaultProject.id);
        }
    } catch (error) {
        console.error('Error fetching projects:', error);
    }
}, [setSelectedProjectId]);
```

Add a separate `refreshRoles` function:

```typescript
const refreshRoles = useCallback(async (projectList: Project[], userId: string) => {
    try {
        // Check workspace owner status via workspace members
        const workspaces = await getJson<{ id: string }[]>('/api/v1/workspaces/');
        if (workspaces.length === 0) return;
        const wsId = workspaces[0].id;

        const memberRes = await getJson<{
            members: { user_id: string; is_owner: boolean }[];
        }>(`/api/v1/workspaces/${wsId}/members`);

        const currentMember = memberRes.members.find((m) => m.user_id === userId);
        const ownerStatus = currentMember?.is_owner ?? false;
        setIsWorkspaceOwner(ownerStatus);

        if (ownerStatus) {
            // Owners are implicit admin on all projects
            const roles: Record<string, ProjectRole> = {};
            for (const p of projectList) {
                roles[p.id] = 'admin';
            }
            setProjectRoles(roles);
        } else {
            // Fetch role for each project
            const roles: Record<string, ProjectRole> = {};
            await Promise.all(
                projectList.map(async (p) => {
                    try {
                        const res = await getJson<ProjectMemberListResponse>(
                            `/api/v1/projects/${p.id}/members`,
                        );
                        const me = res.members.find((m) => m.user_id === userId);
                        if (me) roles[p.id] = me.role;
                    } catch {
                        // ignore - user might not have access
                    }
                }),
            );
            setProjectRoles(roles);
        }
    } catch {
        // ignore errors
    }
}, []);
```

- [ ] **Step 3: Wire role fetching and compute canAccessSettings**

The `useAuth` import and `session` state were added in Step 2. Now add a `useEffect` to trigger role refresh when projects and session are available. The `Session` type from `../utils/auth` has `principal?.user_id` properly typed — no `any` cast needed:

```typescript
useEffect(() => {
    const userId = session?.principal?.user_id;
    if (userId && projects.length > 0) {
        refreshRoles(projects, userId);
    }
}, [projects, session, refreshRoles]);
```

Compute `canAccessSettings` as a derived value:

```typescript
const canAccessSettings = isWorkspaceOwner ||
    Object.values(projectRoles).some((r) => r === 'admin');
```

Update the context value to include all new fields:

```typescript
value={{
    selectedProjectId,
    setSelectedProjectId,
    projects,
    projectRoles,
    isWorkspaceOwner,
    canAccessSettings,
    refreshProjects,
    createProject,
    updateProject,
    deleteProject,
}}
```

- [ ] **Step 4: Verify the app still loads**

Run: `cd services/idun_agent_web && npm run dev`
Open browser at `http://localhost:5173/agents` — verify no console errors and project dropdown still works.

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_web/src/hooks/use-project.tsx
git commit -m "feat: enhance useProject hook with role info and auto-select"
```

---

### Task 3: Create ProjectPickerDropdown component

**Files:**
- Create: `services/idun_agent_web/src/components/project-picker/component.tsx`

**Context:**
- Design: Breadcrumb style — "Project / {name}" with chevron-down, opens a dropdown with filter + project list + "Manage projects" link
- Pattern: Use absolute positioning + outside-click detection (matches `user-popover` pattern)
- Styling: styled-components with HSL CSS variables
- Icons: Lucide (`ChevronDown`, `Check`, `Search`, `Settings`)

- [ ] **Step 1: Create the component file**

Create `services/idun_agent_web/src/components/project-picker/component.tsx`:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { ChevronDown, Check, Search, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/use-project';

const ProjectPickerDropdown = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { projects, selectedProjectId, setSelectedProjectId, canAccessSettings } =
        useProject();

    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const filterInputRef = useRef<HTMLInputElement>(null);

    const selectedProject = projects.find((p) => p.id === selectedProjectId);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setFilter('');
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    // Focus filter input when dropdown opens
    useEffect(() => {
        if (open && filterInputRef.current) {
            filterInputRef.current.focus();
        }
    }, [open]);

    const handleSelect = useCallback(
        (projectId: string) => {
            setSelectedProjectId(projectId);
            setOpen(false);
            setFilter('');
        },
        [setSelectedProjectId],
    );

    const handleManage = useCallback(() => {
        setOpen(false);
        setFilter('');
        navigate('/settings/workspace-projects');
    }, [navigate]);

    const filtered = filter
        ? projects.filter((p) =>
              p.name.toLowerCase().includes(filter.toLowerCase()),
          )
        : projects;

    return (
        <Container ref={containerRef}>
            <BreadcrumbLabel>{t('header.project.label', 'Project')}</BreadcrumbLabel>
            <Separator>/</Separator>
            <Trigger $isOpen={open} onClick={() => setOpen((prev) => !prev)}>
                <TriggerName>
                    {selectedProject?.name ?? '—'}
                </TriggerName>
                <ChevronDown
                    size={12}
                    style={{
                        transition: 'transform 150ms ease',
                        transform: open ? 'rotate(180deg)' : 'none',
                    }}
                />
            </Trigger>

            {open && (
                <Dropdown>
                    <FilterWrapper>
                        <FilterRow>
                            <Search size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <FilterInput
                                ref={filterInputRef}
                                type="text"
                                placeholder={t('header.project.filter', 'Filter projects...')}
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                        </FilterRow>
                    </FilterWrapper>

                    <ProjectList>
                        {filtered.map((project) => {
                            const isSelected = project.id === selectedProjectId;
                            return (
                                <ProjectItem
                                    key={project.id}
                                    $isSelected={isSelected}
                                    onClick={() => handleSelect(project.id)}
                                >
                                    <CheckSlot>
                                        {isSelected && (
                                            <Check size={14} color="hsl(var(--primary))" />
                                        )}
                                    </CheckSlot>
                                    <ProjectName $isSelected={isSelected}>
                                        {project.name}
                                    </ProjectName>
                                    {project.is_default && (
                                        <DefaultBadge>
                                            {t('projects.default', 'Default')}
                                        </DefaultBadge>
                                    )}
                                </ProjectItem>
                            );
                        })}
                        {filtered.length === 0 && (
                            <EmptyText>
                                {t('projects.noProjects', 'No projects found.')}
                            </EmptyText>
                        )}
                    </ProjectList>

                    {canAccessSettings && (
                        <ManageSection>
                            <ManageLink onClick={handleManage}>
                                <Settings size={13} />
                                <span>{t('header.project.manage', 'Manage projects')}</span>
                            </ManageLink>
                        </ManageSection>
                    )}
                </Dropdown>
            )}
        </Container>
    );
};

export default ProjectPickerDropdown;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const dropdownIn = keyframes`
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
    display: flex;
    align-items: center;
    gap: 0;
    position: relative;
`;

const BreadcrumbLabel = styled.span`
    color: hsl(var(--muted-foreground));
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
`;

const Separator = styled.span`
    color: hsl(var(--muted-foreground) / 0.4);
    font-size: 13px;
    margin: 0 7px;
`;

const Trigger = styled.button<{ $isOpen: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 7px;
    cursor: pointer;
    transition: all 150ms ease;
    background: ${({ $isOpen }) =>
        $isOpen ? 'hsla(var(--primary) / 0.12)' : 'var(--overlay-subtle)'};
    border: 1px solid ${({ $isOpen }) =>
        $isOpen ? 'hsla(var(--primary) / 0.3)' : 'var(--border-light)'};
    color: hsl(var(--foreground));
    font-family: inherit;

    &:hover {
        background: ${({ $isOpen }) =>
            $isOpen ? 'hsla(var(--primary) / 0.12)' : 'var(--overlay-light)'};
        border-color: ${({ $isOpen }) =>
            $isOpen ? 'hsla(var(--primary) / 0.3)' : 'var(--overlay-strong)'};
    }
`;

const TriggerName = styled.span`
    font-size: 13px;
    font-weight: 500;
`;

const Dropdown = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 240px;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    z-index: 100;
    animation: ${dropdownIn} 150ms ease;
`;

const FilterWrapper = styled.div`
    padding: 10px 12px 8px;
`;

const FilterRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 6px;
`;

const FilterInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-family: inherit;

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const ProjectList = styled.div`
    padding: 0 6px 4px;
    max-height: 240px;
    overflow-y: auto;
`;

const ProjectItem = styled.button<{ $isSelected: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 6px;
    background: ${({ $isSelected }) =>
        $isSelected ? 'hsla(var(--primary) / 0.1)' : 'transparent'};
    cursor: pointer;
    font-family: inherit;
    transition: background 100ms ease;
    text-align: left;

    &:hover {
        background: ${({ $isSelected }) =>
            $isSelected ? 'hsla(var(--primary) / 0.1)' : 'var(--overlay-subtle)'};
    }
`;

const CheckSlot = styled.span`
    width: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ProjectName = styled.span<{ $isSelected: boolean }>`
    font-size: 13px;
    font-weight: ${({ $isSelected }) => ($isSelected ? '500' : '400')};
    color: ${({ $isSelected }) =>
        $isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'};
`;

const DefaultBadge = styled.span`
    margin-left: auto;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: hsla(var(--primary) / 0.15);
    color: hsl(var(--primary));
    font-weight: 500;
`;

const EmptyText = styled.p`
    padding: 12px 10px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    margin: 0;
`;

const ManageSection = styled.div`
    border-top: 1px solid var(--border-subtle);
    padding: 8px 12px;
`;

const ManageLink = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    font-size: 12px;
    font-family: inherit;
    width: 100%;
    transition: all 100ms ease;

    &:hover {
        background: var(--overlay-subtle);
        color: hsl(var(--foreground));
    }
`;
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit --pretty 2>&1 | head -20`
Check for type errors.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/components/project-picker/component.tsx
git commit -m "feat: create ProjectPickerDropdown component"
```

---

### Task 4: Rewrite header layout

Replace the old header (logo + select dropdown) with the new three-zone layout: logo left, search placeholder center, project picker right.

**Files:**
- Modify: `services/idun_agent_web/src/layouts/header/layout.tsx`

**Context:**
- Current file: 164 lines with `Header` component, `HeaderContainer`, `Logo`, `Title`, `Select`, `SideContainer` styled components
- Currently imports and renders `ProjectManager` modal
- Remove: `ProjectManager` import, `showProjectManager` state, `Select` usage, workspace selector code
- Remove: `useWorkspace` import (no longer needed in header)
- Add: `ProjectPickerDropdown` import
- Add: Search placeholder UI

- [ ] **Step 1: Rewrite the header component**

Replace the entire file content with:

```typescript
import { useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../hooks/use-project';
import { useAuth } from '../../hooks/use-auth';
import { Search } from 'lucide-react';
import ProjectPickerDropdown from '../../components/project-picker/component';

const Header = () => {
    const navigate = useNavigate();
    const { refreshProjects } = useProject();
    const { session, isLoading: isAuthLoading } = useAuth();

    useEffect(() => {
        if (isAuthLoading || !session) return;
        refreshProjects();
    }, [isAuthLoading, session, refreshProjects]);

    return (
        <HeaderContainer>
            {/* Left: Logo */}
            <LeftZone>
                <Title onClick={() => navigate('/agents')} style={{ cursor: 'pointer' }}>
                    <Logo src="/img/logo/favicon.svg" alt="Idun Logo" /> Idun Platform
                </Title>
            </LeftZone>

            {/* Center: Search placeholder */}
            <CenterZone>
                <SearchPlaceholder>
                    <Search size={14} color="hsl(var(--muted-foreground) / 0.6)" />
                    <SearchText>Search...</SearchText>
                    <KbdHint>⌘K</KbdHint>
                </SearchPlaceholder>
            </CenterZone>

            {/* Right: Project picker */}
            <RightZone>
                {session && <ProjectPickerDropdown />}
            </RightZone>
        </HeaderContainer>
    );
};

export default Header;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const HeaderContainer = styled.header`
    background-color: hsl(var(--header-bg) / 0.9);
    padding: 0 24px;
    height: 56px;
    border-bottom: 1px solid hsl(var(--header-border));
    transition: background-color 0.3s ease, border-color 0.3s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: saturate(180%) blur(8px);
`;

const LeftZone = styled.div`
    display: flex;
    align-items: center;
    min-width: 160px;
`;

const CenterZone = styled.div`
    flex: 0 1 420px;
    margin: 0 32px;
`;

const RightZone = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 160px;
`;

const Logo = styled.img`
    height: 28px;
    margin-right: 0.5rem;
`;

const Title = styled.h1`
    font-size: 1.1rem;
    color: hsl(var(--header-text));
    display: flex;
    align-items: center;
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.01em;
`;

const SearchPlaceholder = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 9px;
    cursor: default;
`;

const SearchText = styled.span`
    color: hsl(var(--muted-foreground) / 0.5);
    font-size: 13px;
`;

const KbdHint = styled.span`
    margin-left: auto;
    color: hsl(var(--muted-foreground) / 0.3);
    font-size: 11px;
    border: 1px solid var(--border-light);
    padding: 2px 7px;
    border-radius: 4px;
    font-family: monospace;
`;
```

- [ ] **Step 2: Verify the header renders**

Run: `cd services/idun_agent_web && npm run dev`
Open browser — verify three-zone layout appears: logo left, search center, project picker right. Click the picker trigger to open/close dropdown.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/layouts/header/layout.tsx
git commit -m "feat: rewrite header with three-zone layout and project picker"
```

---

## Chunk 2: Invitation Flow

### Task 5: Update members service with project_assignments

**Files:**
- Modify: `services/idun_agent_web/src/services/members.ts`

**Context:**
- Current `addMember()` sends `{ email: string; is_owner: boolean }`
- Backend `MemberAdd` schema already accepts `project_assignments: list[ProjectAssignment]`
- `ProjectAssignment` has `project_id: str` and `role: ProjectRole` (admin/contributor/reader)

- [ ] **Step 1: Add ProjectAssignment type and update addMember signature**

Add after the existing types:

```typescript
export type ProjectRole = 'admin' | 'contributor' | 'reader';

export type ProjectAssignment = {
    project_id: string;
    role: ProjectRole;
};
```

Update `addMember` signature:

```typescript
export async function addMember(
    workspaceId: string,
    body: {
        email: string;
        is_owner: boolean;
        project_assignments?: ProjectAssignment[];
    },
): Promise<WorkspaceMember | WorkspaceInvitation> {
    return postJson<
        WorkspaceMember | WorkspaceInvitation,
        { email: string; is_owner: boolean; project_assignments?: ProjectAssignment[] }
    >(
        `/api/v1/workspaces/${workspaceId}/members`,
        body,
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/services/members.ts
git commit -m "feat: add project_assignments to addMember service"
```

---

### Task 6: Update InviteMemberDialog with project assignment

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/workspace-users/component.tsx`

**Context:**
- `InviteMemberDialog` is defined at line 332-475 in the workspace-users component
- Currently collects email + isOwner toggle
- Needs: project access section (for non-owners) and info note (for owners)
- `handleInvite` at line 79 calls `addMember(wsId, { email, is_owner })` — needs `project_assignments`
- The dialog receives `onInvite` prop with signature `(email, isOwner) => Promise<void>` — needs to be extended

- [ ] **Step 1: Update the onInvite callback signature and handleInvite**

Change the `handleInvite` function (around line 79) to accept project assignments:

```typescript
const handleInvite = async (
    email: string,
    isOwner: boolean,
    projectAssignments: ProjectAssignment[],
) => {
    const wsId = await resolveWorkspaceId();
    if (!wsId) return;
    try {
        await addMember(wsId, {
            email,
            is_owner: isOwner,
            project_assignments: isOwner ? [] : projectAssignments,
        });
        notify.success(t('settings.workspaces.users.memberAdded', 'Member added'));
        fetchMembers();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to add member';
        notify.error(msg);
    }
};
```

Update the import to include `ProjectAssignment`:

```typescript
import {
    listMembers,
    addMember,
    removeMember,
    cancelInvitation,
    WORKSPACE_ROLE_LABELS,
    WORKSPACE_ROLE_PERMISSIONS,
    type WorkspaceMember,
    type WorkspaceInvitation,
    type ProjectAssignment,
    type ProjectRole,
} from '../../../services/members';
```

Add `useProject` import:

```typescript
import { useProject } from '../../../hooks/use-project';
```

Update `InviteMemberDialogProps`:

```typescript
type InviteMemberDialogProps = {
    onInvite: (
        email: string,
        isOwner: boolean,
        projectAssignments: ProjectAssignment[],
    ) => Promise<void>;
    onClose: () => void;
};
```

- [ ] **Step 2: Add project assignment UI to InviteMemberDialog**

In the `InviteMemberDialog` component, add state and project data:

```typescript
const { projects } = useProject();
const [assignments, setAssignments] = useState<Record<string, ProjectRole | null>>({});
```

Add helper functions:

```typescript
const toggleProject = (projectId: string) => {
    setAssignments((prev) => {
        const next = { ...prev };
        if (next[projectId]) {
            next[projectId] = null;
        } else {
            next[projectId] = 'contributor';
        }
        return next;
    });
};

const setProjectRole = (projectId: string, role: ProjectRole) => {
    setAssignments((prev) => ({ ...prev, [projectId]: role }));
};
```

Update `handleSubmit` to include assignments:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
        setError(t('settings.workspaces.users.emailRequired', 'Email is required'));
        return;
    }

    const projectAssignments: ProjectAssignment[] = Object.entries(assignments)
        .filter(([, role]) => role !== null)
        .map(([project_id, role]) => ({ project_id, role: role! }));

    setSubmitting(true);
    try {
        await onInvite(email.trim(), isOwner, projectAssignments);
        onClose();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to add member';
        setError(msg);
    } finally {
        setSubmitting(false);
    }
};
```

Add the project access section JSX after the role grid `FieldGroup` and before the `{error && ...}` line. Insert:

```tsx
{/* Project assignment section */}
{!isOwner ? (
    <FieldGroup>
        <FieldLabel>
            {t('settings.projects.projectAccess', 'Project access')}
        </FieldLabel>
        <ProjectAccessList>
            {projects.map((project) => {
                const assigned = !!assignments[project.id];
                return (
                    <ProjectAccessRow
                        key={project.id}
                        $assigned={assigned}
                    >
                        <ProjectCheckArea onClick={() => toggleProject(project.id)}>
                            <ProjectCheckbox $checked={assigned}>
                                {assigned && (
                                    <Check size={11} color="hsl(var(--primary))" />
                                )}
                            </ProjectCheckbox>
                            <ProjectAccessName $assigned={assigned}>
                                {project.name}
                            </ProjectAccessName>
                            {project.is_default && (
                                <ProjectDefaultBadge>
                                    {t('projects.default', 'Default')}
                                </ProjectDefaultBadge>
                            )}
                        </ProjectCheckArea>
                        {assigned ? (
                            <RoleSelect
                                value={assignments[project.id] ?? 'contributor'}
                                onChange={(e) =>
                                    setProjectRole(
                                        project.id,
                                        e.target.value as ProjectRole,
                                    )
                                }
                            >
                                <option value="admin">
                                    {t('projects.roles.admin', 'Admin')}
                                </option>
                                <option value="contributor">
                                    {t('projects.roles.contributor', 'Contributor')}
                                </option>
                                <option value="reader">
                                    {t('projects.roles.reader', 'Reader')}
                                </option>
                            </RoleSelect>
                        ) : (
                            <RoleDash>—</RoleDash>
                        )}
                    </ProjectAccessRow>
                );
            })}
        </ProjectAccessList>
        <ProjectAccessHelp>
            {t(
                'settings.projects.projectAccessHelp',
                'Select which projects this member can access and their role in each.',
            )}
        </ProjectAccessHelp>
    </FieldGroup>
) : (
    <OwnerInfoBox>
        <InfoIcon>
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
            >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
            </svg>
        </InfoIcon>
        <OwnerInfoText>
            {t(
                'settings.projects.ownerInfo',
                'Workspace owners have admin access to all projects by default. No project assignment needed.',
            )}
        </OwnerInfoText>
    </OwnerInfoBox>
)}
```

- [ ] **Step 3: Add styled components for project assignment UI**

Add these styled components after the existing ones in the file:

```typescript
// Project assignment styles
const ProjectAccessList = styled.div`
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
`;

const ProjectAccessRow = styled.div<{ $assigned: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: ${({ $assigned }) =>
        $assigned ? 'hsla(var(--primary) / 0.04)' : 'transparent'};

    & + & {
        border-top: 1px solid var(--border-subtle);
    }
`;

const ProjectCheckArea = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    flex: 1;
`;

const ProjectCheckbox = styled.div<{ $checked: boolean }>`
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1.5px solid ${({ $checked }) =>
        $checked ? 'hsl(var(--primary))' : 'var(--border-light)'};
    background: ${({ $checked }) =>
        $checked ? 'hsla(var(--primary) / 0.15)' : 'transparent'};
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms ease;
    flex-shrink: 0;
`;

const ProjectAccessName = styled.span<{ $assigned: boolean }>`
    font-size: 13px;
    font-weight: ${({ $assigned }) => ($assigned ? '500' : '400')};
    color: ${({ $assigned }) =>
        $assigned ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'};
`;

const ProjectDefaultBadge = styled.span`
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: hsla(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-weight: 500;
`;

const RoleSelect = styled.select`
    padding: 4px 10px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--muted-foreground));
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
    padding-right: 24px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23826F95' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    option {
        background: hsl(var(--popover));
        color: hsl(var(--foreground));
    }
`;

const RoleDash = styled.span`
    color: hsl(var(--muted-foreground) / 0.3);
    font-size: 12px;
    padding: 4px 10px;
`;

const ProjectAccessHelp = styled.p`
    margin: 6px 0 0;
    font-size: 12px;
    color: hsl(var(--muted-foreground) / 0.6);
    line-height: 1.4;
`;

const OwnerInfoBox = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 16px;
    background: hsla(var(--primary) / 0.05);
    border: 1px solid hsla(var(--primary) / 0.12);
    border-radius: 8px;
`;

const InfoIcon = styled.span`
    flex-shrink: 0;
    margin-top: 1px;
    display: flex;
`;

const OwnerInfoText = styled.span`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
`;
```

- [ ] **Step 4: Verify the invitation dialog works**

Run: `cd services/idun_agent_web && npm run dev`
Navigate to Settings → Members → click "Add member". Verify:
1. Selecting "Member" role shows project checkboxes
2. Selecting "Owner" shows info note
3. Checking a project enables the role dropdown
4. Submitting sends project_assignments

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-users/component.tsx
git commit -m "feat: add project assignment to invitation dialog"
```

---

## Chunk 3: Settings Page and Cleanup

### Task 7: Create WorkspaceProjectsTab settings component

**Files:**
- Create: `services/idun_agent_web/src/components/settings/workspace-projects/component.tsx`

**Context:**
- This replaces the `ProjectManager` modal
- **Deferred:** Resource count and member count display per card (spec mentions these but the project list API doesn't return counts; would require N+1 calls or a new backend endpoint. Adding these is a follow-up task.)
- For workspace owners: full CRUD (create, rename, delete) on all projects
- For project admins: rename only on projects where they are admin
- Each project shows as a horizontal card: icon, name, badges, edit/delete buttons
- Uses `useProject()` hook for CRUD operations
- Pattern follows `workspace-users/component.tsx` (page title + description + card list)

- [ ] **Step 1: Create the component**

Create `services/idun_agent_web/src/components/settings/workspace-projects/component.tsx`:

```typescript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled, { keyframes } from 'styled-components';
import { Plus, Pencil, Trash2, Check, X, Grid3X3 } from 'lucide-react';
import { notify } from '../../toast/notify';
import { useProject } from '../../../hooks/use-project';

const WorkspaceProjectsTab = () => {
    const { t } = useTranslation();
    const {
        projects,
        projectRoles,
        isWorkspaceOwner,
        createProject,
        updateProject,
        deleteProject,
    } = useProject();

    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Filter projects: owners see all, admins see only their admin projects
    const visibleProjects = isWorkspaceOwner
        ? projects
        : projects.filter((p) => projectRoles[p.id] === 'admin');

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            await createProject(newName.trim());
            setNewName('');
            notify.success(t('projects.createSuccess', 'Project created'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to create project';
            notify.error(msg);
        } finally {
            setCreating(false);
        }
    };

    const handleRename = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await updateProject(id, editName.trim());
            setEditingId(null);
            notify.success(t('projects.updateSuccess', 'Project updated'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to rename project';
            notify.error(msg);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteProject(id);
            setDeletingId(null);
            notify.success(t('projects.deleteSuccess', 'Project deleted'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to delete project';
            notify.error(msg);
        }
    };

    const startEdit = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    return (
        <Container>
            <HeaderRow>
                <div>
                    <PageTitle>{t('settings.projects.title', 'Projects')}</PageTitle>
                    <PageDescription>
                        {t('settings.projects.description', 'Manage projects in this workspace.')}
                    </PageDescription>
                </div>
            </HeaderRow>

            {/* Create new project — owners only */}
            {isWorkspaceOwner && (
                <CreateRow>
                    <CreateInput
                        type="text"
                        placeholder={t('projects.namePlaceholder', 'Project name')}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <CreateButton onClick={handleCreate} disabled={creating || !newName.trim()}>
                        <Plus size={15} />
                        {t('settings.projects.createButton', 'New project')}
                    </CreateButton>
                </CreateRow>
            )}

            {/* Project list */}
            <ProjectGrid>
                {visibleProjects.map((project) => {
                    const isEditing = editingId === project.id;
                    const isDeleting = deletingId === project.id;
                    const userRole = projectRoles[project.id];
                    const canDelete = isWorkspaceOwner && !project.is_default;

                    return (
                        <ProjectCard key={project.id}>
                            <ProjectCardLeft>
                                <ProjectIcon>
                                    <Grid3X3 size={16} color="hsl(var(--primary))" />
                                </ProjectIcon>
                                <ProjectInfo>
                                    {isEditing ? (
                                        <EditRow>
                                            <EditInput
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(project.id);
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                                autoFocus
                                            />
                                            <IconBtn onClick={() => handleRename(project.id)}>
                                                <Check size={14} color="hsl(var(--primary))" />
                                            </IconBtn>
                                            <IconBtn onClick={() => setEditingId(null)}>
                                                <X size={14} />
                                            </IconBtn>
                                        </EditRow>
                                    ) : (
                                        <ProjectNameRow>
                                            <ProjectName>{project.name}</ProjectName>
                                            {project.is_default && (
                                                <Badge $variant="default">
                                                    {t('projects.default', 'Default')}
                                                </Badge>
                                            )}
                                            {!isWorkspaceOwner && userRole && (
                                                <Badge $variant="role">
                                                    {t(`projects.roles.${userRole}`, userRole)}
                                                </Badge>
                                            )}
                                        </ProjectNameRow>
                                    )}
                                </ProjectInfo>
                            </ProjectCardLeft>

                            {!isEditing && !isDeleting && (
                                <ProjectActions>
                                    <IconBtn
                                        onClick={() => startEdit(project.id, project.name)}
                                        title={t('projects.rename', 'Rename')}
                                    >
                                        <Pencil size={14} />
                                    </IconBtn>
                                    {canDelete && (
                                        <IconBtn
                                            $destructive
                                            onClick={() => setDeletingId(project.id)}
                                            title={t('projects.delete.title', 'Delete project')}
                                        >
                                            <Trash2 size={14} />
                                        </IconBtn>
                                    )}
                                </ProjectActions>
                            )}

                            {isDeleting && (
                                <DeleteConfirm>
                                    <DeleteText>
                                        {t(
                                            'projects.delete.confirm',
                                            'Delete this project? Resources will be moved to the default project.',
                                        )}
                                    </DeleteText>
                                    <DeleteActions>
                                        <DeleteBtn onClick={() => handleDelete(project.id)}>
                                            {t('projects.delete.title', 'Delete')}
                                        </DeleteBtn>
                                        <CancelBtn onClick={() => setDeletingId(null)}>
                                            {t('common.cancel', 'Cancel')}
                                        </CancelBtn>
                                    </DeleteActions>
                                </DeleteConfirm>
                            )}
                        </ProjectCard>
                    );
                })}

                {visibleProjects.length === 0 && (
                    <EmptyText>{t('projects.noProjects', 'No projects yet.')}</EmptyText>
                )}
            </ProjectGrid>
        </Container>
    );
};

export default WorkspaceProjectsTab;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
`;

const PageTitle = styled.h2`
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px 0;
`;

const PageDescription = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const CreateRow = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
`;

const CreateInput = styled.input`
    flex: 1;
    max-width: 320px;
    padding: 9px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-family: inherit;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const CreateButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    color: hsl(var(--primary-foreground));
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 150ms ease;
    white-space: nowrap;

    &:hover:not(:disabled) {
        filter: brightness(0.9);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const ProjectGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ProjectCard = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    transition: border-color 150ms ease;

    &:hover {
        border-color: var(--overlay-strong);
    }
`;

const ProjectCardLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
`;

const ProjectIcon = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: hsla(var(--primary) / 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ProjectInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const ProjectNameRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ProjectName = styled.span`
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
`;

const Badge = styled.span<{ $variant: 'default' | 'role' }>`
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 500;
    background: ${({ $variant }) =>
        $variant === 'default'
            ? 'hsla(var(--primary) / 0.12)'
            : 'hsla(var(--warning) / 0.12)'};
    color: ${({ $variant }) =>
        $variant === 'default'
            ? 'hsl(var(--primary))'
            : 'hsl(var(--warning))'};
`;

const ProjectActions = styled.div`
    display: flex;
    gap: 4px;
    flex-shrink: 0;
`;

const IconBtn = styled.button<{ $destructive?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 150ms ease;

    &:hover {
        background: ${({ $destructive }) =>
            $destructive
                ? 'hsla(var(--destructive) / 0.1)'
                : 'var(--overlay-light)'};
        color: ${({ $destructive }) =>
            $destructive
                ? 'hsl(var(--destructive))'
                : 'hsl(var(--foreground))'};
    }
`;

const EditRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const EditInput = styled.input`
    padding: 5px 10px;
    background: var(--overlay-subtle);
    border: 1px solid hsl(var(--primary));
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-family: inherit;
    width: 200px;

    &:focus {
        outline: none;
    }
`;

const DeleteConfirm = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
`;

const DeleteText = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    max-width: 200px;
`;

const DeleteActions = styled.div`
    display: flex;
    gap: 6px;
`;

const DeleteBtn = styled.button`
    padding: 5px 12px;
    background: hsl(var(--destructive));
    border: none;
    border-radius: 6px;
    color: hsl(var(--destructive-foreground));
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;

    &:hover {
        filter: brightness(0.9);
    }
`;

const CancelBtn = styled.button`
    padding: 5px 12px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;

    &:hover {
        background: var(--overlay-subtle);
    }
`;

const EmptyText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    padding: 32px 0;
    margin: 0;
`;
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-projects/component.tsx
git commit -m "feat: create WorkspaceProjectsTab settings component"
```

---

### Task 8: Update settings page with role-based tabs

**Files:**
- Modify: `services/idun_agent_web/src/pages/settings/page.tsx`

**Context:**
- Currently defines two tabs under "Workspaces" group: General and Members (called "Users" currently — renamed to "Members")
- Add a third tab: Projects
- **Label renames (intentional):**
  - Group heading: "Workspaces" (plural) → "Workspace" (singular) — per spec
  - Tab label: "Users" → "Members" — per spec
- Role-based filtering:
  - Workspace owners: group = "Workspace", tabs = General, Members, Projects
  - Project admins (non-owners): group = "Project Settings", tabs = Projects only
- Uses `useProject().isWorkspaceOwner` and `useProject().canAccessSettings`
- `PagedSettingsContainer` groups pages by `group` field — so changing the group name changes the sidebar label
- **Route guard needed:** Contributors/Readers who navigate directly to `/settings` must be redirected away (spec Section 3)

- [ ] **Step 1: Add imports and role-based page filtering with route guard**

Update the imports:

```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import PagedSettingsContainer, {
    type SettingsPage,
} from '../../components/settings/paged-settings-container/component';
import Loader from '../../components/general/loader/component';
import { useProject } from '../../hooks/use-project';
```

Add the lazy import for the new tab:

```typescript
const WorkspaceProjectsTab = lazy(
    () => import('../../components/settings/workspace-projects/component'),
);
```

Add a route guard — redirect non-privileged users away from settings:

```typescript
const { canAccessSettings, isWorkspaceOwner } = useProject();

// Route guard: redirect users without settings access
useEffect(() => {
    if (!canAccessSettings) {
        navigate('/agents', { replace: true });
    }
}, [canAccessSettings, navigate]);

// Don't render if user shouldn't be here
if (!canAccessSettings) return null;
```

- [ ] **Step 2: Update the page array with role-based filtering**

Replace the static `pages` array with a `useMemo` (note: `isWorkspaceOwner` was already extracted from `useProject()` above in the route guard):

```typescript
const pages = useMemo((): SettingsPage[] => {
    if (isWorkspaceOwner) {
        return [
            {
                title: t('settings.workspaces.general', 'General'),
                slug: 'workspace-general',
                group: t('settings.group.workspaces', 'Workspace'),
                content: (
                    <Suspense fallback={<Loader />}>
                        <WorkspaceGeneralTab />
                    </Suspense>
                ),
            },
            {
                title: t('settings.workspaces.users', 'Members'),
                slug: 'workspace-users',
                group: t('settings.group.workspaces', 'Workspace'),
                content: (
                    <Suspense fallback={<Loader />}>
                        <WorkspaceUsersTab />
                    </Suspense>
                ),
            },
            {
                title: t('settings.workspaces.projects', 'Projects'),
                slug: 'workspace-projects',
                group: t('settings.group.workspaces', 'Workspace'),
                content: (
                    <Suspense fallback={<Loader />}>
                        <WorkspaceProjectsTab />
                    </Suspense>
                ),
            },
        ];
    }

    // Non-owner project admins: only show projects tab
    return [
        {
            title: t('settings.workspaces.projects', 'Projects'),
            slug: 'workspace-projects',
            group: t('settings.group.projectSettings', 'Project Settings'),
            content: (
                <Suspense fallback={<Loader />}>
                    <WorkspaceProjectsTab />
                </Suspense>
            ),
        },
    ];
}, [isWorkspaceOwner, t]);
```

Update `DEFAULT_PAGE` to be dynamic:

```typescript
const defaultPage = isWorkspaceOwner ? 'workspace-general' : 'workspace-projects';
const activeSlug = page || defaultPage;
```

Update `handlePageChange`:

```typescript
const handlePageChange = (slug: string) => {
    if (slug === defaultPage) {
        navigate('/settings');
    } else {
        navigate(`/settings/${slug}`);
    }
};
```

- [ ] **Step 3: Verify settings page renders with Projects tab**

Run: `cd services/idun_agent_web && npm run dev`
Navigate to `/settings` — verify the sidebar shows "Workspace" group with General, Members, Projects tabs (for owners). Click "Projects" tab to see the project management UI.

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/pages/settings/page.tsx
git commit -m "feat: add Projects tab to settings with role-based filtering"
```

---

### Task 9: Update sidebar settings visibility

The Settings link in the sidebar should only appear for users who can access settings (workspace owners and project admins).

**Files:**
- Modify: `services/idun_agent_web/src/layouts/side-bar/dashboard-side-bar/layout.tsx`

**Context:**
- Settings link is at lines 188-202, in the `BottomSection`
- Uses `navigate('/settings')`
- We need to conditionally render it based on `useProject().canAccessSettings`

- [ ] **Step 1: Import useProject and conditionally render settings**

Add import:

```typescript
import { useProject } from '../../../hooks/use-project';
```

In the component, add:

```typescript
const { canAccessSettings } = useProject();
```

Wrap the Settings `MenuItem` (lines 188-202) with:

```tsx
{canAccessSettings && (
    <MenuItem
        $isActive={!!location.pathname.startsWith('/settings')}
        $collapsed={collapsed}
        onClick={() => navigate('/settings')}
    >
        <Settings
            size={17}
            color={
                location.pathname.startsWith('/settings')
                    ? 'hsl(var(--primary))'
                    : 'hsl(var(--sidebar-icon-inactive))'
            }
        />
        {!collapsed && <MenuLabel>{t('sidebar.settings', 'Settings')}</MenuLabel>}
    </MenuItem>
)}
```

- [ ] **Step 2: Verify sidebar hides settings for non-privileged users**

Run: `cd services/idun_agent_web && npm run dev`
For a workspace owner, settings should still appear in sidebar. (To test non-owner hiding, you'd need a non-owner account.)

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/layouts/side-bar/dashboard-side-bar/layout.tsx
git commit -m "feat: conditionally show settings in sidebar based on role"
```

---

### Task 10: Delete ProjectManager modal and clean up

**Files:**
- Delete: `services/idun_agent_web/src/components/project-manager/component.tsx`
- Verify: no remaining imports of `ProjectManager`

- [ ] **Step 1: Delete the old component**

```bash
rm services/idun_agent_web/src/components/project-manager/component.tsx
```

- [ ] **Step 2: Check for remaining imports**

Run: `grep -r "project-manager" services/idun_agent_web/src/ --include="*.tsx" --include="*.ts"`

If any files still import `ProjectManager`, update them to remove the import.

Expected: The header was already rewritten in Task 4 and no longer imports it. No other files should reference it.

- [ ] **Step 3: Verify the app builds cleanly**

Run: `cd services/idun_agent_web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

Run: `cd services/idun_agent_web && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A services/idun_agent_web/src/components/project-manager/
git commit -m "chore: remove old ProjectManager modal (replaced by settings tab)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add i18n translation keys | en.json |
| 2 | Enhance useProject hook with roles + auto-select | use-project.tsx |
| 3 | Create ProjectPickerDropdown | project-picker/component.tsx (new) |
| 4 | Rewrite header layout | header/layout.tsx |
| 5 | Update members service | members.ts |
| 6 | Update InviteMemberDialog | workspace-users/component.tsx |
| 7 | Create WorkspaceProjectsTab | workspace-projects/component.tsx (new) |
| 8 | Update settings page | settings/page.tsx |
| 9 | Update sidebar visibility | dashboard-side-bar/layout.tsx |
| 10 | Delete ProjectManager + cleanup | project-manager/component.tsx (delete) |
