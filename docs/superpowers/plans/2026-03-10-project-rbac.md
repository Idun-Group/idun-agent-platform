# Project-Level RBAC Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a two-tier RBAC system: workspace-level (Owner/Member via `is_owner` boolean) + project-level (admin/contributor/reader), with frontend aligned to the new backend contract.

**Architecture:** Workspace owners have implicit admin on all projects (Approach B: no `project_memberships` rows for owners). Non-owner members must be explicitly assigned to projects. Invitations are workspace-scoped but can carry optional project pre-assignments via `invitation_projects`. Resources belong to exactly one project via direct `project_id` FK.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy async / Alembic / React 19 / TypeScript / styled-components

---

## File Structure

### Backend files to modify
| File | Responsibility |
|------|---------------|
| `services/idun_agent_manager/src/app/api/v1/routers/members.py` | Workspace member + invitation management. Remove auto-default-project, remove owner project_membership creation, add promote/demote |
| `services/idun_agent_manager/src/app/api/v1/routers/workspaces.py` | Remove owner project_membership creation from workspace create |
| `services/idun_agent_manager/src/app/api/v1/schemas/workspace_members.py` | Clean schemas: remove `ProjectAssignment` from `MemberAdd`, keep for invitation response |
| `services/idun_agent_manager/src/app/api/v1/deps.py` | Add `require_project_role()` dependency |
| `services/idun_agent_manager/src/app/api/v1/routers/projects.py` | Owner-only guard, allow default project deletion, resource migration |
| `services/idun_agent_manager/src/app/api/v1/project_helpers.py` | Replace junction table helpers with direct `project_id` column operations |
| `services/idun_agent_manager/src/app/api/v1/routers/agents.py` | Add project role checks to CRUD endpoints |
| `services/idun_agent_manager/src/app/api/v1/routers/mcp_servers.py` | Same pattern as agents |
| `services/idun_agent_manager/src/app/api/v1/routers/guardrails.py` | Same pattern |
| `services/idun_agent_manager/src/app/api/v1/routers/observability.py` | Same pattern |
| `services/idun_agent_manager/src/app/api/v1/routers/memory.py` | Same pattern |
| `services/idun_agent_manager/src/app/infrastructure/db/models/managed_agent.py` | Add `project_id` FK column |
| `services/idun_agent_manager/src/app/infrastructure/db/models/managed_mcp_server.py` | Add `project_id` FK |
| `services/idun_agent_manager/src/app/infrastructure/db/models/managed_guardrail.py` | Add `project_id` FK |
| `services/idun_agent_manager/src/app/infrastructure/db/models/managed_observability.py` | Add `project_id` FK |
| `services/idun_agent_manager/src/app/infrastructure/db/models/managed_memory.py` | Add `project_id` FK |
| `services/idun_agent_manager/src/app/main.py` | Fix duplicate projects_router registration |

### Frontend files to modify
| File | Responsibility |
|------|---------------|
| `services/idun_agent_web/src/services/members.ts` | Align types with backend (`is_owner` instead of `role`) |
| `services/idun_agent_web/src/components/settings/workspace-users/component.tsx` | Fix permission checks, simplify invite dialog to Owner/Member |
| `services/idun_agent_web/src/pages/onboarding/page.tsx` | Add project name field |

### Test files to create/modify
| File | Responsibility |
|------|---------------|
| `services/idun_agent_manager/tests/integration/test_members.py` | New: workspace member CRUD, invitations, promote/demote |
| `services/idun_agent_manager/tests/integration/test_projects.py` | New: project CRUD, project member management, deletion |
| `services/idun_agent_manager/tests/integration/test_auth.py` | Update existing invitation test |

---

## Chunk 1: Fix frontend-backend contract mismatch (unblock invite button)

This chunk fixes the immediate blocker: the invite button doesn't show because frontend expects `role: WorkspaceRole` but backend returns `is_owner: bool`.

### Task 1.1: Update `members.ts` service types

**Files:**
- Modify: `services/idun_agent_web/src/services/members.ts`

- [ ] **Step 1: Replace WorkspaceRole type and member types with is_owner model**

