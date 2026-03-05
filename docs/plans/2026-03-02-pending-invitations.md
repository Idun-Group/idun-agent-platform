# Pending Invitations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins/owners to invite users who haven't signed up yet via pending invitations, and allow owners to promote members to owner role.

**Architecture:** New `workspace_invitations` DB table stores pending invites by email. The `add_member` endpoint falls back to creating an invitation when user doesn't exist. Both signup flows (local + OIDC) consume pending invitations on user creation. Frontend shows pending invitations inline in the members table with a "Pending" badge.

**Tech Stack:** Python/FastAPI/SQLAlchemy (async), Alembic migrations, React/TypeScript/styled-components, i18next

---

### Task 1: Create InvitationModel

**Files:**
- Create: `services/idun_agent_manager/src/app/infrastructure/db/models/invitation.py`
- Modify: `services/idun_agent_manager/alembic/env.py` (add import)

**Step 1: Create the model file**

```python
"""Workspace invitation model."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class InvitationModel(Base):
    __tablename__ = "workspace_invitations"
    __table_args__ = (
        UniqueConstraint("email", "workspace_id", name="uq_invitation_email_workspace"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="member")
    invited_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

**Step 2: Register model in alembic env.py**

In `services/idun_agent_manager/alembic/env.py`, add import alongside the other model imports:

```python
from app.infrastructure.db.models.invitation import InvitationModel  # noqa: F401
```

**Step 3: Commit**

```bash
git add services/idun_agent_manager/src/app/infrastructure/db/models/invitation.py services/idun_agent_manager/alembic/env.py
git commit -m "feat: add InvitationModel for pending workspace invitations"
```

---

### Task 2: Create Alembic Migration

**Files:**
- Create: `services/idun_agent_manager/alembic/versions/20260302_0002_<hash>_add_workspace_invitations.py`

**Step 1: Generate migration**

```bash
cd services/idun_agent_manager && alembic revision --autogenerate -m "add workspace_invitations table"
```

Verify the generated migration creates the `workspace_invitations` table with columns: id, workspace_id, email, role, invited_by, created_at, and the unique constraint + indexes.

**Step 2: Review and run migration**

```bash
alembic upgrade head
```

**Step 3: Commit**

```bash
git add services/idun_agent_manager/alembic/versions/
git commit -m "feat: add workspace_invitations migration"
```

---

### Task 3: Add Invitation Schemas

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/schemas/workspace_members.py`

**Step 1: Add invitation schemas**

Add after the existing `MemberListResponse` class:

```python
class InvitationRead(BaseModel):
    id: str
    email: str
    role: WorkspaceRole
    invited_by: str | None
    created_at: datetime
    status: str = "pending"

    model_config = ConfigDict(from_attributes=True)
```

**Step 2: Modify MemberRead to include status field**

Add a `status` field with default `"active"` to `MemberRead`:

```python
class MemberRead(BaseModel):
    id: str
    user_id: str
    email: str
    name: str | None
    picture_url: str | None
    role: WorkspaceRole
    created_at: datetime
    status: str = "active"

    model_config = ConfigDict(from_attributes=True)
```

**Step 3: Modify MemberListResponse to include invitations**

```python
class MemberListResponse(BaseModel):
    members: list[MemberRead]
    invitations: list[InvitationRead] = []
    total: int
```

**Step 4: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/schemas/workspace_members.py
git commit -m "feat: add invitation schemas and status field to member responses"
```

---

### Task 4: Modify add_member to Support Pending Invitations

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/members.py`

**Step 1: Add InvitationModel import**

At top of file, add:

```python
from app.infrastructure.db.models.invitation import InvitationModel
from app.api.v1.schemas.workspace_members import InvitationRead
```

**Step 2: Replace `_get_user_by_email` usage in `add_member`**

Replace the `add_member` endpoint (lines 130-182) with this logic:

