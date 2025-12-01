import type { ApplicationConfig, MarketplaceApp, AppType } from '../types/application.types';
import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';
import type { components } from '../generated/agent-manager';

const mapConfigFromApi = (type: AppType, config: any): any => {
    if (type === 'Langfuse') {
        return {
            host: config.host,
            publicKey: config.public_key || config.publicKey,
            secretKey: config.secret_key || config.secretKey,
            runName: config.run_name || config.runName
        };
    }
    if (type === 'Phoenix') {
        return {
            host: config.collector_endpoint || config.collectorEndpoint,
            projectName: config.project_name || config.projectName
        };
    }
    if (type === 'GoogleCloudLogging' || type === 'GoogleCloudTrace') {
        const res: any = {
            gcpProjectId: config.project_id || config.gcpProjectId || config.projectId,
            region: config.region
        };
        if (type === 'GoogleCloudLogging') {
            res.logName = config.log_name || config.logName;
            res.resourceType = config.resource_type || config.resourceType;
            res.severity = config.severity;
            res.transport = config.transport;
        } else {
            res.traceName = config.trace_name || config.traceName;
            res.samplingRate = config.sampling_rate || config.samplingRate;
            res.flushInterval = config.flush_interval || config.flushInterval;
            res.ignoreUrls = config.ignore_urls || config.ignoreUrls;
        }
        return res;
    }
    if (type === 'LangSmith') {
        return {
            apiKey: config.api_key || config.apiKey,
            projectId: config.project_id || config.projectId,
            projectName: config.project_name || config.projectName,
            endpoint: config.endpoint,
            traceName: config.trace_name || config.traceName,
            tracingEnabled: String(config.tracing_enabled || config.tracingEnabled),
            captureInputsOutputs: String(config.capture_inputs_outputs || config.captureInputsOutputs)
        };
    }
    if (type === 'PostgreSQL' || type === 'SQLite') {
        return {
            connectionString: config.db_url || config.dbUrl
        };
    }
    return config;
};

