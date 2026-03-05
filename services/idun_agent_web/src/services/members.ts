import { deleteRequest, getJson, patchJson, postJson } from '../utils/api';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type WorkspaceMember = {
    id: string;
    user_id: string;
    email: string;
    name: string | null;
    picture_url: string | null;
    role: WorkspaceRole;
    created_at: string;
};

export type WorkspaceInvitation = {
    id: string;
    email: string;
    role: WorkspaceRole;
    invited_by: string | null;
    created_at: string;
    status: 'pending';
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
    body: { email: string; role: WorkspaceRole },
): Promise<WorkspaceMember> {
    return postJson<WorkspaceMember, { email: string; role: WorkspaceRole }>(
        `/api/v1/workspaces/${workspaceId}/members`,
        body,
    );
}

export async function updateMemberRole(
    workspaceId: string,
    membershipId: string,
    body: { role: WorkspaceRole },
): Promise<WorkspaceMember> {
    return patchJson<WorkspaceMember, { role: WorkspaceRole }>(
        `/api/v1/workspaces/${workspaceId}/members/${membershipId}`,
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

/** Labels for display */
export const ROLE_LABELS: Record<WorkspaceRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
};

/** Hierarchy for permission checks */
export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
    owner: 4,
    admin: 3,
    member: 2,
    viewer: 1,
};

/** Permission matrix per role */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, string[]> = {
    owner: [
        'Full workspace control',
        'Delete workspace',
        'Manage all members',
        'Assign any role',
        'Rename workspace',
        'Manage spaces',
        'View all data',
    ],
    admin: [
        'Manage members (member/viewer)',
        'Rename workspace',
        'Manage spaces',
        'View all data',
    ],
    member: ['Use agents and tools', 'View spaces', 'View members'],
    viewer: ['Read-only access', 'View spaces', 'View members'],
};
