# Pending Invitations + Owner-to-Owner Promotion

## Problem

The `add_member` endpoint requires users to already have accounts. Admins/owners cannot pre-invite users who haven't signed up yet. Additionally, owners cannot promote other members to owner role.

## Solution

### 1. New DB table: `workspace_invitations`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| workspace_id | UUID | FK to workspaces |
| email | String | Indexed, the invited email |
| role | String | owner/admin/member/viewer |
| invited_by | UUID | FK to users |
| created_at | DateTime | Auto-set |

No expiration. Invitations persist until the user signs up or the invitation is cancelled.

### 2. Modified `add_member` flow

1. Check if user exists by email
2. **If user exists** and not already a member: create membership immediately (current behavior)
3. **If user exists** and already a member: 409 Conflict
4. **If user does NOT exist**: check for duplicate pending invitation (409 if exists), then create a `workspace_invitations` row. Return with `status: "pending"`
5. Permission checks remain the same (admin+ required, role grant enforcement)

### 3. Modified signup/login flow (auth.py)

After creating a new user (both local signup and OIDC first-login):
1. Query `workspace_invitations` by the new user's email
2. For each pending invitation: create a `MembershipModel` with the invited role
3. Delete the processed invitations
4. Include the new workspace IDs in the session payload

### 4. Modified `list_members` response

Return both active members AND pending invitations. Pending invitations have:
- `status: "pending"` (active members have `status: "active"`)
- `email` only (no `user_id`, `name`, or `picture_url`)
- `invitation_id` instead of membership `id`

### 5. Cancel invitation endpoint

`DELETE /{workspace_id}/invitations/{invitation_id}` - Admin+ can cancel pending invitations.

### 6. Owner-to-Owner promotion

Change `_enforce_role_grant` so that owners can assign owner role:
- Current: `target_level >= caller_level` blocks equal level
- New: `target_level > caller_level` for owners only (admins still can't assign admin)

### Frontend changes

- Members table shows pending invitations with a "Pending" badge (gray)
- Pending rows: email only, no avatar/name
- Pending rows: "Cancel" action instead of role dropdown/remove
- "Add member" dialog unchanged - works for both existing and non-existing users
- i18n keys for pending status, cancel invitation, already invited error

### Scenario matrix after changes

| Scenario | Behavior |
|----------|----------|
| Add existing user not in workspace | Creates membership immediately |
| Add non-existing user | Creates pending invitation |
| Add already-invited email | 409 "Already invited" |
| Add already-member email | 409 "Already a member" |
| User signs up with pending invite | Auto-assigned to workspace(s) |
| Cancel pending invitation | Admin+ deletes invitation row |
| Owner assigns Owner role | Now allowed |
| Owner removes another Owner | Still blocked (equal level) |
