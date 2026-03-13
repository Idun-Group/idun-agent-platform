import { deleteRequest, getJson, patchJson, postJson } from '../utils/api';

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

export async function removeMember(
    workspaceId: string,
    membershipId: string,
): Promise<void> {
    await deleteRequest(`/api/v1/workspaces/${workspaceId}/members/${membershipId}`);
}

export async function updateMember(
    workspaceId: string,
    membershipId: string,
    body: { is_owner: boolean },
): Promise<WorkspaceMember> {
    return patchJson<WorkspaceMember>(
        `/api/v1/workspaces/${workspaceId}/members/${membershipId}`,
        body,
    );
}

export async function leaveWorkspace(
    workspaceId: string,
): Promise<void> {
    await postJson(`/api/v1/workspaces/${workspaceId}/leave`, {});
}

export async function cancelInvitation(
    workspaceId: string,
    invitationId: string,
): Promise<void> {
    await deleteRequest(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`,
    );
}

export type ProjectRole = 'admin' | 'contributor' | 'reader';

export type ProjectAssignment = {
    project_id: string;
    role: ProjectRole;
};

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
