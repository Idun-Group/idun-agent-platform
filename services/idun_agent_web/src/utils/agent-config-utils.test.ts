import { describe, it, expect } from 'vitest';
import {
    extractAgentConfig,
    extractSelectionsFromAgent,
    validateAgentForm,
    buildAgentPatchPayload,
    getDefaultSelections,
} from './agent-config-utils';
import type { AvailableResources, AgentFormState, AgentSelections } from './agent-config-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResources(overrides: Partial<AvailableResources> = {}): AvailableResources {
    return {
        observabilityApps: [],
        memoryApps: [],
        mcpApps: [],
        guardApps: [],
        ssoConfigs: [],
        integrationConfigs: [],
        ...overrides,
    };
}

function makeFormState(overrides: Partial<AgentFormState> = {}): AgentFormState {
    return {
        name: 'My Agent',
        version: '1.0.0',
        baseUrl: '',
        description: '',
        serverPort: '8080',
        agentType: 'LANGGRAPH',
        agentConfig: { graph_definition: '{}' },
        ...overrides,
    };
}

function makeSelections(overrides: Partial<AgentSelections> = {}): AgentSelections {
    return {
        ...getDefaultSelections(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// extractAgentConfig
// ---------------------------------------------------------------------------

describe('extractAgentConfig', () => {
    it('returns empty object when engineConfig is null', () => {
        expect(extractAgentConfig(null)).toEqual({});
    });

    it('returns empty object when engineConfig is undefined', () => {
        expect(extractAgentConfig(undefined)).toEqual({});
    });

    it('returns empty object when agent.config is missing but agent exists', () => {
        expect(extractAgentConfig({ agent: {} })).toEqual({});
    });

    it('returns agent.config fields when present', () => {
        const engineConfig = {
            agent: {
                config: {
                    graph_definition: 'some-graph',
                    custom_field: 'value',
                },
            },
        };
        const result = extractAgentConfig(engineConfig);
        expect(result.custom_field).toBe('value');
        expect(result.graph_definition).toBe('some-graph');
    });

    it('JSON-stringifies a non-string graph_definition object', () => {
        const graphObj = { nodes: [], edges: [] };
        const engineConfig = {
            agent: {
                config: {
                    graph_definition: graphObj,
                },
            },
        };
        const result = extractAgentConfig(engineConfig);
        expect(typeof result.graph_definition).toBe('string');
        expect(JSON.parse(result.graph_definition)).toEqual(graphObj);
    });

    it('preserves string graph_definition as-is', () => {
        const graphStr = '{"nodes":[],"edges":[]}';
        const engineConfig = {
            agent: {
                config: { graph_definition: graphStr },
            },
        };
        const result = extractAgentConfig(engineConfig);
        expect(result.graph_definition).toBe(graphStr);
    });
});

// ---------------------------------------------------------------------------
// extractSelectionsFromAgent
// ---------------------------------------------------------------------------

describe('extractSelectionsFromAgent', () => {
    it('returns default in-memory selections when agent has no resources field', () => {
        const result = extractSelectionsFromAgent({}, 'LANGGRAPH', makeResources());
        expect(result).toEqual(getDefaultSelections());
        expect(result.selectedMemoryType).toBe('InMemoryCheckpointConfig');
    });

    it('returns LANGGRAPH default in-memory type when framework is LANGGRAPH and no resources', () => {
        const result = extractSelectionsFromAgent({}, 'LANGGRAPH', makeResources());
        expect(result.selectedMemoryType).toBe('InMemoryCheckpointConfig');
    });

    it('returns ADK default in-memory type when framework is ADK and no resources', () => {
        const result = extractSelectionsFromAgent({}, 'ADK', makeResources());
        expect(result.selectedMemoryType).toBe('AdkInMemory');
    });

    it('maps memory_id to selectedMemoryAppId and looks up type from resources', () => {
        const memoryApp = { id: 'mem-1', type: 'PostgreSQL', name: 'Postgres Checkpointer' } as any;
        const resources = makeResources({ memoryApps: [memoryApp] });
        const agent = { resources: { memory_id: 'mem-1' } };

        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', resources);
        expect(result.selectedMemoryAppId).toBe('mem-1');
        expect(result.selectedMemoryType).toBe('PostgreSQL');
    });

    it('sets selectedSSOId from sso_id', () => {
        const agent = { resources: { sso_id: 'sso-42' } };
        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', makeResources());
        expect(result.selectedSSOId).toBe('sso-42');
    });

    it('maps mcp_server_ids to selectedMCPIds', () => {
        const agent = { resources: { mcp_server_ids: ['mcp-1', 'mcp-2'] } };
        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', makeResources());
        expect(result.selectedMCPIds).toEqual(['mcp-1', 'mcp-2']);
    });

    it('maps observability_ids to selectedObservabilityIds', () => {
        const agent = { resources: { observability_ids: ['obs-1'] } };
        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', makeResources());
        expect(result.selectedObservabilityIds).toEqual(['obs-1']);
    });

    it('maps integration_ids to selectedIntegrationIds', () => {
        const agent = { resources: { integration_ids: ['int-1', 'int-2'] } };
        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', makeResources());
        expect(result.selectedIntegrationIds).toEqual(['int-1', 'int-2']);
    });

    it('handles guardrail_ids as array of objects with id property', () => {
        const agent = {
            resources: {
                guardrail_ids: [{ id: 'guard-1', position: 'input', sort_order: 0 }, { id: 'guard-2', position: 'input', sort_order: 1 }],
            },
        };
        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', makeResources());
        expect(result.selectedGuardIds).toEqual(['guard-1', 'guard-2']);
    });

    it('handles guardrail_ids as plain string array', () => {
        const agent = { resources: { guardrail_ids: ['guard-1', 'guard-2'] } };
        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', makeResources());
        expect(result.selectedGuardIds).toEqual(['guard-1', 'guard-2']);
    });

    it('returns defaults for missing resource categories', () => {
        const agent = { resources: { memory_id: null } };
        const result = extractSelectionsFromAgent(agent, 'LANGGRAPH', makeResources());
        expect(result.selectedMCPIds).toEqual([]);
        expect(result.selectedObservabilityIds).toEqual([]);
        expect(result.selectedGuardIds).toEqual([]);
        expect(result.selectedIntegrationIds).toEqual([]);
        expect(result.selectedSSOId).toBe('');
    });
});

// ---------------------------------------------------------------------------
// validateAgentForm
// ---------------------------------------------------------------------------

describe('validateAgentForm', () => {
    it('returns error when name is empty', () => {
        const state = makeFormState({ name: '' });
        expect(validateAgentForm(state)).toBe('Agent name is required');
    });

    it('returns error when name is only whitespace', () => {
        const state = makeFormState({ name: '   ' });
        expect(validateAgentForm(state)).toBe('Agent name is required');
    });

    it('returns null for valid LANGGRAPH form with graph_definition', () => {
        const state = makeFormState({
            agentType: 'LANGGRAPH',
            agentConfig: { graph_definition: '{"nodes":[]}' },
        });
        expect(validateAgentForm(state)).toBeNull();
    });

    it('returns error for LANGGRAPH form missing graph_definition', () => {
        const state = makeFormState({
            agentType: 'LANGGRAPH',
            agentConfig: {},
        });
        expect(validateAgentForm(state)).toBe('Graph Definition is required for LangGraph agents');
    });

    it('returns error for LANGGRAPH form with empty string graph_definition', () => {
        const state = makeFormState({
            agentType: 'LANGGRAPH',
            agentConfig: { graph_definition: '   ' },
        });
        expect(validateAgentForm(state)).toBe('Graph Definition is required for LangGraph agents');
    });

    it('returns error for ADK form missing agent field', () => {
        const state = makeFormState({
            agentType: 'ADK',
            agentConfig: { app_name: 'my-app' },
        });
        expect(validateAgentForm(state)).toBe('Agent definition is required for ADK agents');
    });

    it('returns error for ADK form missing app_name', () => {
        const state = makeFormState({
            agentType: 'ADK',
            agentConfig: { agent: { type: 'LlmAgent' } },
        });
        expect(validateAgentForm(state)).toBe('App Name is required for ADK agents');
    });

    it('returns null for valid ADK form', () => {
        const state = makeFormState({
            agentType: 'ADK',
            agentConfig: { agent: { type: 'LlmAgent' }, app_name: 'my-app' },
        });
        expect(validateAgentForm(state)).toBeNull();
    });

    it('returns error for server port of 0', () => {
        const state = makeFormState({ serverPort: '0' });
        expect(validateAgentForm(state)).toBe('Invalid server port');
    });

    it('returns error for negative server port', () => {
        const state = makeFormState({ serverPort: '-1' });
        expect(validateAgentForm(state)).toBe('Invalid server port');
    });

    it('returns error for non-numeric server port', () => {
        const state = makeFormState({ serverPort: 'abc' });
        expect(validateAgentForm(state)).toBe('Invalid server port');
    });
});

// ---------------------------------------------------------------------------
// buildAgentPatchPayload
// ---------------------------------------------------------------------------

describe('buildAgentPatchPayload', () => {
    it('builds correct engine_config with server port and agent type', () => {
        const state = makeFormState({ serverPort: '9000', agentType: 'LANGGRAPH' });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.server.api.port).toBe(9000);
        expect(payload.engine_config.agent.type).toBe('LANGGRAPH');
    });

    it('strips checkpointer from agentConfig', () => {
        const state = makeFormState({
            agentConfig: { graph_definition: '{}', checkpointer: { type: 'sqlite' } },
        });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.agent.config.checkpointer).toBeUndefined();
    });

    it('strips session_service from agentConfig', () => {
        const state = makeFormState({
            agentConfig: { graph_definition: '{}', session_service: { type: 'db' } },
        });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.agent.config.session_service).toBeUndefined();
    });

    it('strips memory_service from agentConfig', () => {
        const state = makeFormState({
            agentConfig: { graph_definition: '{}', memory_service: { type: 'redis' } },
        });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.agent.config.memory_service).toBeUndefined();
    });

    it('maps guardrail IDs to refs with position: input and sort_order', () => {
        const selections = makeSelections({ selectedGuardIds: ['g-1', 'g-2'] });
        const payload = buildAgentPatchPayload(makeFormState(), selections);
        expect(payload.resources.guardrail_ids).toEqual([
            { id: 'g-1', position: 'input', sort_order: 0 },
            { id: 'g-2', position: 'input', sort_order: 1 },
        ]);
    });

    it('trims name and version', () => {
        const state = makeFormState({ name: '  My Agent  ', version: ' 2.0.0 ' });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.name).toBe('My Agent');
        expect(payload.version).toBe('2.0.0');
    });

    it('sets base_url to null when empty', () => {
        const state = makeFormState({ baseUrl: '' });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.base_url).toBeNull();
    });

    it('sets base_url to null when whitespace only', () => {
        const state = makeFormState({ baseUrl: '   ' });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.base_url).toBeNull();
    });

    it('preserves a non-empty base_url', () => {
        const state = makeFormState({ baseUrl: 'http://localhost:8817' });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.base_url).toBe('http://localhost:8817');
    });

    it('parses JSON string input_schema_definition back to object', () => {
        const schema = { type: 'object', properties: {} };
        const state = makeFormState({
            agentConfig: {
                graph_definition: '{}',
                input_schema_definition: JSON.stringify(schema),
            },
        });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.agent.config.input_schema_definition).toEqual(schema);
    });

    it('parses JSON string output_schema_definition back to object', () => {
        const schema = { type: 'object' };
        const state = makeFormState({
            agentConfig: {
                graph_definition: '{}',
                output_schema_definition: JSON.stringify(schema),
            },
        });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.agent.config.output_schema_definition).toEqual(schema);
    });

    it('parses JSON string store field back to object', () => {
        const storeVal = { backend: 'postgres' };
        const state = makeFormState({
            agentConfig: {
                graph_definition: '{}',
                store: JSON.stringify(storeVal),
            },
        });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.agent.config.store).toEqual(storeVal);
    });

    it('keeps invalid JSON string fields as strings', () => {
        const state = makeFormState({
            agentConfig: {
                graph_definition: '{}',
                input_schema_definition: 'not valid json {{{',
            },
        });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.engine_config.agent.config.input_schema_definition).toBe('not valid json {{{');
    });

    it('defaults version to 1.0.0 when empty', () => {
        const state = makeFormState({ version: '' });
        const payload = buildAgentPatchPayload(state, makeSelections());
        expect(payload.version).toBe('1.0.0');
    });
});
