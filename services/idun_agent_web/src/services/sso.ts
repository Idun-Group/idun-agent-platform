import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';

export interface SSOConfig {
    enabled: boolean;
    issuer: string;
    clientId: string;
    allowedDomains?: string[] | null;
    allowedEmails?: string[] | null;
}

export interface ManagedSSO {
    id: string;
    name: string;
    sso: SSOConfig;
    created_at: string;
    updated_at: string;
}

interface ManagedSSOCreate {
    name: string;
    sso: SSOConfig;
}

interface ManagedSSOPatch {
    name: string;
    sso: SSOConfig;
}

export const fetchSSOs = async (projectId: string): Promise<ManagedSSO[]> => {
    return getJson<ManagedSSO[]>(`/api/v1/projects/${projectId}/sso/`);
};

export const getSSO = async (projectId: string, id: string): Promise<ManagedSSO> => {
    return getJson<ManagedSSO>(`/api/v1/projects/${projectId}/sso/${id}`);
};

export const createSSO = async (projectId: string, data: ManagedSSOCreate): Promise<ManagedSSO> => {
    return postJson<ManagedSSO>(`/api/v1/projects/${projectId}/sso/`, data);
};

export const updateSSO = async (projectId: string, id: string, data: ManagedSSOPatch): Promise<ManagedSSO> => {
    return patchJson<ManagedSSO>(`/api/v1/projects/${projectId}/sso/${id}`, data);
};

export const deleteSSO = async (projectId: string, id: string): Promise<void> => {
    await deleteRequest(`/api/v1/projects/${projectId}/sso/${id}`);
};