Replace the entire file content. Key changes:
- Remove `WorkspaceRole` type (4-level `owner | admin | member | viewer`)
- `WorkspaceMember.role` becomes `WorkspaceMember.is_owner: boolean`
- `WorkspaceInvitation.role` becomes `WorkspaceInvitation.is_owner: boolean`
- `addMember` sends `{ email, is_owner }` instead of `{ email, role }`
- Remove `updateMemberRole` (no workspace-level role changes — promote/demote is a separate action)
- Replace `ROLE_LABELS`, `ROLE_HIERARCHY`, `ROLE_PERMISSIONS` with owner/member constants

```typescript
import { deleteRequest, getJson, postJson } from '../utils/api';

export type WorkspaceMember = {
    id: string;
    user_id: string;
    email: string;
    name: string | null;
    picture_url: string | null;
    is_owner: boolean;
    created_at: string;
};

export type WorkspaceInvitation = {
    id: string;
    email: string;
    is_owner: boolean;
    invited_by: string | null;
    created_at: string;
};

export type MemberListResponse = {
    members: WorkspaceMember[];
    invitations: WorkspaceInvitation[];
    total: number;
};

export async function listMembers(
    workspaceId: string,
    params?: { limit?: number; offset?: number },
): Promise<MemberListResponse> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return getJson<MemberListResponse>(
        `/api/v1/workspaces/${workspaceId}/members${qs ? `?${qs}` : ''}`,
    );
}

export async function addMember(
    workspaceId: string,
    body: { email: string; is_owner: boolean },
): Promise<WorkspaceMember | WorkspaceInvitation> {
    return postJson<WorkspaceMember | WorkspaceInvitation, { email: string; is_owner: boolean }>(
        `/api/v1/workspaces/${workspaceId}/members`,
        body,
    );
}

export async function removeMember(
    workspaceId: string,
    membershipId: string,
): Promise<void> {
    await deleteRequest(`/api/v1/workspaces/${workspaceId}/members/${membershipId}`);
}

export async function cancelInvitation(
    workspaceId: string,
    invitationId: string,
): Promise<void> {
    await deleteRequest(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`,
    );
}

/** Labels for workspace-level roles */
export const WORKSPACE_ROLE_LABELS = {
    owner: 'Owner',
    member: 'Member',
} as const;

/** Permission descriptions for workspace-level roles */
export const WORKSPACE_ROLE_PERMISSIONS: Record<string, string[]> = {
    owner: [
        'Full workspace control',
        'Manage all projects',
        'Manage all members',
        'Delete workspace',
    ],
    member: [
        'Access assigned projects',
        'View workspace members',
    ],
};
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in `component.tsx` (expected — we fix that next)

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/services/members.ts
git commit -m "feat: align members.ts types with backend is_owner model"
```

### Task 1.2: Update workspace-users component

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/workspace-users/component.tsx`

- [ ] **Step 1: Rewrite the component to use is_owner model**

Key changes:
- `canManage` check: `currentMember?.is_owner === true` (only owners can manage)
- Remove `handleRoleChange` (no workspace-level role dropdown)
- `handleInvite` sends `{ email, is_owner }` instead of `{ email, role }`
- `MemberRow`: show "Owner" or "Member" badge based on `is_owner`
- Remove `RoleSelect` component (workspace level is binary, no dropdown)
- `InviteMemberDialog`: toggle between Owner/Member instead of 4-role grid
- Remove all `WorkspaceRole` references, `ROLE_HIERARCHY`, `ROLE_LABELS`, `ROLE_PERMISSIONS` imports

The full rewrite replaces these patterns throughout:
- `member.role === 'owner'` → `member.is_owner`
- `ROLE_LABELS[member.role]` → `member.is_owner ? 'Owner' : 'Member'`
- `ROLE_HIERARCHY[...]` comparisons → simple `is_owner` boolean checks
- `RoleBadge $role={member.role}` → `RoleBadge $isOwner={member.is_owner}`
- Remove `callerLevel > targetLevel` logic — owners can manage anyone except other owners (use `!member.is_owner` or same last-owner check)
- `canRemove`: owner can remove any non-owner member, or self (if not last owner)
- Invite dialog: simple toggle (Owner / Member) instead of 4-role grid with tooltips

