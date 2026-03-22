import { getJson, postJson, deleteRequest } from '../utils/api';

export interface ManagedPrompt {
    id: string;
    prompt_id: string;
    version: number;
    content: string;
    tags: string[];
    created_at: string;
    updated_at: string;
}

interface CreatePromptPayload {
    prompt_id: string;
    content: string;
    tags?: string[];
}

export async function listPrompts(): Promise<ManagedPrompt[]> {
    return getJson<ManagedPrompt[]>('/api/v1/prompts/');
}

export async function createPrompt(payload: CreatePromptPayload): Promise<ManagedPrompt> {
    return postJson<ManagedPrompt, CreatePromptPayload>('/api/v1/prompts/', payload);
}

export async function deletePrompt(id: string): Promise<void> {
    await deleteRequest(`/api/v1/prompts/${id}`);
}

export async function listAgentPrompts(agentId: string): Promise<ManagedPrompt[]> {
    return getJson<ManagedPrompt[]>(`/api/v1/prompts/agent/${agentId}`);
}

export async function assignPrompt(promptId: string, agentId: string): Promise<{ status: string }> {
    return postJson<{ status: string }, Record<string, never>>(
        `/api/v1/prompts/${promptId}/assign/${agentId}`,
        {}
    );
}

export async function unassignPrompt(promptId: string, agentId: string): Promise<void> {
    await deleteRequest(`/api/v1/prompts/${promptId}/assign/${agentId}`);
}
