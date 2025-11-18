/**
 * Simple YAML parser for extracting agent framework configuration
 * Note: This is a basic parser for our specific use case
 */

export interface ObservabilityConfig {
    provider?: string;
    enabled?: boolean;
    options?: {
        host?: string;
        public_key?: string;
        secret_key?: string;
        run_name?: string;
        [key: string]: unknown;
    };
}

export interface AgentConfigYaml {
    agent?: {
        type?: string;
        config?: {
            name?: string;
            graph_definition?: string;
            observability?: ObservabilityConfig;
            checkpointer?: {
                type?: string;
                db_url?: string;
            };
            [key: string]: unknown;
        };
    };
    server?: {
        api?: {
            port?: number;
        };
    };
}

/**
 * Parse YAML content and extract agent configuration
 * This is a more comprehensive parser that handles nested structures
 */
export function parseYamlConfig(yamlContent: string): AgentConfigYaml | null {
    try {
        const lines = yamlContent.split('\n');
        const config: AgentConfigYaml = {};
        
        // Track the path through nested structures
        const path: string[] = [];
        const indentStack: number[] = [];
        
        for (const line of lines) {
            if (!line.trim() || line.trim().startsWith('#')) continue;
            
            const trimmed = line.trim();
            const indent = line.search(/\S/);
            
            // Pop from stack if we've decreased indentation
            while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
                indentStack.pop();
                path.pop();
            }
            
            // Check if it's a key without value (section header)
            if (trimmed.endsWith(':') && !trimmed.includes(': ')) {
                const key = trimmed.slice(0, -1);
                path.push(key);
                indentStack.push(indent);
                
                // Initialize structures
                if (path.length === 1 && key === 'agent') {
                    config.agent = {};
                } else if (path.length === 1 && key === 'server') {
                    config.server = {};
                } else if (path.join('.') === 'agent.config') {
                    config.agent!.config = {};
                } else if (path.join('.') === 'server.api') {
                    config.server!.api = {};
                } else if (path.join('.') === 'agent.config.observability') {
                    config.agent!.config!.observability = {};
                } else if (path.join('.') === 'agent.config.observability.options') {
                    config.agent!.config!.observability!.options = {};
                } else if (path.join('.') === 'agent.config.checkpointer') {
                    config.agent!.config!.checkpointer = {};
                }
                continue;
            }
            
            // Parse key-value pairs
            const match = trimmed.match(/^(\w+):\s*(.*)$/);
            if (match) {
                const [, key, value] = match;
                const cleanValue = value.replace(/^["']|["']$/g, '').trim();
                
                const currentPath = path.join('.');
                
                if (currentPath === 'agent' && key === 'type') {
                    config.agent!.type = cleanValue;
                } else if (currentPath === 'agent.config' && key === 'name') {
                    config.agent!.config!.name = cleanValue;
                } else if (currentPath === 'agent.config' && key === 'graph_definition') {
                    config.agent!.config!.graph_definition = cleanValue;
                } else if (currentPath === 'agent.config.observability' && key === 'provider') {
                    config.agent!.config!.observability!.provider = cleanValue;
                } else if (currentPath === 'agent.config.observability' && key === 'enabled') {
                    config.agent!.config!.observability!.enabled = cleanValue === 'true';
                } else if (currentPath === 'agent.config.observability.options') {
                    config.agent!.config!.observability!.options![key] = cleanValue;
                } else if (currentPath === 'agent.config.checkpointer' && key === 'type') {
                    config.agent!.config!.checkpointer!.type = cleanValue;
                } else if (currentPath === 'agent.config.checkpointer' && key === 'db_url') {
                    config.agent!.config!.checkpointer!.db_url = cleanValue;
                } else if (currentPath === 'server.api' && key === 'port') {
                    config.server!.api!.port = parseInt(cleanValue, 10);
                }
            }
        }

        console.log('Parsed YAML config:', config);
        return config;
    } catch (error) {
        console.error('Error parsing YAML:', error);
        return null;
    }
}

/**
 * Extract framework type from YAML config
 */
export function extractFrameworkFromYaml(yamlContent: string): string | null {
    const config = parseYamlConfig(yamlContent);
    return config?.agent?.type || null;
}

/**
 * Extract observability config from YAML
 */
export function extractObservabilityFromYaml(yamlContent: string): ObservabilityConfig | null {
    const config = parseYamlConfig(yamlContent);
    return config?.agent?.config?.observability || null;
}

/**
 * Extract database URL from checkpointer config
 */
export function extractDatabaseFromYaml(yamlContent: string): string | null {
    const config = parseYamlConfig(yamlContent);
    return config?.agent?.config?.checkpointer?.db_url || null;
}

/**
 * Normalize framework name to match OpenAPI schema enum values
 */
export function normalizeFrameworkName(framework: string): string {
    return framework.toUpperCase();
}

/**
 * Get supported frameworks from OpenAPI AgentFramework enum
 */
export const SUPPORTED_FRAMEWORKS = [
    'LANGGRAPH',
    'ADK',
    'CREWAI',
    'HAYSTACK',
    'CUSTOM'
] as const;

export type SupportedFramework = typeof SUPPORTED_FRAMEWORKS[number];

/**
 * Check if a framework is supported
 */
export function isFrameworkSupported(framework: string): boolean {
    const normalized = normalizeFrameworkName(framework);
    return SUPPORTED_FRAMEWORKS.includes(normalized as SupportedFramework);
}