```python
@router.post(
    "/{workspace_id}/members",
    response_model=MemberRead | InvitationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a user to the workspace or create a pending invitation",
)
async def add_member(
    workspace_id: str,
    body: MemberAdd,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> MemberRead | InvitationRead:
    """Add an existing user or create a pending invitation by email."""
    ws_uuid = _parse_uuid(workspace_id)

    caller = await require_workspace_role(
        ws_uuid, user, session, WorkspaceRole.ADMIN
    )
    _enforce_role_grant(caller, body.role)

    # Try to find user by email
    stmt = select(UserModel).where(UserModel.email == body.email)
    target_user = (await session.execute(stmt)).scalar_one_or_none()

    if target_user is not None:
        # User exists — check for duplicate membership
        dup_stmt = select(MembershipModel).where(
            MembershipModel.user_id == target_user.id,
            MembershipModel.workspace_id == ws_uuid,
        )
        if (await session.execute(dup_stmt)).scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace",
            )

        membership = MembershipModel(
            id=uuid4(),
            user_id=target_user.id,
            workspace_id=ws_uuid,
            role=body.role.value,
        )
        session.add(membership)
        await session.flush()
        await session.refresh(membership)

        return MemberRead(
            id=str(membership.id),
            user_id=str(target_user.id),
            email=target_user.email,
            name=target_user.name,
            picture_url=target_user.picture_url,
            role=WorkspaceRole(membership.role),
            created_at=membership.created_at,
        )
    else:
        # User doesn't exist — check for duplicate invitation
        dup_inv_stmt = select(InvitationModel).where(
            InvitationModel.email == body.email,
            InvitationModel.workspace_id == ws_uuid,
        )
        if (await session.execute(dup_inv_stmt)).scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email has already been invited to this workspace",
            )

        invitation = InvitationModel(
            id=uuid4(),
            workspace_id=ws_uuid,
            email=body.email,
            role=body.role.value,
            invited_by=UUID(user.user_id),
        )
        session.add(invitation)
        await session.flush()
        await session.refresh(invitation)

        return InvitationRead(
            id=str(invitation.id),
            email=invitation.email,
            role=WorkspaceRole(invitation.role),
            invited_by=str(invitation.invited_by),
            created_at=invitation.created_at,
        )
```

**Step 3: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/members.py
git commit -m "feat: add_member creates pending invitation when user doesn't exist"
```

---

### Task 5: Modify list_members to Include Pending Invitations

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/members.py`

**Step 1: Update list_members endpoint**

After fetching active members, also fetch invitations:

```python
    # Fetch pending invitations
    inv_stmt = (
        select(InvitationModel)
        .where(InvitationModel.workspace_id == ws_uuid)
        .order_by(InvitationModel.created_at.asc())
    )
    inv_rows = (await session.execute(inv_stmt)).scalars().all()

    invitations = [
        InvitationRead(
            id=str(inv.id),
            email=inv.email,
            role=WorkspaceRole(inv.role),
            invited_by=str(inv.invited_by) if inv.invited_by else None,
            created_at=inv.created_at,
        )
        for inv in inv_rows
    ]

    return MemberListResponse(members=members, invitations=invitations, total=total)
```

**Step 2: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/members.py
git commit -m "feat: list_members returns pending invitations alongside active members"
```

---

### Task 6: Add Cancel Invitation Endpoint

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/members.py`

**Step 1: Add delete invitation endpoint**

```python
@router.delete(
    "/{workspace_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Cancel a pending invitation",
)
async def cancel_invitation(
    workspace_id: str,
    invitation_id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Cancel a pending workspace invitation."""
    ws_uuid = _parse_uuid(workspace_id)
    inv_uuid = _parse_uuid(invitation_id, "invitation")

    await require_workspace_role(ws_uuid, user, session, WorkspaceRole.ADMIN)

    stmt = select(InvitationModel).where(
        InvitationModel.id == inv_uuid,
        InvitationModel.workspace_id == ws_uuid,
    )
    invitation = (await session.execute(stmt)).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    await session.delete(invitation)
    await session.flush()
```

**Step 2: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/members.py
git commit -m "feat: add cancel invitation endpoint"
```

---

### Task 7: Consume Pending Invitations on Signup

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/auth.py`

**Step 1: Create a helper function**

Add this helper function near the top of auth.py (after imports):

