import { getJson, postJson, putJson, patchJson, deleteRequest } from '../utils/api';

export type AgentFramework = 'langgraph' | 'langchain' | 'autogen' | 'crewai' | 'custom';
export type AgentStatus = 'draft' | 'ready' | 'deployed' | 'running' | 'stopped' | 'error';

export interface BackendAgent {
    id: string;
    name: string;
    description?: string | null;
    framework: AgentFramework;
    status: AgentStatus;
    created_at: string;
    updated_at: string;
}

export interface AgentCreatePayload {
    name: string;
    description?: string;
    config: {
        agent: {
            type: AgentFramework | 'custom';
            config: Record<string, unknown>;
        };
    };
}

export type AgentReplacePayload = AgentCreatePayload;

export interface AgentPatchPayload {
    name?: string;
    description?: string;
    config?: AgentCreatePayload['config'];
}

export interface ListAgentsParams {
    limit?: number;
    offset?: number;
    sort_by?: 'name' | 'description' | 'framework' | 'status' | 'created_at' | 'updated_at';
    order?: 'asc' | 'desc';
}

export function listAgents(params: ListAgentsParams = {}): Promise<BackendAgent[]> {
    const query = new URLSearchParams();
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    if (params.sort_by) query.set('sort_by', params.sort_by);
    if (params.order) query.set('order', params.order);
    const qs = query.toString();
    const path = `/api/v1/agents${qs ? `?${qs}` : ''}`;
    return getJson<BackendAgent[]>(path);
}

export function getAgent(agentId: string): Promise<BackendAgent> {
    return getJson<BackendAgent>(`/api/v1/agents/${agentId}`);
}

export function createAgent(payload: AgentCreatePayload): Promise<BackendAgent> {
    return postJson<BackendAgent, AgentCreatePayload>('/api/v1/agents', payload);
}

export function updateAgent(agentId: string, payload: AgentReplacePayload): Promise<BackendAgent> {
    return putJson<BackendAgent, AgentReplacePayload>(`/api/v1/agents/${agentId}`, payload);
}

export function patchAgent(agentId: string, payload: AgentPatchPayload): Promise<BackendAgent> {
    return patchJson<BackendAgent, AgentPatchPayload>(`/api/v1/agents/${agentId}`, payload);
}

export async function deleteAgent(agentId: string): Promise<void> {
    await deleteRequest(`/api/v1/agents/${agentId}`);
}


