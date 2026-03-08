import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';

// --- Types ---

export type ProjectRole = "admin" | "contributor" | "reader";

export interface ProjectAssignment {
  project_id: string;
  role: ProjectRole;
}

export interface MemberRead {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  is_owner: boolean;
  created_at: string;
}

export interface InvitationProjectRead {
  project_id: string;
  role: ProjectRole;
}

export interface InvitationRead {
  id: string;
  email: string;
  is_owner: boolean;
  invited_by: string | null;
  created_at: string;
  project_assignments: InvitationProjectRead[];
}

export interface MemberListResponse {
  members: MemberRead[];
  invitations: InvitationRead[];
  total: number;
}

export interface ProjectMemberRead {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  role: ProjectRole;
  is_workspace_owner: boolean;
  created_at: string;
}

export interface ProjectMemberListResponse {
  members: ProjectMemberRead[];
  total: number;
}

// --- Workspace Invitations ---

export async function acceptInvitation(workspaceId: string): Promise<MemberRead> {
  return postJson<MemberRead>(`/api/v1/workspaces/${workspaceId}/accept-invitation`, {});
}

// --- Workspace Members ---

export async function listWorkspaceMembers(workspaceId: string): Promise<MemberListResponse> {
  return getJson<MemberListResponse>(`/api/v1/workspaces/${workspaceId}/members`);
}

export async function addWorkspaceMember(
  workspaceId: string,
  data: { email: string; is_owner?: boolean; project_assignments?: ProjectAssignment[] }
): Promise<MemberRead | InvitationRead> {
  return postJson<MemberRead | InvitationRead>(`/api/v1/workspaces/${workspaceId}/members`, data);
}

export async function removeWorkspaceMember(
  workspaceId: string,
  membershipId: string
): Promise<void> {
  await deleteRequest(`/api/v1/workspaces/${workspaceId}/members/${membershipId}`);
}

export async function cancelInvitation(
  workspaceId: string,
  invitationId: string
): Promise<void> {
  await deleteRequest(`/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`);
}

// --- Project Members ---

export async function listProjectMembers(projectId: string): Promise<ProjectMemberListResponse> {
  return getJson<ProjectMemberListResponse>(`/api/v1/projects/${projectId}/members`);
}

export async function addProjectMember(
  projectId: string,
  data: { user_id: string; role: ProjectRole }
): Promise<ProjectMemberRead> {
  return postJson<ProjectMemberRead>(`/api/v1/projects/${projectId}/members`, data);
}

export async function updateProjectMemberRole(
  projectId: string,
  membershipId: string,
  data: { role: ProjectRole }
): Promise<ProjectMemberRead> {
  return patchJson<ProjectMemberRead>(`/api/v1/projects/${projectId}/members/${membershipId}`, data);
}

export async function removeProjectMember(
  projectId: string,
  membershipId: string
): Promise<void> {
  await deleteRequest(`/api/v1/projects/${projectId}/members/${membershipId}`);
}
