import { deleteRequest, getJson, patchJson, postJson } from '../utils/api';

export type ProjectRole = 'admin' | 'contributor' | 'reader';

export type WorkspaceMember = {
    id: string;
    user_id: string;
    email: string;
    name: string | null;
    picture_url: string | null;
    is_owner: boolean;
    created_at: string;
};

export type ProjectAssignment = {
    project_id: string;
    role: ProjectRole;
};

export type WorkspaceInvitation = {
    id: string;
    email: string;
    is_owner: boolean;
    project_assignments: ProjectAssignment[];
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
    body: { email: string; is_owner: boolean; project_assignments?: ProjectAssignment[] },
): Promise<WorkspaceMember> {
    return postJson<WorkspaceMember, { email: string; is_owner: boolean; project_assignments?: ProjectAssignment[] }>(
        `/api/v1/workspaces/${workspaceId}/members`,
        body,
    );
}

export async function updateMemberOwnership(
    workspaceId: string,
    membershipId: string,
    body: { is_owner: boolean },
): Promise<WorkspaceMember> {
    return patchJson<WorkspaceMember, { is_owner: boolean }>(
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

export function formatWorkspaceAccessLabel(member: WorkspaceMember | WorkspaceInvitation): string {
    return member.is_owner ? 'Owner' : 'Member';
}
