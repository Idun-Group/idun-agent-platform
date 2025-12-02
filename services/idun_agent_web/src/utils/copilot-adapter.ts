// import { CopilotRuntime, ExperimentalEmptyAdapter, copilotRuntimeNodeHttpEndpoint } from "@copilotkit/runtime";
// import { HttpAgent } from "@ag-ui/client";

/**
 * Sets up a client-side interceptor for CopilotKit requests.
 * This function previously set up a client-side interceptor but now the app uses a proxy.
 * The runtime logic has been moved to the backend (copilot-runtime service).
 */
export function setupCopilotAdapter(agentEndpoint: string) {
    // No-op: The proxy in vite.config.ts handles the routing to the copilot-runtime service.
    // The frontend should just use the virtual endpoint URL.
    return () => {};
}

export const COPILOT_VIRTUAL_ENDPOINT = '/copilotkit-virtual';



