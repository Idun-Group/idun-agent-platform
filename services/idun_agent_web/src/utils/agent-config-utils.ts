import type { ApplicationConfig } from '../types/application.types';
import type { ManagedSSO } from '../services/sso';
import type { ManagedIntegration } from '../services/integrations';

// Mapping of AgentFramework enum to OpenAPI schema definition names
export const FRAMEWORK_SCHEMA_MAP: Record<string, string> = {
    'LANGGRAPH': 'LangGraphAgentConfig',
    'HAYSTACK': 'HaystackAgentConfig',
    'ADK': 'AdkAgentConfig',
    'CREWAI': 'BaseAgentConfig',
    'CUSTOM': 'BaseAgentConfig'
};

export const OBSERVABILITY_TYPES: string[] = ['Langfuse', 'Phoenix', 'GoogleCloudLogging', 'GoogleCloudTrace', 'LangSmith'];

export const FRAMEWORK_MEMORY_MAP: Record<string, string[]> = {
    'LANGGRAPH': ['PostgreSQL', 'SQLite'],
    'ADK': ['AdkVertexAi', 'AdkDatabase'],
    'HAYSTACK': [],
    'CREWAI': [],
    'CUSTOM': []
};

export const OBSERVABILITY_PROVIDER_MAP: Record<string, string> = {
    'langfuse': 'Langfuse',
    'LANGFUSE': 'Langfuse',
    'phoenix': 'Phoenix',
    'PHOENIX': 'Phoenix',
    'google_cloud_logging': 'GoogleCloudLogging',
    'GCP_LOGGING': 'GoogleCloudLogging',
    'google_cloud_trace': 'GoogleCloudTrace',
    'GCP_TRACE': 'GoogleCloudTrace',
    'langsmith': 'LangSmith',
    'LANGSMITH': 'LangSmith'
};

export interface AvailableResources {
    observabilityApps: ApplicationConfig[];
    memoryApps: ApplicationConfig[];
    mcpApps: ApplicationConfig[];
    guardApps: ApplicationConfig[];
    ssoConfigs: ManagedSSO[];
    integrationConfigs: ManagedIntegration[];
}

export interface AgentSelections {
    selectedMemoryType: string;
    selectedMemoryAppId: string;
    selectedObservabilityTypes: string[];
    selectedObservabilityApps: Record<string, string>;
    selectedMCPIds: string[];
    selectedGuardIds: string[];
    selectedSSOId: string;
    selectedIntegrationIds: string[];
}

export function getDefaultSelections(): AgentSelections {
    return {
        selectedMemoryType: 'InMemoryCheckpointConfig',
        selectedMemoryAppId: '',
        selectedObservabilityTypes: [],
        selectedObservabilityApps: {},
        selectedMCPIds: [],
        selectedGuardIds: [],
        selectedSSOId: '',
        selectedIntegrationIds: [],
    };
}

/**
 * Stringify a config field value if it's not already a string.
 */
function stringifyConfigField(value: unknown): string | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 4);
    } catch {
        return undefined;
    }
}

/**
 * Extract the agent config object from engine_config, normalizing JSON fields to strings.
 */
export function extractAgentConfig(engineConfig: any): Record<string, any> {
    const config = { ...(engineConfig?.agent?.config || {}) };
    const jsonFields = ['graph_definition', 'component_definition', 'input_schema_definition', 'output_schema_definition', 'store'];
    for (const key of jsonFields) {
        if (config[key] && typeof config[key] !== 'string') {
            const str = stringifyConfigField(config[key]);
            if (str) config[key] = str;
        }
    }
    return config;
}

/**
 * Extract selections from a BackendAgent response.
 * Reads resource IDs from the `resources` field (relational references).
 */