Updated imports (line 1-21):
```typescript
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from '../../toast/notify';
import styled, { keyframes } from 'styled-components';
import { Trash2, UserPlus, Check, X } from 'lucide-react';
import useWorkspace from '../../../hooks/use-workspace';
import { useAuth } from '../../../hooks/use-auth';
import { getJson } from '../../../utils/api';
import {
    listMembers,
    addMember,
    removeMember,
    cancelInvitation,
    WORKSPACE_ROLE_LABELS,
    WORKSPACE_ROLE_PERMISSIONS,
    type WorkspaceMember,
    type WorkspaceInvitation,
} from '../../../services/members';
```

Updated `canManage` (line 38-39):
```typescript
const canManage = currentMember?.is_owner === true;
```

Remove `handleRoleChange`. Update `handleInvite`:
```typescript
const handleInvite = async (email: string, isOwner: boolean) => {
    const wsId = await resolveWorkspaceId();
    if (!wsId) return;
    await addMember(wsId, { email, is_owner: isOwner });
    notify.success(t('settings.workspaces.users.memberAdded', 'Member added'));
    fetchMembers();
};
```

`MemberRow` simplified — no role dropdown, just a badge:
```typescript
const MemberRow = ({ member, currentMember, canManage, onRemove }: MemberRowProps) => {
    const { t } = useTranslation();
    const [showConfirm, setShowConfirm] = useState(false);
    const canRemove = canManage && !member.is_owner && member.user_id !== currentMember?.user_id;
    // ...
    <Td>
        <RoleBadge $isOwner={member.is_owner}>
            {member.is_owner ? WORKSPACE_ROLE_LABELS.owner : WORKSPACE_ROLE_LABELS.member}
        </RoleBadge>
    </Td>
    // ...
};
```

`InviteMemberDialog` simplified — Owner/Member toggle:
```typescript
const InviteMemberDialog = ({ onInvite, onClose }: InviteMemberDialogProps) => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [hoveredRole, setHoveredRole] = useState<'owner' | 'member' | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email.trim()) {
            setError(t('settings.workspaces.users.emailRequired', 'Email is required'));
            return;
        }
        setSubmitting(true);
        try {
            await onInvite(email.trim(), isOwner);
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to add member';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };
    // Role grid now shows just 2 options: Owner and Member
    // with hover tooltips using WORKSPACE_ROLE_PERMISSIONS
};
```

`RoleBadge` styled component — change from `$role: WorkspaceRole` to `$isOwner: boolean`:
```typescript
const RoleBadge = styled.span<{ $isOwner: boolean }>`
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    background: ${({ $isOwner }) =>
        $isOwner ? 'hsla(var(--warning) / 0.12)' : 'rgba(59, 130, 246, 0.12)'};
    color: ${({ $isOwner }) =>
        $isOwner ? 'hsl(var(--warning))' : '#60a5fa'};
`;
```

Remove these components entirely (no longer needed):
- `RoleSelect` component and its sub-components (`RoleSelectContainer`, `RoleSelectTrigger`, `RoleDropdown`, `RoleOption`, `RoleTooltip`)
- `ALL_ROLES` constant

- [ ] **Step 2: Verify frontend compiles and renders**