```python
async def _consume_pending_invitations(
    session: AsyncSession, user_id: UUID, email: str
) -> list[str]:
    """Find pending invitations for this email, create memberships, delete invitations.

    Returns list of workspace IDs the user was added to.
    """
    from app.infrastructure.db.models.invitation import InvitationModel

    inv_stmt = select(InvitationModel).where(InvitationModel.email == email)
    invitations = (await session.execute(inv_stmt)).scalars().all()

    new_workspace_ids: list[str] = []
    for inv in invitations:
        # Check no duplicate membership exists
        dup_stmt = select(MembershipModel).where(
            MembershipModel.user_id == user_id,
            MembershipModel.workspace_id == inv.workspace_id,
        )
        if (await session.execute(dup_stmt)).scalar_one_or_none() is None:
            membership = MembershipModel(
                id=uuid4(),
                user_id=user_id,
                workspace_id=inv.workspace_id,
                role=inv.role,
            )
            session.add(membership)
            new_workspace_ids.append(str(inv.workspace_id))

        await session.delete(inv)

    if new_workspace_ids:
        await session.flush()

    return new_workspace_ids
```

**Step 2: Call helper in basic signup**

In the `signup` function (around line 374, after `session.flush()` for the membership), add:

```python
        # Consume any pending invitations for this email
        invited_ws_ids = await _consume_pending_invitations(
            session, user.id, request.email
        )
```

Then update the workspace_ids list:

```python
    workspace_ids = [str(workspace.id)] + invited_ws_ids
```

And use `workspace_ids` (not `[str(workspace.id)]`) in the session payload at line 388.

**Step 3: Call helper in OIDC first-login**

In the OIDC callback (around line 246, after `session.flush()` for the membership), add:

```python
        # Consume any pending invitations for this email
        invited_ws_ids = await _consume_pending_invitations(
            session, user.id, email
        )
        workspace_ids = [str(workspace.id)] + invited_ws_ids
```

**Step 4: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/auth.py
git commit -m "feat: consume pending invitations on signup and OIDC first-login"
```

---

### Task 8: Fix Owner-to-Owner Promotion

**Files:**
- Modify: `services/idun_agent_manager/src/app/api/v1/routers/members.py`

**Step 1: Update `_enforce_role_grant`**

Replace the current function (lines 347-357) with:

```python
def _enforce_role_grant(caller: MembershipModel, target_role: WorkspaceRole) -> None:
    """Ensure the caller is allowed to grant the target role.

    Owners can assign any role including owner.
    Admins can only assign roles below admin.
    """
    caller_role = WorkspaceRole(caller.role)
    caller_level = ROLE_HIERARCHY[caller_role]
    target_level = ROLE_HIERARCHY[target_role]

    # Owners can assign any role (including owner)
    if caller_role == WorkspaceRole.OWNER:
        return

    # Everyone else cannot assign equal or higher
    if target_level >= caller_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot assign role {target_role.value}; insufficient privileges",
        )
```

**Step 2: Commit**

```bash
git add services/idun_agent_manager/src/app/api/v1/routers/members.py
git commit -m "feat: allow owners to assign owner role to other members"
```

---

### Task 9: Register Invitations Route in main.py

**Files:**
- Modify: `services/idun_agent_manager/src/app/main.py`

**Step 1: Verify the invitations endpoint is reachable**

The invitation endpoints are on the same `members` router (same `/{workspace_id}/invitations/...` prefix), so they should already be registered via the existing `members_router` include. Verify by checking that `cancel_invitation` is defined on the same `router` object in `members.py`.

If the invitations need a separate prefix, add to `setup_routes`:

```python
# Already included via members_router — invitations are sub-routes
```

No change needed if invitations are on the same router.

**Step 2: Restart manager and verify endpoints**

```bash
docker compose -f docker-compose.dev.yml restart manager
```

Check logs to confirm no import errors.

**Step 3: Commit (if any changes)**

---

### Task 10: Update Frontend Members Service

**Files:**
- Modify: `services/idun_agent_web/src/services/members.ts`

**Step 1: Add invitation types and API functions**

Add types:

```typescript
export type WorkspaceInvitation = {
    id: string;
    email: string;
    role: WorkspaceRole;
    invited_by: string | null;
    created_at: string;
    status: 'pending';
};

