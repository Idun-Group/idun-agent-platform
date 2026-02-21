import { getJson, postJson, putJson, patchJson, deleteRequest } from '../utils/api';
import type { components, operations } from '../generated/agent-manager';
import { runtimeConfig } from '../utils/runtime-config';

const USE_MOCKS = runtimeConfig.USE_MOCKS === 'true';

type ManagedAgent = components['schemas']['ManagedAgentRead'];
type AgentFramework = components['schemas']['AgentFramework'];

type ListAgentsQuery = operations['list_agents_api_v1_agents__get']['parameters']['query'];

export type BackendAgent = ManagedAgent & {
    framework: AgentFramework;
    description: string | null;
    config?: unknown;
    run_config?: {
        env?: Record<string, string | undefined>;
    };
    base_url?: string | null;
};

const createMockManagedAgent = (index: number): ManagedAgent => {
    const now = new Date();
    const created = new Date(now.getTime() - (index + 1) * 86400000);
    const updated = new Date(created.getTime() + 3600000 * (index + 1));

    const base = {
        id: `00000000-0000-0000-0000-00000000000${index + 1}`,
        name: `Mock Agent ${index + 1}`,
        status: (index % 2 === 0 ? 'draft' : 'active') as ManagedAgent['status'],
        version: '0.1.0',
        engine_config: {
            server: {
                api: {
                    port: 8000,
                },
            },
            agent: {
                type: 'LANGGRAPH' as AgentFramework,
                config: {
                    name: `Mock Agent ${index + 1}`,
                    graph_definition: 'mock_graph.py',
                    input_schema_definition: null,
                    output_schema_definition: null,
                    observability: null,
                    checkpointer: null,
                    store: null,
                },
            },
        },
        created_at: created.toISOString(),
        updated_at: updated.toISOString(),
    } satisfies ManagedAgent;

    return base;
};

const MOCK_MANAGED_AGENTS: ManagedAgent[] = Array.from({ length: 8 }).map((_, index) =>
    createMockManagedAgent(index)
);

const deriveDescription = (agent: ManagedAgent): string | null => {
    const config = agent.engine_config?.agent?.config as Record<string, unknown> | undefined;
    const maybe = config && typeof config.description === 'string' ? config.description : null;
    return maybe ?? null;
};

const deriveRunConfig = (
    agent: ManagedAgent
): BackendAgent['run_config'] | undefined => {
    const config = agent.engine_config?.agent?.config as Record<string, unknown> | undefined;
    if (!config) return undefined;

    const maybeRunConfig = (config as Record<string, unknown>).run_config;
    if (maybeRunConfig && typeof maybeRunConfig === 'object') {
        const env = (maybeRunConfig as Record<string, unknown>).env;
        if (env && typeof env === 'object') {
            const envRecord: Record<string, string | undefined> = {};
            for (const [key, value] of Object.entries(env)) {
                envRecord[key] = typeof value === 'string' ? value : undefined;
            }
            return { env: envRecord };
        }
    }
    return undefined;
        };

const decorateAgent = (agent: ManagedAgent): BackendAgent => {
    const framework = agent.engine_config.agent.type;
    return {
        ...agent,
        framework,
        description: deriveDescription(agent),
        config: agent.engine_config.agent.config,
        run_config: deriveRunConfig(agent),
    };
};

export type ListAgentsParams = ListAgentsQuery;

export async function listAgents(
    params: ListAgentsParams = {}
): Promise<BackendAgent[]> {
    if (USE_MOCKS) {
        const offset = params.offset ?? 0;
        const limit = params.limit ?? MOCK_MANAGED_AGENTS.length;
        return MOCK_MANAGED_AGENTS.slice(offset, offset + limit).map(decorateAgent);
    }

    const query = new URLSearchParams();
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));

    const qs = query.toString();
    const path = `/api/v1/agents/${qs ? `?${qs}` : ''}`;

    const result = await getJson<ManagedAgent[]>(path);
    return result.map(decorateAgent);
}

export async function getAgent(agentId: string): Promise<BackendAgent> {
    if (USE_MOCKS) {
        const found = MOCK_MANAGED_AGENTS.find((a) => a.id === agentId) ||
            MOCK_MANAGED_AGENTS[0];
        return decorateAgent(found);
    }

    const agent = await getJson<ManagedAgent>(`/api/v1/agents/${agentId}`);
    return decorateAgent(agent);
}

export function createAgent(payload: unknown): Promise<BackendAgent> {
    return postJson<ManagedAgent, unknown>('/api/v1/agents/', payload).then(
        decorateAgent
    );
}

export function updateAgent(agentId: string, payload: unknown): Promise<BackendAgent> {
    return putJson<ManagedAgent, unknown>(`/api/v1/agents/${agentId}`, payload).then(
        decorateAgent
    );
}

export function patchAgent(agentId: string, payload: unknown): Promise<BackendAgent> {
    return patchJson<ManagedAgent, unknown>(
        `/api/v1/agents/${agentId}`,
        payload
    ).then(decorateAgent);
}

export async function deleteAgent(agentId: string): Promise<void> {
    if (USE_MOCKS) {
        return;
    }
    await deleteRequest(`/api/v1/agents/${agentId}`);
}

export function restartAgent(baseUrl: string): Promise<unknown> {
    const url = baseUrl.endsWith('/') ? `${baseUrl}reload` : `${baseUrl}/reload`;
    return postJson(url, {});
}