export function extractSelectionsFromAgent(
    agentResponse: any,
    framework: string,
    resources: AvailableResources
): AgentSelections {
    const selections = getDefaultSelections();
    const refs = agentResponse?.resources;

    if (!refs) {
        // No resource references — return defaults (in-memory, no resources)
        selections.selectedMemoryType = framework === 'ADK' ? 'AdkInMemory' : 'InMemoryCheckpointConfig';
        return selections;
    }

    // Memory
    if (refs.memory_id) {
        selections.selectedMemoryAppId = refs.memory_id;
        const memApp = resources.memoryApps.find(a => a.id === refs.memory_id);
        if (memApp) {
            selections.selectedMemoryType = memApp.type;
        }
    } else {
        selections.selectedMemoryType = framework === 'ADK' ? 'AdkInMemory' : 'InMemoryCheckpointConfig';
    }

    // SSO
    if (refs.sso_id) {
        selections.selectedSSOId = refs.sso_id;
    }

    // Guardrails
    if (refs.guardrail_ids && Array.isArray(refs.guardrail_ids)) {
        selections.selectedGuardIds = refs.guardrail_ids.map((g: any) => typeof g === 'string' ? g : g.id);
    }

    // MCP servers
    if (refs.mcp_server_ids && Array.isArray(refs.mcp_server_ids)) {
        selections.selectedMCPIds = refs.mcp_server_ids;
    }

    // Observability
    if (refs.observability_ids && Array.isArray(refs.observability_ids)) {
        for (const obsId of refs.observability_ids) {
            const app = resources.observabilityApps.find(a => a.id === obsId);
            if (app) {
                if (!selections.selectedObservabilityTypes.includes(app.type)) {
                    selections.selectedObservabilityTypes.push(app.type);
                }
                selections.selectedObservabilityApps[app.type] = app.id;
            }
        }
    }

    // Integrations
    if (refs.integration_ids && Array.isArray(refs.integration_ids)) {
        selections.selectedIntegrationIds = refs.integration_ids;
    }

    return selections;
}

export interface AgentFormState {
    name: string;
    version: string;
    baseUrl: string;
    description: string;
    serverPort: string;
    agentType: string;
    agentConfig: Record<string, any>;
}

/**
 * Validate agent form state. Returns error message or null.
 */
export function validateAgentForm(state: AgentFormState): string | null {
    if (!state.name.trim()) return 'Agent name is required';
    if (!state.agentType) return 'Please select an agent type';

    const parsedPort = Number(state.serverPort);
    if (!Number.isFinite(parsedPort) || parsedPort <= 0) return 'Invalid server port';

    if (state.agentType === 'LANGGRAPH') {
        if (!state.agentConfig.graph_definition || (typeof state.agentConfig.graph_definition === 'string' && !state.agentConfig.graph_definition.trim())) {
            return 'Graph Definition is required for LangGraph agents';
        }
    }
    if (state.agentType === 'HAYSTACK') {
        if (!state.agentConfig.component_type) return 'Component Type is required for Haystack agents';
        if (!state.agentConfig.component_definition || (typeof state.agentConfig.component_definition === 'string' && !state.agentConfig.component_definition.trim())) {
            return 'Component Definition is required for Haystack agents';
        }
    }
    if (state.agentType === 'ADK') {
        if (!state.agentConfig.agent) return 'Agent definition is required for ADK agents';
        if (!state.agentConfig.app_name) return 'App Name is required for ADK agents';
    }
    return null;
}

/**
 * Build the PATCH payload for updating an agent.
 * Sends resource IDs via a `resources` field — the backend assembles the
 * full engine_config from relational data.
 */
export function buildAgentPatchPayload(
    state: AgentFormState,
    selections: AgentSelections,
): Record<string, any> {
    const parsedPort = Number(state.serverPort);
    const finalAgentConfig = { ...state.agentConfig };

    // Parse JSON string fields back to objects
    for (const key of ['input_schema_definition', 'output_schema_definition', 'store']) {
        if (typeof finalAgentConfig[key] === 'string') {
            try {
                finalAgentConfig[key] = JSON.parse(finalAgentConfig[key]);
            } catch {
                // keep as string
            }
        }
    }

    // Strip any embedded resource fields from agent config — these are
    // now managed via FK/junction references, not inline config.
    delete finalAgentConfig.checkpointer;
    delete finalAgentConfig.session_service;
    delete finalAgentConfig.memory_service;

    // Build guardrail refs with position metadata
    const guardrailRefs = selections.selectedGuardIds.map((id, index) => ({
        id,
        position: 'input' as const,
        sort_order: index,
    }));

    // Build observability IDs from the per-type app selections
    const observabilityIds: string[] = [];
    for (const type of selections.selectedObservabilityTypes) {
        const appId = selections.selectedObservabilityApps[type];
        if (appId) {
            observabilityIds.push(appId);
        }
    }

    return {
        name: state.name.trim(),
        version: state.version.trim() || '1.0.0',
        base_url: state.baseUrl.trim() || null,
        engine_config: {
            server: { api: { port: parsedPort } },
            agent: { type: state.agentType, config: finalAgentConfig },
        },
        resources: {
            memory_id: selections.selectedMemoryAppId || null,
            sso_id: selections.selectedSSOId || null,
            guardrail_ids: guardrailRefs.length > 0 ? guardrailRefs : [],
            mcp_server_ids: selections.selectedMCPIds,
            observability_ids: observabilityIds,
            integration_ids: selections.selectedIntegrationIds,
        },
    };
}