export const mapConfigToApi = (type: AppType, config: any, name?: string): any => {
    if (type === 'Langfuse') {
        return {
            host: config.host,
            public_key: config.publicKey,
            secret_key: config.secretKey,
            run_name: config.runName || 'default'
        };
    }
    if (type === 'Phoenix') {
        return {
            collector_endpoint: config.host,
            project_name: config.projectName || 'default'
        };
    }
    if (type === 'GoogleCloudLogging') {
        return {
            project_id: config.gcpProjectId,
            region: config.region,
            log_name: config.logName || 'application-log',
            resource_type: config.resourceType || 'global',
            severity: config.severity || 'INFO',
            transport: config.transport || 'BackgroundThread'
        };
    }
    if (type === 'GoogleCloudTrace') {
        return {
            project_id: config.gcpProjectId,
            region: config.region,
            trace_name: config.traceName || 'default',
            sampling_rate: Number(config.samplingRate || 1.0),
            flush_interval: Number(config.flushInterval || 5),
            ignore_urls: config.ignoreUrls || ''
        };
    }
    if (type === 'LangSmith') {
        return {
            api_key: config.apiKey,
            project_id: config.projectId || 'default',
            project_name: config.projectName,
            endpoint: config.endpoint || 'https://api.smith.langchain.com',
            trace_name: config.traceName || 'default',
            tracing_enabled: config.tracingEnabled === 'true',
            capture_inputs_outputs: config.captureInputsOutputs === 'true'
        };
    }
    if (type === 'PostgreSQL') {
        return {
            type: 'postgres',
            db_url: config.connectionString
        };
    }
    if (type === 'SQLite') {
        return {
            type: 'sqlite',
            db_url: config.connectionString
        };
    }
    if (type === 'AdkInMemory') {
        return { type: 'in_memory' };
    }
    if (type === 'AdkVertexAi') {
        return {
            type: 'vertex_ai',
            project_id: config.project_id,
            location: config.location,
            reasoning_engine_app_name: config.reasoning_engine_app_name
        };
    }
    if (type === 'AdkDatabase') {
        return {
            type: 'database',
            db_url: config.connectionString
        };
    }
    if (type === 'MCPServer') {
        const transport = config.transport || 'streamable_http';
        const mcpConfig: any = {
            name: name || 'mcp-server',
            transport: transport
        };

        if (['sse', 'streamable_http', 'websocket'].includes(transport)) {
            mcpConfig.url = config.url;
            if (config.headers) {
                try {
                    mcpConfig.headers = JSON.parse(config.headers);
                } catch (e) {
                    console.error('Invalid JSON for headers', e);
                }
            }
            if (config.timeout_seconds) mcpConfig.timeout_seconds = Number(config.timeout_seconds);
            if (transport === 'streamable_http') {
                mcpConfig.terminate_on_close = config.terminate_on_close === 'true';
            }
            if (transport === 'sse') {
                if (config.sse_read_timeout_seconds) mcpConfig.sse_read_timeout_seconds = Number(config.sse_read_timeout_seconds);
            }
        } else if (transport === 'stdio') {
            mcpConfig.command = config.command;
            if (config.args) {
                try {
                    mcpConfig.args = JSON.parse(config.args);
                } catch (e) {
                    console.error('Invalid JSON for args', e);
                }
            }
            if (config.env) {
                try {
                    mcpConfig.env = JSON.parse(config.env);
                } catch (e) {
                    console.error('Invalid JSON for env', e);
                }
            }
            if (config.cwd) mcpConfig.cwd = config.cwd;
            if (config.encoding) mcpConfig.encoding = config.encoding;
            if (config.encoding_error_handler) mcpConfig.encoding_error_handler = config.encoding_error_handler;
        }
        return mcpConfig;
    }

    // Guardrails mapping
    if (type === 'ModelArmor') {
        return {
            config_id: 'model_armor',
            name: name || 'model-armor',
            project_id: config.projectId,
            location: config.location,
            template_id: config.templateId
        };
    }
    if (type === 'CustomLLM') {
        return {
            config_id: 'custom_llm',
            name: name || 'custom-llm',
            model: config.model,
            prompt: config.prompt
        };
    }
    if (type === 'BanList') {
        return {
            config_id: 'ban_list',
            banned_words: config.banned_words ? config.banned_words.split('\n').filter((s: string) => s.trim()) : []
        };
    }
    if (type === 'BiasCheck') {
        return {
            config_id: 'bias_check',
            threshold: Number(config.threshold)
        };
    }
    if (type === 'CompetitionCheck') {
        return {
            config_id: 'competition_check',
            competitors: config.competitors ? config.competitors.split('\n').filter((s: string) => s.trim()) : []
        };
    }
    if (type === 'CorrectLanguage') {
        return {
            config_id: 'correct_language',
            expected_languages: config.expected_languages ? config.expected_languages.split('\n').filter((s: string) => s.trim()) : []
        };
    }
    if (type === 'DetectPII') {
        return {
            config_id: 'detect_pii',
            pii_entities: config.pii_entities ? config.pii_entities.split(',').filter((s: string) => s.trim()) : []
        };
    }
    if (type === 'GibberishText') {
        return {
            config_id: 'gibberish_text',
            threshold: Number(config.threshold)
        };
    }
    if (type === 'NSFWText') {
        return {
            config_id: 'nsfw_text',
            threshold: Number(config.threshold)
        };
    }
    if (type === 'DetectJailbreak') {
        // Map sensitivity/check_type to threshold if possible, or just expect threshold from form if updated.
        // Or default threshold.
        // Assuming user form still has sensitivity. I'll map sensitivity to threshold.
        let threshold = 0.5;
        if (config.sensitivity === 'Low') threshold = 0.9;
        if (config.sensitivity === 'Medium') threshold = 0.5;
        if (config.sensitivity === 'High') threshold = 0.1;
        // Or if config.threshold exists use it
        if (config.threshold) threshold = Number(config.threshold);

        return {
            config_id: 'detect_jailbreak',
            threshold: threshold
        };
    }
    if (type === 'RestrictTopic') {
        return {
            config_id: 'restrict_to_topic',
            topics: config.valid_topics ? config.valid_topics.split('\n').filter((s: string) => s.trim()) : []
        };
    }
    if (type === 'PromptInjection') {
        return {
            config_id: 'prompt_injection',
            threshold: Number(config.threshold)
        };
    }
    if (type === 'RagHallucination') {
        return {
            config_id: 'rag_hallucination',
            threshold: Number(config.threshold)
        };
    }
    if (type === 'ToxicLanguage') {
        return {
            config_id: 'toxic_language',
            threshold: Number(config.threshold)
        };
    }
    if (type === 'CodeScanner') {
        return {
            config_id: 'code_scanner',
            allowed_languages: config.allowed_languages ? config.allowed_languages.split('\n').filter((s: string) => s.trim()) : []
        };
    }

    return config;
};

