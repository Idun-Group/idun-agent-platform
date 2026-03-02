import type { ApplicationConfig, AppType } from '../types/application.types';
import type { ManagedSSO } from '../services/sso';
import type { ManagedIntegration } from '../services/integrations';
import { mapConfigToApi } from '../services/applications';

// Mapping of AgentFramework enum to OpenAPI schema definition names
export const FRAMEWORK_SCHEMA_MAP: Record<string, string> = {
    'LANGGRAPH': 'LangGraphAgentConfig',
    'HAYSTACK': 'HaystackAgentConfig',
    'ADK': 'AdkAgentConfig',
    'CREWAI': 'BaseAgentConfig',
    'CUSTOM': 'BaseAgentConfig'
};

export const OBSERVABILITY_TYPES: AppType[] = ['Langfuse', 'Phoenix', 'GoogleCloudLogging', 'GoogleCloudTrace', 'LangSmith'];

export const FRAMEWORK_MEMORY_MAP: Record<string, AppType[]> = {
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

export const OBSERVABILITY_PROVIDER_REVERSE_MAP: Record<string, string> = {
    'Langfuse': 'LANGFUSE',
    'Phoenix': 'PHOENIX',
    'GoogleCloudLogging': 'GCP_LOGGING',
    'GoogleCloudTrace': 'GCP_TRACE',
    'LangSmith': 'LANGSMITH'
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
 * Extract selections from a BackendAgent's engine_config, matching against available resources.
 */
export function extractSelectionsFromAgent(
    engineConfig: any,
    framework: string,
    resources: AvailableResources
): AgentSelections {
    const selections = getDefaultSelections();
    const config = engineConfig?.agent?.config || {};

    // Memory / Checkpointer
    const checkpointer = config.checkpointer;
    const sessionService = config.session_service;

    if (framework === 'ADK') {
        if (sessionService) {
            if (sessionService.type === 'in_memory') {
                selections.selectedMemoryType = 'AdkInMemory';
            } else {
                const typeMap: Record<string, string> = { 'vertex_ai': 'AdkVertexAi', 'database': 'AdkDatabase' };
                const memType = typeMap[sessionService.type];
                if (memType) {
                    selections.selectedMemoryType = memType;
                    const match = resources.memoryApps.find(app => {
                        if (app.type !== memType) return false;
                        if (memType === 'AdkDatabase') return app.config.connectionString === sessionService.db_url;
                        if (memType === 'AdkVertexAi') return app.config.project_id === sessionService.project_id;
                        return false;
                    });
                    if (match) selections.selectedMemoryAppId = match.id;
                }
            }
        } else {
            selections.selectedMemoryType = 'AdkInMemory';
        }
    } else if (checkpointer) {
        if (checkpointer.type === 'memory') {
            selections.selectedMemoryType = 'InMemoryCheckpointConfig';
        } else {
            const memType = checkpointer.type === 'sqlite' ? 'SQLite' : 'PostgreSQL';
            selections.selectedMemoryType = memType;
            if (checkpointer.db_url) {
                const match = resources.memoryApps.find(app => app.type === memType && app.config.connectionString === checkpointer.db_url);
                if (match) selections.selectedMemoryAppId = match.id;
            }
        }
    } else {
        selections.selectedMemoryType = 'InMemoryCheckpointConfig';
    }

    // Observability
    const obs = engineConfig?.observability || config.observability;
    if (Array.isArray(obs)) {
        const types: string[] = [];
        const selectedApps: Record<string, string> = {};
        for (const o of obs) {
            if (o.provider && o.enabled !== false) {
                const type = OBSERVABILITY_PROVIDER_MAP[o.provider];
                if (type) {
                    types.push(type);
                    if (o.config) {
                        const match = resources.observabilityApps.find(app => {
                            if (app.type !== type) return false;
                            const keys = Object.keys(o.config);
                            return keys.length > 0 && keys.every(k => app.config[k] === o.config[k]);
                        });
                        if (match) selectedApps[type] = match.id;
                    }
                }
            }
        }
        selections.selectedObservabilityTypes = [...new Set(types)];
        selections.selectedObservabilityApps = selectedApps;
    }

    // Guardrails — match by config_id→type mapping, then fall back to name
    const CONFIG_ID_TO_TYPE: Record<string, AppType> = {
        ban_list: 'BanList',
        detect_pii: 'DetectPII',
        nsfw_text: 'NSFWText',
        toxic_language: 'ToxicLanguage',
        gibberish_text: 'GibberishText',
        bias_check: 'BiasCheck',
        competition_check: 'CompetitionCheck',
        correct_language: 'CorrectLanguage',
        restrict_to_topic: 'RestrictTopic',
        model_armor: 'ModelArmor',
        custom_llm_guardrail: 'CustomLLMGuardrail',
        detect_jailbreak: 'DetectJailbreak',
        rag_hallucination: 'RagHallucination',
    };
    const guards = engineConfig?.guardrails;
    if (guards?.input && Array.isArray(guards.input)) {
        const ids: string[] = [];
        const usedAppIds = new Set<string>();
        for (const g of guards.input) {
            const expectedType = g.config_id ? CONFIG_ID_TO_TYPE[g.config_id] : undefined;
            // Try matching by type first (most reliable), then by name
            const match = resources.guardApps.find(app =>
                !usedAppIds.has(app.id) && (
                    (expectedType && app.type === expectedType) ||
                    (g.name && app.name === g.name)
                )
            );
            if (match) {
                ids.push(match.id);
                usedAppIds.add(match.id);
            }
        }
        selections.selectedGuardIds = [...new Set(ids)];
    }

    // MCP Servers — handle both snake_case and camelCase field names
    const mcp = engineConfig?.mcp_servers || engineConfig?.mcpServers;
    if (Array.isArray(mcp)) {
        const ids: string[] = [];
        for (const m of mcp) {
            const match = resources.mcpApps.find(app => app.name === m.name);
            if (match) ids.push(match.id);
        }
        selections.selectedMCPIds = [...new Set(ids)];
    }

    // SSO
    const sso = engineConfig?.sso;
    if (sso) {
        const match = resources.ssoConfigs.find(c => c.sso.issuer === sso.issuer && c.sso.clientId === sso.clientId);
        if (match) selections.selectedSSOId = match.id;
    }

    // Integrations
    const ints = engineConfig?.integrations;
    if (Array.isArray(ints)) {
        const ids: string[] = [];
        for (const i of ints) {
            const match = resources.integrationConfigs.find(c => c.integration.provider === i.provider);
            if (match) ids.push(match.id);
        }
        selections.selectedIntegrationIds = [...new Set(ids)];
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
 */
export function buildAgentPatchPayload(
    state: AgentFormState,
    selections: AgentSelections,
    resources: AvailableResources
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

    // 1. Memory
    if (state.agentType === 'ADK') {
        if (selections.selectedMemoryType === 'AdkInMemory' || !selections.selectedMemoryAppId) {
            finalAgentConfig.session_service = { type: 'in_memory' };
        } else if (selections.selectedMemoryAppId) {
            const memApp = resources.memoryApps.find(a => a.id === selections.selectedMemoryAppId);
            if (memApp) {
                const typeMap: Record<string, string> = { 'AdkVertexAi': 'vertex_ai', 'AdkDatabase': 'database' };
                const type = typeMap[memApp.type];
                if (type) {
                    const sessionConfig: Record<string, any> = { type };
                    if (type === 'vertex_ai') {
                        sessionConfig.project_id = memApp.config.project_id;
                        sessionConfig.location = memApp.config.location;
                        sessionConfig.reasoning_engine_app_name = memApp.config.reasoning_engine_app_name;
                    } else if (type === 'database') {
                        sessionConfig.db_url = memApp.config.connectionString || memApp.config.db_url;
                    }
                    finalAgentConfig.session_service = sessionConfig;
                }
            }
        }
        finalAgentConfig.memory_service = null;
    } else {
        if (selections.selectedMemoryType === 'InMemoryCheckpointConfig' || !selections.selectedMemoryAppId) {
            finalAgentConfig.checkpointer = { type: 'memory' };
        } else if (selections.selectedMemoryAppId) {
            const memApp = resources.memoryApps.find(a => a.id === selections.selectedMemoryAppId);
            if (memApp) {
                const typeMap: Record<string, string> = { 'SQLite': 'sqlite', 'PostgreSQL': 'postgres' };
                finalAgentConfig.checkpointer = {
                    type: typeMap[memApp.type] || memApp.type.toLowerCase(),
                    db_url: memApp.config.connectionString
                };
            }
        }
    }

    // 2. Observability
    const observabilityConfigs: any[] = [];
    for (const type of selections.selectedObservabilityTypes) {
        const appId = selections.selectedObservabilityApps[type];
        if (appId) {
            const app = resources.observabilityApps.find(a => a.id === appId);
            if (app) {
                const providerKey = OBSERVABILITY_PROVIDER_REVERSE_MAP[app.type] || app.type.toLowerCase();
                observabilityConfigs.push({
                    enabled: true,
                    provider: providerKey,
                    config: app.config
                });
            }
        }
    }

    // 3. MCP & Guardrails
    const mcpConfigs = selections.selectedMCPIds
        .map(id => {
            const app = resources.mcpApps.find(a => a.id === id);
            return app ? mapConfigToApi('MCPServer', app.config, app.name) : null;
        })
        .filter(Boolean);

    const guardConfigObjects = selections.selectedGuardIds
        .map(id => {
            const app = resources.guardApps.find(a => a.id === id);
            return app ? mapConfigToApi(app.type, app.config) : null;
        })
        .filter(Boolean);

    const guardrailsConfig = guardConfigObjects.length > 0
        ? { input: guardConfigObjects, output: [] }
        : null;

    // 4. SSO
    const selectedSSO = selections.selectedSSOId
        ? resources.ssoConfigs.find(c => c.id === selections.selectedSSOId)
        : null;
    const ssoConfig = selectedSSO ? selectedSSO.sso : null;

    // 5. Integrations
    const integrationsConfig = selections.selectedIntegrationIds
        .map(id => resources.integrationConfigs.find(c => c.id === id)?.integration)
        .filter(Boolean);

    return {
        name: state.name.trim(),
        version: state.version.trim() || '1.0.0',
        base_url: state.baseUrl.trim() || null,
        engine_config: {
            server: { api: { port: parsedPort } },
            agent: { type: state.agentType, config: finalAgentConfig },
            mcp_servers: mcpConfigs.length > 0 ? mcpConfigs : null,
            guardrails: guardrailsConfig,
            observability: observabilityConfigs,
            sso: ssoConfig,
            integrations: integrationsConfig.length > 0 ? integrationsConfig : null
        }
    };
}