Run: `cd services/idun_agent_web && npx tsc --noEmit`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-users/component.tsx
git commit -m "feat: update workspace-users component for is_owner model"
```

### Task 1.3: Fix backend — remove auto-default-project and owner project_memberships

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/members.py`
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/workspaces.py`
- Modify: `services/idun_agent_manager/src/app/api/v1/schemas/workspace_members.py`

- [ ] **Step 1: Remove `_auto_add_default_project` helper and owner project_membership logic from members.py**

In `members.py`:
- Delete `_auto_add_default_project` function (lines 122-151)
- In `add_member` endpoint (line 260+):
  - Keep `project_assignments` on `MemberAdd` for invitation pre-assignment
  - When user exists and `is_owner=True`: do NOT create any `ProjectMembershipModel` rows (Approach B — implicit admin)
  - When user exists and `is_owner=False`: create `ProjectMembershipModel` rows only for explicit `project_assignments`
  - Remove the "Owners get admin on ALL projects" block (lines 348-364)
  - Remove the "auto-add to default project" block (lines 365-373)
- In `accept_invitation` endpoint (line 453+):
  - Same pattern: owners get no project_membership rows
  - Non-owners: only explicit assignments from `invitation_projects`
  - Remove auto-add-default-project logic (lines 559-567)

- [ ] **Step 2: Remove owner project_membership creation from workspaces.py**

In `workspaces.py`, `create_workspace` endpoint (lines 124-148):
- Remove the `ProjectMembershipModel` creation block (lines 139-148)
- Keep the `ProjectModel` creation (default project still gets created)

After change, the workspace creation code should be:
```python
# Auto-create default project for the new workspace
project_id = uuid4()
project = ProjectModel(
    id=project_id,
    name="Default",
    slug="default",
    is_default=True,
    workspace_id=ws_id,
    created_by=user_uuid,
    created_at=now,
    updated_at=now,
)
session.add(project)
await session.flush()
# No ProjectMembershipModel — owners have implicit admin
```

- [ ] **Step 3: Clean up MemberAdd schema**

In `workspace_members.py`: `MemberAdd` should keep `project_assignments` but make them only relevant for non-owner invitations. The schema stays as-is since the backend logic handles ignoring them for owners.

- [ ] **Step 4: Run existing tests**

Run: `cd services/idun_agent_manager && uv run pytest tests/ -v`
Expected: All 47 tests pass (or identify what breaks)

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/members.py
git add services/idun_agent_manager/src/app/api/v1/routers/workspaces.py
git commit -m "feat: implement Approach B - implicit admin for workspace owners"
```

### Task 1.4: Fix duplicate router registration and add promote/demote endpoints

**Files:**
- Modify: `services/idun_agent_manager/src/app/main.py:194-198`
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/members.py`

- [ ] **Step 1: Remove duplicate projects_router registration in main.py**

Delete lines 194-198 (the second `projects_router` registration):
```python
    # DELETE THIS BLOCK:
    app.include_router(
        projects_router,
        prefix="/api/v1/projects",
        tags=["Projects"],
    )
```

- [ ] **Step 2: Add promote/demote endpoint to members.py**

Add `PATCH /{workspace_id}/members/{membership_id}` endpoint:

```python
class MemberPatch(BaseModel):
    """Request body to promote/demote a workspace member."""
    is_owner: bool


@router.patch(
    "/{workspace_id}/members/{membership_id}",
    response_model=MemberRead,
    summary="Promote or demote a workspace member",
)
async def update_member(
    workspace_id: UUID,
    membership_id: UUID,
    request: MemberPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead:
    """Promote a member to owner or demote an owner to member.

    Only workspace owners can perform this action.
    Cannot demote the last owner.

    Promotion (member -> owner):
    - Deletes all project_memberships (now implicit admin on everything)
    - Increments session_version

    Demotion (owner -> member):
    - Creates project_memberships as admin on all projects (preserves access)
    - Increments session_version
    """
    await _require_workspace_owner(workspace_id, user, session)

    target = await session.get(MembershipModel, membership_id)
    if target is None or target.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found",
        )

    # No-op if already in desired state
    if target.is_owner == request.is_owner:
        target_user = await session.get(UserModel, target.user_id)
        return MemberRead(
            id=str(target.id),
            user_id=str(target.user_id),
            email=target_user.email if target_user else "",
            name=target_user.name if target_user else None,
            picture_url=target_user.picture_url if target_user else None,
            is_owner=target.is_owner,
            created_at=target.created_at,
        )

    if target.is_owner and not request.is_owner:
        # Demotion: check not last owner
        await _ensure_not_last_owner(workspace_id, membership_id, session)

        # Create project_memberships as admin on all projects (preserve access)
        all_projects_stmt = select(ProjectModel).where(
            ProjectModel.workspace_id == workspace_id,
        )
        all_projects = (await session.execute(all_projects_stmt)).scalars().all()
        for proj in all_projects:
            pm = ProjectMembershipModel(
                id=uuid4(),
                project_id=proj.id,
                user_id=target.user_id,
                role="admin",
            )
            session.add(pm)

    elif not target.is_owner and request.is_owner:
        # Promotion: delete all project_memberships (implicit admin now)
        project_ids_stmt = select(ProjectModel.id).where(
            ProjectModel.workspace_id == workspace_id,
        )
        del_pm_stmt = delete(ProjectMembershipModel).where(
            ProjectMembershipModel.user_id == target.user_id,
            ProjectMembershipModel.project_id.in_(project_ids_stmt),
        )
        await session.execute(del_pm_stmt)

    target.is_owner = request.is_owner

    # Invalidate session
    target_user = await session.get(UserModel, target.user_id)
    if target_user is not None:
        target_user.session_version += 1

    await session.flush()

    return MemberRead(
        id=str(target.id),
        user_id=str(target.user_id),
        email=target_user.email if target_user else "",
        name=target_user.name if target_user else None,
        picture_url=target_user.picture_url if target_user else None,
        is_owner=target.is_owner,
        created_at=target.created_at,
    )
