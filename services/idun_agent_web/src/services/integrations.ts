import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';

export type IntegrationProvider = 'WHATSAPP' | 'DISCORD' | 'SLACK';

export interface WhatsAppIntegrationConfig {
    access_token: string;
    phone_number_id: string;
    verify_token: string;
    api_version?: string;
}

export interface DiscordIntegrationConfig {
    bot_token: string;
    application_id: string;
    public_key: string;
    guild_id?: string;
}

export interface SlackIntegrationConfig {
    bot_token: string;
    signing_secret: string;
}

export interface IntegrationConfig {
    provider: IntegrationProvider;
    enabled: boolean;
    config: WhatsAppIntegrationConfig | DiscordIntegrationConfig | SlackIntegrationConfig;
}

export interface ManagedIntegration {
    id: string;
    name: string;
    integration: IntegrationConfig;
    created_at: string;
    updated_at: string;
}

interface ManagedIntegrationCreate {
    name: string;
    integration: IntegrationConfig;
}

interface ManagedIntegrationPatch {
    name: string;
    integration: IntegrationConfig;
}

export const fetchIntegrations = async (projectId: string): Promise<ManagedIntegration[]> => {
    return getJson<ManagedIntegration[]>(`/api/v1/projects/${projectId}/integrations/`);
};

export const getIntegration = async (projectId: string, id: string): Promise<ManagedIntegration> => {
    return getJson<ManagedIntegration>(`/api/v1/projects/${projectId}/integrations/${id}`);
};

export const createIntegration = async (projectId: string, data: ManagedIntegrationCreate): Promise<ManagedIntegration> => {
    return postJson<ManagedIntegration>(`/api/v1/projects/${projectId}/integrations/`, data);
};

export const updateIntegration = async (projectId: string, id: string, data: ManagedIntegrationPatch): Promise<ManagedIntegration> => {
    return patchJson<ManagedIntegration>(`/api/v1/projects/${projectId}/integrations/${id}`, data);
};

export const deleteIntegration = async (projectId: string, id: string): Promise<void> => {
    await deleteRequest(`/api/v1/projects/${projectId}/integrations/${id}`);
};
