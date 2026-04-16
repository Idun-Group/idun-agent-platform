import { deleteRequest, getJson, patchJson, postJson } from '../utils/api';

export type ProjectRole = 'admin' | 'contributor' | 'reader';

export type Project = {
    id: string;
    workspace_id: string;
    name: string;
    description?: string | null;
    is_default: boolean;
    current_user_role?: ProjectRole | null;
    created_at: string;
    updated_at: string;
};

export async function listProjects(): Promise<Project[]> {
    return getJson<Project[]>('/api/v1/projects/');
}

export async function getProject(projectId: string): Promise<Project> {
    return getJson<Project>(`/api/v1/projects/${projectId}`);
}

export async function createProject(body: {
    name: string;
    description?: string | null;
}): Promise<Project> {
    return postJson<Project, typeof body>('/api/v1/projects/', body);
}

export async function updateProject(
    projectId: string,
    body: { name?: string; description?: string | null }
): Promise<Project> {
    return patchJson<Project, typeof body>(`/api/v1/projects/${projectId}`, body);
}

export async function deleteProject(projectId: string): Promise<{ deleted: boolean; resource_count: number }> {
    return deleteRequest<{ deleted: boolean; resource_count: number }>(`/api/v1/projects/${projectId}`);
}

export async function setDefaultProject(projectId: string): Promise<Project> {
    return postJson<Project, Record<string, never>>(`/api/v1/projects/${projectId}/set-default`, {});
}