// Helper to map API Observability to ApplicationConfig
const mapObservabilityToApp = (obs: components["schemas"]["ManagedObservabilityRead"]): ApplicationConfig => {
    const provider = obs.observability.provider;
    let type: AppType = 'Langfuse';
    let imageUrl = '/img/agent-icon.svg';

    switch (provider) {
        case 'LANGFUSE':
            type = 'Langfuse';
            imageUrl = '/img/langfuse-logo.png';
            break;
        case 'PHOENIX':
            type = 'Phoenix';
            imageUrl = '/img/phoenix-logo.png';
            break;
        case 'GCP_LOGGING':
            type = 'GoogleCloudLogging';
            imageUrl = '/img/google-cloud-logo.png';
            break;
        case 'GCP_TRACE':
            type = 'GoogleCloudTrace';
            imageUrl = '/img/google-cloud-logo.png';
            break;
        case 'LANGSMITH':
            type = 'LangSmith';
            imageUrl = '/img/langsmith-logo.png';
            break;
    }

    return {
        id: obs.id,
        name: obs.name,
        type: type,
        category: 'Observability',
        owner: 'admin',
        createdAt: obs.created_at,
        updatedAt: obs.updated_at,
        config: mapConfigFromApi(type, obs.observability.config),
        imageUrl
    };
};

const mapMemoryToApp = (mem: components["schemas"]["ManagedMemoryRead"]): ApplicationConfig => {
    let type: AppType = 'SQLite'; // Default
    let imageUrl = '/img/sqlite-logo.png';
    const config: any = {};

    // mem.memory is a union type
    const memConfig = mem.memory as any;
    if ('type' in memConfig) {
        if (memConfig.type === 'postgres') {
            type = 'PostgreSQL';
            imageUrl = '/img/postgresql-logo.png';
            config.connectionString = memConfig.db_url;
        } else if (memConfig.type === 'sqlite') {
            type = 'SQLite';
            imageUrl = '/img/sqlite-logo.png';
            config.connectionString = memConfig.db_url;
        } else if (memConfig.type === 'in_memory') {
            type = 'AdkInMemory';
            imageUrl = '/img/agent-icon.svg';
        } else if (memConfig.type === 'vertex_ai') {
            type = 'AdkVertexAi';
            imageUrl = '/img/google-cloud-logo.png';
            config.project_id = memConfig.project_id;
            config.location = memConfig.location;
            config.reasoning_engine_app_name = memConfig.reasoning_engine_app_name;
        } else if (memConfig.type === 'database') {
            type = 'AdkDatabase';
            imageUrl = '/img/postgresql-logo.png';
            config.connectionString = memConfig.db_url;
        }
    }

    return {
        id: mem.id,
        name: mem.name,
        type: type,
        category: 'Memory',
        framework: (mem as any).agent_framework,
        owner: 'admin',
        createdAt: mem.created_at,
        updatedAt: mem.updated_at,
        config: config,
        imageUrl
    };
};

const mapMCPServerToApp = (mcp: components["schemas"]["ManagedMCPServerRead"]): ApplicationConfig => {
    const config: any = {
        transport: mcp.mcp_server.transport,
        url: mcp.mcp_server.url,
        command: mcp.mcp_server.command,
        cwd: mcp.mcp_server.cwd,
        encoding: mcp.mcp_server.encoding,
        encoding_error_handler: mcp.mcp_server.encoding_error_handler,
        timeout_seconds: mcp.mcp_server.timeout_seconds ? String(mcp.mcp_server.timeout_seconds) : undefined,
        sse_read_timeout_seconds: mcp.mcp_server.sse_read_timeout_seconds ? String(mcp.mcp_server.sse_read_timeout_seconds) : undefined,
        terminate_on_close: mcp.mcp_server.terminate_on_close ? String(mcp.mcp_server.terminate_on_close) : 'false',
    };

    if (mcp.mcp_server.headers) {
        config.headers = JSON.stringify(mcp.mcp_server.headers);
    }
    if (mcp.mcp_server.args) {
        config.args = JSON.stringify(mcp.mcp_server.args);
    }
    if (mcp.mcp_server.env) {
        config.env = JSON.stringify(mcp.mcp_server.env);
    }

    return {
        id: mcp.id,
        name: mcp.name,
        type: 'MCPServer',
        category: 'MCP',
        owner: 'admin',
        createdAt: mcp.created_at,
        updatedAt: mcp.updated_at,
        config,
        imageUrl: '/img/mcp.svg'
    };
};

