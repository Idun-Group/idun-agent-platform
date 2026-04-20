import type { ApplicationConfig } from '../types/application.types';
import { createApplication } from '../services/applications';

function normalizeMcpUrl(baseUrl: string): string {
    const stripped = baseUrl.trim().replace(/\/$/, '');
    return `${stripped}/mcp/`;
}

function findMatchingMcp(
    baseUrl: string,
    mcpApps: ApplicationConfig[],
): ApplicationConfig | undefined {
    if (!baseUrl) return undefined;
    const target = normalizeMcpUrl(baseUrl);
    return mcpApps.find(app => {
        const url = (app.config as Record<string, string> | undefined)?.url;
        return url && url.replace(/\/?$/, '/') === target;
    });
}

/**
 * Ensure a managed MCP server resource exists for the agent's /mcp endpoint.
 * No-op if a matching MCP resource already exists.
 */
export async function ensureAgentMcpServer(
    agentName: string,
    baseUrl: string,
    mcpApps: ApplicationConfig[],
): Promise<ApplicationConfig | null> {
    if (!baseUrl.trim()) return null;
    if (findMatchingMcp(baseUrl, mcpApps)) return null;

    const name = `${agentName} (agent)`;
    return createApplication({
        name,
        type: 'MCPServer',
        category: 'MCP',
        config: {
            transport: 'streamable_http',
            url: normalizeMcpUrl(baseUrl),
        },
    });
}