```

Add `MemberPatch` import to schemas file:
```python
class MemberPatch(BaseModel):
    """Request body to promote/demote a workspace member."""
    is_owner: bool
```

- [ ] **Step 3: Run tests**

Run: `cd services/idun_agent_manager && uv run pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_manager/src/app/main.py
git add services/idun_agent_manager/src/app/api/v1/routers/members.py
git add services/idun_agent_manager/src/app/api/v1/schemas/workspace_members.py
git commit -m "feat: add promote/demote endpoint, fix duplicate router registration"
```

---

## Chunk 2: Backend — Resource models, project_helpers, and project access control

This chunk adds `project_id` to resource models, replaces junction table helpers, and adds `require_project_role()`.

### Task 2.1: Add `project_id` column to all resource models

**Files:**
- Modify: `services/idun_agent_manager/src/app/infrastructure/db/models/managed_agent.py`
- Modify: `services/idun_agent_manager/src/app/infrastructure/db/models/managed_mcp_server.py`
- Modify: `services/idun_agent_manager/src/app/infrastructure/db/models/managed_guardrail.py`
- Modify: `services/idun_agent_manager/src/app/infrastructure/db/models/managed_observability.py`
- Modify: `services/idun_agent_manager/src/app/infrastructure/db/models/managed_memory.py`

- [ ] **Step 1: Add `project_id` FK to each resource model**

Same pattern for all 5 models. Example for `managed_agent.py`, add after `workspace_id`:

```python
project_id: Mapped[UUID] = mapped_column(
    UUID(as_uuid=True),
    ForeignKey("projects.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
)
```

Also add `ForeignKey` to the imports if not already there (it's already imported in `managed_agent.py`).

Apply the same change to all 5 resource model files.

- [ ] **Step 2: Run tests to check for regressions**

Run: `cd services/idun_agent_manager && uv run pytest tests/ -v`
Expected: Some tests may fail if they create resources without `project_id`. Fix conftest fixtures as needed.

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_manager/src/app/infrastructure/db/models/managed_*.py
git commit -m "feat: add project_id FK to all resource models"
```

### Task 2.2: Replace junction table helpers with direct column operations

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/project_helpers.py`

- [ ] **Step 1: Rewrite project_helpers.py for direct project_id column**

```python
"""Shared helpers for project-aware resource routers."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.project import ProjectModel


async def resolve_project_id(
    session: AsyncSession,
    workspace_id: UUID,
    project_id: UUID | None = None,
) -> UUID:
    """Resolve which project a new resource should be assigned to.

    If project_id is provided and valid, returns it.
    Otherwise returns the workspace's default project ID.
    Raises ValueError if no project can be resolved.
    """
    if project_id is not None:
        project = await session.get(ProjectModel, project_id)
        if project is not None and project.workspace_id == workspace_id:
            return project_id

    stmt = select(ProjectModel).where(
        ProjectModel.workspace_id == workspace_id,
        ProjectModel.is_default.is_(True),
    )
    default_project = (await session.execute(stmt)).scalar_one_or_none()
    if default_project is None:
        raise ValueError(f"No default project for workspace {workspace_id}")
    return default_project.id


def apply_project_filter(stmt, model_class, project_id: UUID | None):
    """Apply optional project filter to a SELECT statement.

    Now uses direct project_id column instead of junction table JOIN.
    """
    if project_id is None:
        return stmt
    return stmt.where(model_class.project_id == project_id)
```

- [ ] **Step 2: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/project_helpers.py
git commit -m "refactor: replace junction table helpers with direct project_id column"
```

### Task 2.3: Add `require_project_role()` dependency

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/deps.py`

- [ ] **Step 1: Add require_project_role helper**

Add at the end of `deps.py`:

```python
from app.api.v1.schemas.workspace_members import ProjectRole, PROJECT_ROLE_HIERARCHY


async def check_project_access(
    user_id: UUID,
    workspace_id: UUID,
    project_id: UUID,
    min_role: ProjectRole,
    session: AsyncSession,
) -> None:
    """Verify the user has at least min_role on the project.

    Workspace owners implicitly have admin access on all projects.
    Raises HTTPException 403 if insufficient access, 404 if not a workspace member.
    """
    from app.infrastructure.db.models.membership import MembershipModel
    from app.infrastructure.db.models.project_membership import ProjectMembershipModel

    # Check workspace membership
    mem_stmt = select(MembershipModel).where(
        MembershipModel.user_id == user_id,
        MembershipModel.workspace_id == workspace_id,
    )
    membership = (await session.execute(mem_stmt)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Owners are implicit admin on all projects
    if membership.is_owner:
        return

    # Check project membership
    pm_stmt = select(ProjectMembershipModel).where(
        ProjectMembershipModel.user_id == user_id,
        ProjectMembershipModel.project_id == project_id,
    )
    pm = (await session.execute(pm_stmt)).scalar_one_or_none()
    if pm is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project",
        )

    if PROJECT_ROLE_HIERARCHY.get(ProjectRole(pm.role), 0) < PROJECT_ROLE_HIERARCHY[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least {min_role.value} role on this project",
        )
```

- [ ] **Step 2: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/deps.py
git commit -m "feat: add check_project_access dependency for project-level RBAC"
```

### Task 2.4: Update resource routers with project scoping

**Files:**
- Modify: All 5 resource routers (agents, mcp_servers, guardrails, observability, memory)

- [ ] **Step 1: Update agents.py as the template**

Changes to each resource router:
1. Import `check_project_access` from deps, `resolve_project_id` from project_helpers
2. Import `ProjectRole` from schemas
3. On **create**: resolve `project_id` and set it on the model
4. On **list**: use `apply_project_filter` with direct column (already done, just update import signature)
5. On **get/patch/delete**: add project access check
6. Remove `cleanup_resource_project_assignments` calls (junction table is gone)
7. Remove `assign_resource_to_default_project` calls (set `project_id` directly)
8. Remove `RESOURCE_TYPE_*` imports (no longer needed)

Pattern for **create** endpoint:
```python
from app.api.v1.project_helpers import apply_project_filter, resolve_project_id

# In create handler:
resolved_project_id = await resolve_project_id(session, workspace_id, project_id)
model = ManagedAgentModel(
    id=agent_id,
    # ... existing fields ...
    workspace_id=workspace_id,
    project_id=resolved_project_id,
)
```

Pattern for **list** endpoint:
```python
stmt = apply_project_filter(stmt, ManagedAgentModel, project_id)
```

Pattern for **get/patch/delete** (access check):
```python
# After fetching the model:
model = await _get_agent(id, session, workspace_id)
await check_project_access(
    UUID(user.user_id), workspace_id, model.project_id,
    ProjectRole.READER,  # READER for get, CONTRIBUTOR for patch/delete
    session,
)
```

- [ ] **Step 2: Apply same pattern to remaining 4 routers**

- mcp_servers.py
- guardrails.py
- observability.py
- memory.py

- [ ] **Step 3: Run tests**

Run: `cd services/idun_agent_manager && uv run pytest tests/ -v`
Expected: Tests may need fixture updates to provide `project_id` when creating resources

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/agents.py
git add services/idun_agent_manager/src/app/api/v1/routers/mcp_servers.py
git add services/idun_agent_manager/src/app/api/v1/routers/guardrails.py
git add services/idun_agent_manager/src/app/api/v1/routers/observability.py
git add services/idun_agent_manager/src/app/api/v1/routers/memory.py
git commit -m "feat: add project-level RBAC to all resource routers"
```

---

## Chunk 3: Backend — Project management refinements

### Task 3.1: Update projects router — owner-only access and deletion rules

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/projects.py`

- [ ] **Step 1: Add owner-only guard to project management endpoints**

- `POST /` (create), `PATCH /{id}`, `DELETE /{id}`: require workspace owner
- `GET /`, `GET /{id}`: workspace members can list/view projects they have access to. Owners see all, non-owners see only assigned projects.

For the list endpoint, add filtering:
```python
@router.get("/", ...)
async def list_projects(...):
    # Check workspace membership
    mem_stmt = select(MembershipModel).where(
        MembershipModel.user_id == UUID(user.user_id),
        MembershipModel.workspace_id == workspace_id,
    )
    membership = (await session.execute(mem_stmt)).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if membership.is_owner:
        # Owners see all projects
        stmt = select(ProjectModel).where(
            ProjectModel.workspace_id == workspace_id,
        )
    else:
        # Non-owners see only assigned projects
        stmt = (
            select(ProjectModel)
            .join(ProjectMembershipModel, ProjectMembershipModel.project_id == ProjectModel.id)
            .where(
                ProjectModel.workspace_id == workspace_id,
                ProjectMembershipModel.user_id == UUID(user.user_id),
            )
        )
    # ... order_by, pagination, etc.
```

- [ ] **Step 2: Allow default project deletion if another project exists**

Replace the "cannot delete default project" check:
```python
# Old:
if project.is_default:
    raise HTTPException(400, "Cannot delete the default project")

# New:
project_count_stmt = (
    select(func.count())
    .select_from(ProjectModel)
    .where(ProjectModel.workspace_id == workspace_id)
)
project_count = (await session.execute(project_count_stmt)).scalar_one()
if project_count <= 1:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Cannot delete the last project in a workspace",
    )
```

- [ ] **Step 3: Add resource migration endpoint for project deletion**

Add a new endpoint that the frontend calls before deletion:

```python
class ProjectDeletePlan(BaseModel):
    """Preview of what will happen when a project is deleted."""
    project_id: str
    project_name: str
    resources: list[ProjectDeleteResource]

class ProjectDeleteResource(BaseModel):
    resource_id: str
    resource_type: str
    resource_name: str

class ProjectDeleteAction(BaseModel):
    """Request body for confirmed project deletion."""
    move_resources_to: str | None = Field(
        None,
        description="Project ID to move resources to. If None, resources are deleted.",
    )

@router.get(
    "/{project_id}/delete-preview",
    response_model=ProjectDeletePlan,
    summary="Preview impact of deleting a project",
)
async def delete_preview(project_id: UUID, ...):
    """Return all resources that would be affected by deleting this project."""
    # Query all resource tables for project_id matches
    # Return structured list for frontend confirmation UI

@router.post(
    "/{project_id}/delete",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete project with resource migration",
)
async def delete_project_with_plan(
    project_id: UUID,
    request: ProjectDeleteAction,
    ...
):
    """Delete a project, optionally moving its resources to another project."""
    # If move_resources_to: UPDATE all resources SET project_id = target
    # If None: CASCADE delete handles it
    # Delete project memberships
    # Delete project
```

- [ ] **Step 4: Run tests**

Run: `cd services/idun_agent_manager && uv run pytest tests/ -v`

- [ ] **Step 5: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/projects.py
git commit -m "feat: owner-only project management, allow default deletion, add delete preview"
```

### Task 3.2: Add project member management endpoints

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/projects.py`

- [ ] **Step 1: Add project member CRUD endpoints**

```python
@router.get("/{project_id}/members", response_model=ProjectMemberListResponse)
async def list_project_members(project_id: UUID, ...):
    """List project members. Owners see all + are shown as implicit admin."""
    # Query project_memberships for explicit members
    # Also include workspace owners as implicit admin entries

@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=201)
async def add_project_member(project_id: UUID, request: ProjectMemberAdd, ...):
    """Add a workspace member to a project with a specific role. Owner-only."""
    # Verify target user is a workspace member
    # Create ProjectMembershipModel row
    # Cannot add workspace owners (they're implicit admin)

@router.patch("/{project_id}/members/{membership_id}", response_model=ProjectMemberRead)
async def update_project_member(project_id: UUID, membership_id: UUID, request: ProjectMemberPatch, ...):
    """Change a project member's role. Owner or project admin only."""

@router.delete("/{project_id}/members/{membership_id}", status_code=204)
async def remove_project_member(project_id: UUID, membership_id: UUID, ...):
    """Remove a member from a project. Owner or project admin only."""
```

- [ ] **Step 2: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/projects.py
git commit -m "feat: add project member management endpoints"
```

---

## Chunk 4: Frontend — Onboarding and project name

### Task 4.1: Update onboarding page with project name field

**Files:**
- Modify: `services/idun_agent_web/src/pages/onboarding/page.tsx`

- [ ] **Step 1: Add project name field to onboarding form**

Add a second input below workspace name, pre-filled with "Default":

```typescript
const [projectName, setProjectName] = useState('Default');

// In handleSubmit, pass project name to workspace creation
// (Backend needs to accept optional project_name in WorkspaceCreate schema)
await postJson('/api/v1/workspaces/', {
    name: name.trim(),
    default_project_name: projectName.trim() || 'Default',
});
```

Add to the form JSX, after workspace name input:
```tsx
<TextInput
    label={t('onboarding.project.label', 'First project')}
    name="project-name"
    type="text"
    value={projectName}
    onChange={(e) => setProjectName(e.target.value)}
    placeholder={t('onboarding.project.placeholder', 'Default')}
/>
<HelpText>
    {t('onboarding.project.help',
       'Projects organize your agents and configurations. You can create more later.')}
</HelpText>
```

- [ ] **Step 2: Update WorkspaceCreate schema on backend to accept project name**

In `workspaces.py`:
```python
class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    default_project_name: str = Field(default="Default", min_length=1, max_length=255)
```

Then use `request.default_project_name` when creating the default project.

- [ ] **Step 3: Add i18n keys**

Add to `en.json`:
```json
"onboarding": {
    "project": {
        "label": "First project",
        "placeholder": "Default",
        "help": "Projects organize your agents and configurations. You can create more later."
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add services/idun_agent_web/src/pages/onboarding/page.tsx
git add services/idun_agent_manager/src/app/api/v1/routers/workspaces.py
git commit -m "feat: add project name to onboarding flow"
```

---

## Chunk 5: Integration tests

### Task 5.1: Write members RBAC integration tests

**Files:**
- Create: `services/idun_agent_manager/tests/integration/test_members.py`

- [ ] **Step 1: Write test file with core RBAC scenarios**

Test scenarios:
1. `test_list_members_as_owner` — owner can list all members
2. `test_list_members_as_member` — non-owner can list all members
3. `test_invite_member_as_owner` — owner can invite
4. `test_invite_member_as_non_owner_forbidden` — non-owner gets 403
5. `test_invite_creates_invitation_for_unknown_email` — unknown email creates invitation
6. `test_invite_creates_membership_for_known_user` — known user gets immediate membership
7. `test_accept_invitation_materializes_project_assignments` — invitation with project pre-assignments creates project_memberships
8. `test_remove_member_cascades_project_memberships` — removing member deletes their project memberships
9. `test_cannot_remove_last_owner` — 400 error
10. `test_promote_member_to_owner_deletes_project_memberships` — promotion removes explicit rows
11. `test_demote_owner_creates_project_memberships` — demotion creates admin rows on all projects
12. `test_owner_sees_all_projects` — owner project list shows everything
13. `test_member_sees_only_assigned_projects` — non-owner sees only their projects

- [ ] **Step 2: Run tests**

Run: `cd services/idun_agent_manager && uv run pytest tests/integration/test_members.py -v`

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_manager/tests/integration/test_members.py
git commit -m "test: add comprehensive members RBAC integration tests"
```

### Task 5.2: Update existing auth tests

**Files:**
- Modify: `services/idun_agent_manager/tests/integration/test_auth.py`

- [ ] **Step 1: Update invitation consumption test for is_owner model**

The existing `test_signup_consumes_pending_invitation` may need updates if it references `role` field.

- [ ] **Step 2: Run all tests**

Run: `cd services/idun_agent_manager && uv run pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add services/idun_agent_manager/tests/integration/test_auth.py
git commit -m "test: update auth tests for is_owner model"
```

---

## Execution Order

1. **Chunk 1** first — unblocks the invite button immediately
2. **Chunk 2** — resource model + access control foundation
3. **Chunk 3** — project management refinements
4. **Chunk 4** — onboarding UX improvement
5. **Chunk 5** — test coverage

Each chunk produces working, testable software. Chunks can be committed and deployed independently.
