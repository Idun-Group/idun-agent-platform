import { deleteRequest, getJson, patchJson, postJson } from '../utils/api';

export type ProjectRole = 'admin' | 'contributor' | 'reader';

export type ProjectMember = {
    id: string;
    user_id: string;
    email: string;
    name: string | null;
    picture_url: string | null;
    role: ProjectRole;
    created_at: string;
};

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return getJson<ProjectMember[]>(`/api/v1/projects/${projectId}/members`);
}

export async function addProjectMember(
    projectId: string,
    body: { email: string; role: ProjectRole }
): Promise<ProjectMember> {
    return postJson<ProjectMember, typeof body>(`/api/v1/projects/${projectId}/members`, body);
}

export async function updateProjectMemberRole(
    projectId: string,
    membershipId: string,
    body: { role: ProjectRole }
): Promise<ProjectMember> {
    return patchJson<ProjectMember, typeof body>(
        `/api/v1/projects/${projectId}/members/${membershipId}`,
        body,
    );
}

export async function removeProjectMember(projectId: string, membershipId: string): Promise<void> {
    await deleteRequest(`/api/v1/projects/${projectId}/members/${membershipId}`);
}