// Update MemberListResponse
export type MemberListResponse = {
    members: WorkspaceMember[];
    invitations: WorkspaceInvitation[];
    total: number;
};
```

Add cancel function:

```typescript
export async function cancelInvitation(
    workspaceId: string,
    invitationId: string,
): Promise<void> {
    await deleteRequest(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`,
    );
}
```

**Step 2: Commit**

```bash
git add services/idun_agent_web/src/services/members.ts
git commit -m "feat: add invitation types and cancelInvitation API function"
```

---

### Task 11: Update Frontend WorkspaceUsersTab

**Files:**
- Modify: `services/idun_agent_web/src/components/settings/workspace-users/component.tsx`

**Step 1: Update state to track invitations**

Add state:

```typescript
const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
```

Update `fetchMembers` to also store invitations:

```typescript
const res = await listMembers(wsId);
setMembers(res.members);
setInvitations(res.invitations ?? []);
```

**Step 2: Add cancel handler**

```typescript
const handleCancelInvitation = async (invitation: WorkspaceInvitation) => {
    const wsId = await resolveWorkspaceId();
    if (!wsId) return;
    try {
        await cancelInvitation(wsId, invitation.id);
        toast.success(t('settings.workspaces.users.invitationCancelled', 'Invitation cancelled'));
        fetchMembers();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to cancel invitation';
        toast.error(msg);
    }
};
```

**Step 3: Render pending invitations in the table**

After the active members rows, render invitation rows with:
- No avatar, just email
- "Pending" badge (gray) instead of role dropdown
- "Cancel" button (X icon) instead of trash icon
- Import `cancelInvitation` and `WorkspaceInvitation` from services/members

**Step 4: Add i18n keys to en.json**

Add under `settings.workspaces`:

```json
"users.pending": "Pending",
"users.invitationCancelled": "Invitation cancelled",
"users.cancelInvitation": "Cancel invitation",
"users.alreadyInvited": "This email has already been invited"
```

**Step 5: Commit**

```bash
git add services/idun_agent_web/src/components/settings/workspace-users/component.tsx services/idun_agent_web/src/i18n/locales/en.json
git commit -m "feat: show pending invitations in members table with cancel action"
```

---

### Task 12: Add i18n Translations for Other Locales

**Files:**
- Modify: `services/idun_agent_web/src/i18n/locales/{fr,es,de,it,pt,ru}.json`

**Step 1: Add the 4 new keys to each locale**

Keys to add under `settings.workspaces`:
- `users.pending`
- `users.invitationCancelled`
- `users.cancelInvitation`
- `users.alreadyInvited`

**Step 2: Commit**

```bash
git add services/idun_agent_web/src/i18n/locales/
git commit -m "feat: add invitation i18n translations for all locales"
```

---

### Task 13: Verify Full Stack

**Step 1: Restart manager**

```bash
docker compose -f docker-compose.dev.yml restart manager
```

Check logs for clean startup.

**Step 2: Test via API**

```bash
# Login
SID=$(curl -s -c - -X POST http://localhost:8000/api/v1/auth/basic/login -H 'Content-Type: application/json' -d '{"email":"a@a.com","password":"Yassin1!"}' | grep sid | awk '{print $NF}')

# Get workspace ID
WS=$(curl -s -b "sid=$SID" http://localhost:8000/api/v1/workspaces/ | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Invite non-existing user
curl -s -b "sid=$SID" -X POST "http://localhost:8000/api/v1/workspaces/$WS/members" -H 'Content-Type: application/json' -d '{"email":"newuser@test.com","role":"member"}'

# List members (should show invitation)
curl -s -b "sid=$SID" "http://localhost:8000/api/v1/workspaces/$WS/members"

# Signup as invited user
curl -s -X POST http://localhost:8000/api/v1/auth/basic/signup -H 'Content-Type: application/json' -d '{"email":"newuser@test.com","password":"TestPass1234","name":"New User"}'

# List members again (invitation consumed, user is now a member)
curl -s -b "sid=$SID" "http://localhost:8000/api/v1/workspaces/$WS/members"
```

**Step 3: Test in browser**

Navigate to `/settings/workspace-users` and verify:
- Existing members show normally
- Invite a non-existing email — should appear with "Pending" badge
- Cancel an invitation — should disappear

**Step 4: Commit any fixes**
