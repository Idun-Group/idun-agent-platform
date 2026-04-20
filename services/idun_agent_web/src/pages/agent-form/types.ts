export type Framework = 'LANGGRAPH' | 'ADK';
export type HostMode = 'localhost' | 'remote';

export interface WizardState {
    // Step 1
    name: string;
    framework: Framework | '';

    // Step 2 - LangGraph
    graphDefinition: string;

    // Step 2 - ADK
    adkAgent: string;
    adkAppName: string;

    // Step 2 - Host
    hostMode: HostMode;
    serverPort: string;
    remoteUrl: string;

    // MCP exposure
    asMcp: boolean;
    mcpDescription: string;

    // Step 3 - populated after creation
    createdAgentId: string | null;
    apiKey: string | null;
}

/** Derives the effective base_url from the wizard state. */
export function resolveBaseUrl(state: WizardState): string {
    if (state.hostMode === 'localhost') {
        return `http://localhost:${state.serverPort || '8800'}`;
    }
    return state.remoteUrl;
}

/** Derives the server port number for the engine_config payload. */
export function resolveServerPort(state: WizardState): number {
    if (state.hostMode === 'localhost') {
        const p = parseInt(state.serverPort, 10);
        return Number.isFinite(p) && p > 0 ? p : 8800;
    }
    return 8000; // default for remote
}

export const INITIAL_WIZARD_STATE: WizardState = {
    name: '',
    framework: '',
    graphDefinition: '',
    adkAgent: '',
    adkAppName: '',
    hostMode: 'localhost',
    serverPort: '8800',
    remoteUrl: '',
    asMcp: true,
    mcpDescription: '',
    createdAgentId: null,
    apiKey: null,
};
