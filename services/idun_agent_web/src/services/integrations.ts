import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';

export type IntegrationProvider = 'WHATSAPP' | 'DISCORD';

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

export interface IntegrationConfig {
    provider: IntegrationProvider;
    enabled: boolean;
    config: WhatsAppIntegrationConfig | DiscordIntegrationConfig;
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

export const fetchIntegrations = async (): Promise<ManagedIntegration[]> => {
    return getJson<ManagedIntegration[]>('/api/v1/integrations/');
};

export const getIntegration = async (id: string): Promise<ManagedIntegration> => {
    return getJson<ManagedIntegration>(`/api/v1/integrations/${id}`);
};

export const createIntegration = async (data: ManagedIntegrationCreate): Promise<ManagedIntegration> => {
    return postJson<ManagedIntegration>('/api/v1/integrations/', data);
};

export const updateIntegration = async (id: string, data: ManagedIntegrationPatch): Promise<ManagedIntegration> => {
    return patchJson<ManagedIntegration>(`/api/v1/integrations/${id}`, data);
};

export const deleteIntegration = async (id: string): Promise<void> => {
    await deleteRequest(`/api/v1/integrations/${id}`);
};