const mapGuardrailToApp = (guard: components["schemas"]["ManagedGuardrailRead"]): ApplicationConfig => {
    let type: AppType = 'Guard';
    let config: any = {};

    // Find the first configured guardrail in input or output to determine type
    const findConfig = (list: any[] | undefined) => {
        if (!list || list.length === 0) return null;
        return list[0]; // Assuming one guardrail per "Application" config for now
    };

    const inputConfig = findConfig(guard.guardrail.input);
    const outputConfig = findConfig(guard.guardrail.output);
    let activeConfig = inputConfig || outputConfig;

    if (!activeConfig && 'config_id' in guard.guardrail) {
        activeConfig = guard.guardrail;
    }

    if (activeConfig) {
        if ('config_id' in activeConfig) {
            switch (activeConfig.config_id) {
                case 'model_armor':
                    type = 'ModelArmor';
                    config = {
                        projectId: (activeConfig as any).project_id,
                        location: (activeConfig as any).location,
                        templateId: (activeConfig as any).template_id
                    };
                    break;
                case 'custom_llm':
                    type = 'CustomLLM';
                    config = {
                        model: (activeConfig as any).model,
                        prompt: (activeConfig as any).prompt
                    };
                    break;
                case 'ban_list':
                    type = 'BanList';
                    config = { banned_words: ((activeConfig as any).banned_words || []).join('\n') };
                    break;
                case 'bias_check':
                    type = 'BiasCheck';
                    config = { threshold: (activeConfig as any).threshold };
                    break;
                case 'competition_check':
                    type = 'CompetitionCheck';
                    config = { competitors: ((activeConfig as any).competitors || []).join('\n') };
                    break;
                case 'correct_language':
                    type = 'CorrectLanguage';
                    config = { expected_languages: ((activeConfig as any).expected_languages || []).join('\n') };
                    break;
                case 'detect_pii':
                    type = 'DetectPII';
                    config = { pii_entities: ((activeConfig as any).pii_entities || []).join(',') };
                    break;
                case 'gibberish_text':
                    type = 'GibberishText';
                    config = { threshold: (activeConfig as any).threshold };
                    break;
                case 'nsfw_text':
                    type = 'NSFWText';
                    config = { threshold: (activeConfig as any).threshold };
                    break;
                case 'detect_jailbreak':
                    type = 'DetectJailbreak';
                    config = { threshold: (activeConfig as any).threshold };
                    break;
                case 'restrict_to_topic':
                    type = 'RestrictTopic';
                    config = { valid_topics: ((activeConfig as any).topics || []).join('\n') };
                    break;
                case 'prompt_injection':
                    type = 'PromptInjection';
                    config = { threshold: (activeConfig as any).threshold };
                    break;
                case 'rag_hallucination':
                    type = 'RagHallucination';
                    config = { threshold: (activeConfig as any).threshold };
                    break;
                case 'toxic_language':
                    type = 'ToxicLanguage';
                    config = { threshold: (activeConfig as any).threshold };
                    break;
                case 'code_scanner':
                     type = 'CodeScanner';
                     config = { allowed_languages: ((activeConfig as any).allowed_languages || []).join('\n') };
                     break;
            }
        }
    }

    return {
        id: guard.id,
        name: guard.name,
        type: type,
        category: 'Guardrails',
        owner: 'admin',
        createdAt: guard.created_at,
        updatedAt: guard.updated_at,
        config,
        imageUrl: '/img/guardrail.svg'
    };
};

export const mapTypeToProvider = (type: AppType): components["schemas"]["ObservabilityProvider"] => {
    switch (type) {
        case 'Langfuse': return 'LANGFUSE';
        case 'Phoenix': return 'PHOENIX';
        case 'GoogleCloudLogging': return 'GCP_LOGGING';
        case 'GoogleCloudTrace': return 'GCP_TRACE';
        case 'LangSmith': return 'LANGSMITH';
        default: throw new Error(`Unsupported observability type: ${type}`);
    }
};

const MOCK_APPS: ApplicationConfig[] = [];

export const MARKETPLACE_APPS: MarketplaceApp[] = [
    {
        id: 'langfuse',
        name: 'Langfuse',
        type: 'Langfuse',
        category: 'Observability',
        description: 'Open source LLM engineering platform.',
        imageUrl: '/img/langfuse-logo.png',
        by: 'Langfuse'
    },
    {
        id: 'phoenix',
        name: 'Phoenix',
        type: 'Phoenix',
        category: 'Observability',
        description: 'AI Observability & Evaluation.',
        imageUrl: '/img/phoenix-logo.png',
        by: 'Arize'
    },
    {
        id: 'google-cloud-logging',
        name: 'Google Cloud Logging',
        type: 'GoogleCloudLogging',
        category: 'Observability',
        description: 'Real-time log management and analysis.',
        imageUrl: '/img/google-cloud-logo.png',
        by: 'Google Cloud'
    },
    {
        id: 'google-cloud-trace',
        name: 'Google Cloud Trace',
        type: 'GoogleCloudTrace',
        category: 'Observability',
        description: 'Distributed tracing system for Google Cloud.',
        imageUrl: '/img/google-cloud-logo.png',
        by: 'Google Cloud'
    },
    {
        id: 'langsmith',
        name: 'LangSmith',
        type: 'LangSmith',
        category: 'Observability',
        description: 'Platform for building production-grade LLM applications.',
        imageUrl: '/img/langsmith-logo.png',
        by: 'LangChain'
    },
    {
        id: 'postgresql',
        name: 'PostgreSQL',
        type: 'PostgreSQL',
        category: 'Memory',
        description: 'The World\'s Most Advanced Open Source Relational Database.',
        imageUrl: '/img/postgresql-logo.png',
        by: 'PostgreSQL',
        framework: 'LANGGRAPH'
    },
    {
        id: 'sqlite',
        name: 'SQLite',
        type: 'SQLite',
        category: 'Memory',
        description: 'Small, fast, self-contained, high-reliability, full-featured, SQL database engine.',
        imageUrl: '/img/sqlite-logo.png',
        by: 'SQLite',
        framework: 'LANGGRAPH'
    },
    {
        id: 'adk-in-memory',
        name: 'In Memory',
        type: 'AdkInMemory',
        category: 'Memory',
        description: 'Ephemeral in-memory storage for ADK.',
        imageUrl: '/img/agent-icon.svg',
        by: 'ADK',
        framework: 'ADK'
    },
    {
        id: 'adk-vertex-ai',
        name: 'Vertex AI',
        type: 'AdkVertexAi',
        category: 'Memory',
        description: 'Vertex AI Memory Service for ADK.',
        imageUrl: '/img/google-cloud-logo.png',
        by: 'Google Cloud',
        framework: 'ADK'
    },
    {
        id: 'adk-database',
        name: 'Database',
        type: 'AdkDatabase',
        category: 'Memory',
        description: 'Database Session Service for ADK.',
        imageUrl: '/img/postgresql-logo.png',
        by: 'ADK',
        framework: 'ADK'
    },
    {
        id: 'mcp-server',
        name: 'MCP Server',
        type: 'MCPServer',
        category: 'MCP',
        description: 'Connect to an MCP Server.',
        imageUrl: '/img/mcp.svg',
        by: 'Anthropic'
    },
    {
        id: 'model-armor',
        name: 'Model Armor',
        type: 'ModelArmor',
        category: 'Guardrails',
        description: 'Protect your AI models with Model Armor.',
        imageUrl: '/img/guardrail.svg',
        by: 'Model Armor'
    },
    {
        id: 'custom-llm',
        name: 'Custom LLM',
        type: 'CustomLLM',
        category: 'Guardrails',
        description: 'Define custom LLM guardrails.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'ban-list',
        name: 'Ban List',
        type: 'BanList',
        category: 'Guardrails',
        description: 'Prevents the model from generating or accepting specific forbidden words or phrases.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'bias-check',
        name: 'Bias Check',
        type: 'BiasCheck',
        category: 'Guardrails',
        description: 'Detects and mitigates content that promotes stereotypes or discrimination.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'competition-check',
        name: 'Competition Check',
        type: 'CompetitionCheck',
        category: 'Guardrails',
        description: 'Ensures the model does not mention specific competitor brand names.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'correct-language',
        name: 'Correct Language',
        type: 'CorrectLanguage',
        category: 'Guardrails',
        description: 'Verifies that the input or output is written in the expected language.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'detect-pii',
        name: 'Detect PII',
        type: 'DetectPII',
        category: 'Guardrails',
        description: 'Ensures that any given text does not contain PII.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'gibberish-text',
        name: 'Gibberish Text',
        type: 'GibberishText',
        category: 'Guardrails',
        description: 'Filters out nonsensical, incoherent, or repetitive output.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'nsfw-text',
        name: 'NSFW Text',
        type: 'NSFWText',
        category: 'Guardrails',
        description: 'Blocks content that is sexually explicit, violent, or unsafe.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'detect-jailbreak',
        name: 'Detect Jailbreak',
        type: 'DetectJailbreak',
        category: 'Guardrails',
        description: 'Identifies attempts to manipulate the model into bypassing safety guidelines.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'restrict-topic',
        name: 'Restrict Topic',
        type: 'RestrictTopic',
        category: 'Guardrails',
        description: 'Keeps the conversation strictly within a defined subject area.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'prompt-injection',
        name: 'Prompt Injection',
        type: 'PromptInjection',
        category: 'Guardrails',
        description: 'Detects prompt injection attempts.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'rag-hallucination',
        name: 'RAG Hallucination',
        type: 'RagHallucination',
        category: 'Guardrails',
        description: 'Detects hallucinations in RAG outputs.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'toxic-language',
        name: 'Toxic Language',
        type: 'ToxicLanguage',
        category: 'Guardrails',
        description: 'Detects toxic language.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    },
    {
        id: 'code-scanner',
        name: 'Code Scanner',
        type: 'CodeScanner',
        category: 'Guardrails',
        description: 'Scan code for allowed languages.',
        imageUrl: '/img/guardrail.svg',
        by: 'Idun'
    }
];

const getFrameworkForType = (type: AppType): string => {
    const app = MARKETPLACE_APPS.find(a => a.type === type);
    return app?.framework || 'LANGGRAPH';
};

export const fetchApplications = async (): Promise<ApplicationConfig[]> => {
    let observabilityApps: ApplicationConfig[] = [];
    try {
        const apiApps = await getJson<components["schemas"]["ManagedObservabilityRead"][]>('/api/v1/observability/');
        observabilityApps = apiApps.map(mapObservabilityToApp);
    } catch (e) {
        console.error("Failed to fetch observability apps", e);
    }

    let memoryApps: ApplicationConfig[] = [];
    try {
        const apiApps = await getJson<components["schemas"]["ManagedMemoryRead"][]>('/api/v1/memory/');
        memoryApps = apiApps.map(mapMemoryToApp);
    } catch (e) {
        console.error("Failed to fetch memory apps", e);
    }

    let mcpApps: ApplicationConfig[] = [];
    try {
        const apiApps = await getJson<components["schemas"]["ManagedMCPServerRead"][]>('/api/v1/mcp-servers/');
        mcpApps = apiApps.map(mapMCPServerToApp);
    } catch (e) {
        console.error("Failed to fetch MCP apps", e);
    }

    let guardrailApps: ApplicationConfig[] = [];
    try {
        const apiApps = await getJson<components["schemas"]["ManagedGuardrailRead"][]>('/api/v1/guardrails/');
        guardrailApps = apiApps.map(mapGuardrailToApp);
    } catch (e) {
        console.error("Failed to fetch guardrail apps", e);
    }

    return [...observabilityApps, ...memoryApps, ...mcpApps, ...guardrailApps];
};

export const createApplication = async (app: Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt' | 'owner'>): Promise<ApplicationConfig> => {
    if (app.category === 'Observability') {
        const payload: components["schemas"]["ManagedObservabilityCreate"] = {
            name: app.name,
            observability: {
                provider: mapTypeToProvider(app.type),
                enabled: true,
                config: mapConfigToApi(app.type, app.config)
            }
        };
        const res = await postJson<components["schemas"]["ManagedObservabilityRead"]>('/api/v1/observability/', payload);
        return mapObservabilityToApp(res);
    }

    if (app.category === 'Memory') {
        const payload: components["schemas"]["ManagedMemoryCreate"] = {
            name: app.name,
            agent_framework: getFrameworkForType(app.type) as any,
            memory: mapConfigToApi(app.type, app.config)
        };
        const res = await postJson<components["schemas"]["ManagedMemoryRead"]>('/api/v1/memory/', payload);
        return mapMemoryToApp(res);
    }

    if (app.category === 'MCP') {
        const payload: components["schemas"]["ManagedMCPServerCreate"] = {
            name: app.name,
            mcp_server: mapConfigToApi(app.type, app.config, app.name)
        };
        const res = await postJson<components["schemas"]["ManagedMCPServerRead"]>('/api/v1/mcp-servers/', payload);
        return mapMCPServerToApp(res);
    }

    if (app.category === 'Guardrails') {
        const supportedTypes = ['ModelArmor', 'CustomLLM', 'BanList', 'BiasCheck',
            'CompetitionCheck', 'CorrectLanguage', 'DetectPII',
            'GibberishText', 'NSFWText', 'DetectJailbreak', 'RestrictTopic',
            'PromptInjection', 'RagHallucination', 'ToxicLanguage', 'CodeScanner'];

        if (supportedTypes.includes(app.type)) {
            const configPayload = mapConfigToApi(app.type, app.config, app.name);
            const payload: components["schemas"]["ManagedGuardrailCreate"] = {
                name: app.name,
                guardrail: configPayload as any
            };
            const res = await postJson<components["schemas"]["ManagedGuardrailRead"]>('/api/v1/guardrails/', payload);
            return mapGuardrailToApp(res);
        }
    }

    throw new Error(`Application type ${app.type} is not supported by API yet.`);
};

export const updateApplication = async (id: string, updates: Partial<ApplicationConfig>): Promise<ApplicationConfig> => {
    if (updates.category === 'Observability') {
        try {
            const apiApp = await getJson<components["schemas"]["ManagedObservabilityRead"]>(`/api/v1/observability/${id}`);
            const type = updates.type || mapObservabilityToApp(apiApp).type;
            const payload: components["schemas"]["ManagedObservabilityPatch"] = {
                name: updates.name || apiApp.name,
                observability: {
                    provider: mapTypeToProvider(type),
                    enabled: true,
                    config: mapConfigToApi(type, updates.config || mapConfigFromApi(type, apiApp.observability.config))
                }
            };
            const res = await patchJson<components["schemas"]["ManagedObservabilityRead"]>(`/api/v1/observability/${id}`, payload);
            return mapObservabilityToApp(res);
        } catch (e) {
            console.warn(`Failed to update Observability app ${id} via API.`, e);
            throw e;
        }
    } else if (updates.category === 'Memory') {
        try {
            const apiMem = await getJson<components["schemas"]["ManagedMemoryRead"]>(`/api/v1/memory/${id}`);
            const type = updates.type || mapMemoryToApp(apiMem).type;
            const payload: components["schemas"]["ManagedMemoryPatch"] = {
                name: updates.name || apiMem.name,
                agent_framework: getFrameworkForType(type) as any,
                memory: mapConfigToApi(type, updates.config || mapMemoryToApp(apiMem).config)
            };
            const res = await patchJson<components["schemas"]["ManagedMemoryRead"]>(`/api/v1/memory/${id}`, payload);
            return mapMemoryToApp(res);
        } catch (e) {
            console.warn(`Failed to update Memory app ${id} via API.`, e);
            throw e;
        }
    } else if (updates.category === 'MCP') {
        try {
            const apiMcp = await getJson<components["schemas"]["ManagedMCPServerRead"]>(`/api/v1/mcp-servers/${id}`);
            const type = 'MCPServer';
            const payload: components["schemas"]["ManagedMCPServerPatch"] = {
                name: updates.name || apiMcp.name,
                mcp_server: mapConfigToApi(type, updates.config || mapMCPServerToApp(apiMcp).config, updates.name || apiMcp.name)
            };
            const res = await patchJson<components["schemas"]["ManagedMCPServerRead"]>(`/api/v1/mcp-servers/${id}`, payload);
            return mapMCPServerToApp(res);
        } catch (e) {
            console.warn(`Failed to update MCP app ${id} via API.`, e);
            throw e;
        }
    } else if (updates.category === 'Guardrails') {
        try {
            const apiGuard = await getJson<components["schemas"]["ManagedGuardrailRead"]>(`/api/v1/guardrails/${id}`);
            const currentApp = mapGuardrailToApp(apiGuard);
            const type = updates.type || currentApp.type;
            const supportedTypes = ['ModelArmor', 'CustomLLM', 'BanList', 'BiasCheck',
                'CompetitionCheck', 'CorrectLanguage', 'DetectPII',
                'GibberishText', 'NSFWText', 'DetectJailbreak', 'RestrictTopic',
                'PromptInjection', 'RagHallucination', 'ToxicLanguage', 'CodeScanner'];

            if (supportedTypes.includes(type)) {
                const configPayload = mapConfigToApi(type, updates.config || currentApp.config, updates.name || apiGuard.name);
                const payload: components["schemas"]["ManagedGuardrailPatch"] = {
                    name: updates.name || apiGuard.name,
                    guardrail: configPayload as any
                };
                const res = await patchJson<components["schemas"]["ManagedGuardrailRead"]>(`/api/v1/guardrails/${id}`, payload);
                return mapGuardrailToApp(res);
            }
        } catch (e) {
            console.warn(`Failed to update Guardrail app ${id} via API.`, e);
            throw e;
        }
    }

    // Fallback logic if category not provided, trying sequentially
    try {
        const apiApp = await getJson<components["schemas"]["ManagedObservabilityRead"]>(`/api/v1/observability/${id}`);
        if (apiApp) {
             const type = updates.type || mapObservabilityToApp(apiApp).type;
             const payload: components["schemas"]["ManagedObservabilityPatch"] = {
                name: updates.name || apiApp.name,
                observability: {
                    provider: mapTypeToProvider(type),
                    enabled: true,
                    config: mapConfigToApi(type, updates.config || mapConfigFromApi(type, apiApp.observability.config))
                }
            };
            const res = await patchJson<components["schemas"]["ManagedObservabilityRead"]>(`/api/v1/observability/${id}`, payload);
            return mapObservabilityToApp(res);
        }
    } catch (e) { /* ignore, try next */ }

    try {
        const apiMem = await getJson<components["schemas"]["ManagedMemoryRead"]>(`/api/v1/memory/${id}`);
        if (apiMem) {
            const type = updates.type || mapMemoryToApp(apiMem).type;
            const payload: components["schemas"]["ManagedMemoryPatch"] = {
                name: updates.name || apiMem.name,
                agent_framework: getFrameworkForType(type) as any,
                memory: mapConfigToApi(type, updates.config || mapMemoryToApp(apiMem).config)
            };
            const res = await patchJson<components["schemas"]["ManagedMemoryRead"]>(`/api/v1/memory/${id}`, payload);
            return mapMemoryToApp(res);
        }
    } catch (e) { /* ignore, try next */ }

    try {
        const apiMcp = await getJson<components["schemas"]["ManagedMCPServerRead"]>(`/api/v1/mcp-servers/${id}`);
        if (apiMcp) {
            const type = 'MCPServer';
            const payload: components["schemas"]["ManagedMCPServerPatch"] = {
                name: updates.name || apiMcp.name,
                mcp_server: mapConfigToApi(type, updates.config || mapMCPServerToApp(apiMcp).config, updates.name || apiMcp.name)
            };
            const res = await patchJson<components["schemas"]["ManagedMCPServerRead"]>(`/api/v1/mcp-servers/${id}`, payload);
            return mapMCPServerToApp(res);
        }
    } catch (e) { /* ignore, try next */ }

    try {
        const apiGuard = await getJson<components["schemas"]["ManagedGuardrailRead"]>(`/api/v1/guardrails/${id}`);
        if (apiGuard) {
            const currentApp = mapGuardrailToApp(apiGuard);
            const type = updates.type || currentApp.type;
            const supportedTypes = ['ModelArmor', 'CustomLLM', 'BanList', 'BiasCheck',
                'CompetitionCheck', 'CorrectLanguage', 'DetectPII',
                'GibberishText', 'NSFWText', 'DetectJailbreak', 'RestrictTopic',
                'PromptInjection', 'RagHallucination', 'ToxicLanguage', 'CodeScanner'];

            if (supportedTypes.includes(type)) {
                const configPayload = mapConfigToApi(type, updates.config || currentApp.config, updates.name || apiGuard.name);
                const payload: components["schemas"]["ManagedGuardrailPatch"] = {
                    name: updates.name || apiGuard.name,
                    guardrail: configPayload as any
                };
                const res = await patchJson<components["schemas"]["ManagedGuardrailRead"]>(`/api/v1/guardrails/${id}`, payload);
                return mapGuardrailToApp(res);
            }
        }
    } catch (e) { /* ignore, try next */ }

    throw new Error('App not found or update failed');
};

export const deleteApplication = async (id: string): Promise<void> => {
    try { await deleteRequest(`/api/v1/observability/${id}`); return; } catch (e) { /* ignore */ }
    try { await deleteRequest(`/api/v1/memory/${id}`); return; } catch (e) { /* ignore */ }
    try { await deleteRequest(`/api/v1/mcp-servers/${id}`); return; } catch (e) { /* ignore */ }
    try { await deleteRequest(`/api/v1/guardrails/${id}`); return; } catch (e) { /* ignore */ }

    // If we reached here, it means we couldn't delete from any API
    // throw new Error('Failed to delete application from any source');
};
