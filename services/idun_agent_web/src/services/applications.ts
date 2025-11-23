import type { ApplicationConfig, MarketplaceApp } from '../types/application.types';

const MOCK_APPS: ApplicationConfig[] = [
    {
        id: '1',
        name: 'My Langfuse',
        type: 'Langfuse',
        category: 'Observability',
        owner: 'admin',
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        config: {
            publicKey: 'pk-lf-123456',
            secretKey: 'sk-lf-123456',
            host: 'https://cloud.langfuse.com'
        },
        imageUrl: '/img/langfuse-logo.png'
    },
    {
        id: '2',
        name: 'Prod DB',
        type: 'PostgreSQL',
        category: 'Memory',
        owner: 'admin',
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        config: {
            connectionString: 'postgresql://user:pass@localhost:5432/db'
        },
        imageUrl: '/img/postgresql-logo.png'
    }
];

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
        by: 'PostgreSQL'
    },
    {
        id: 'sqlite',
        name: 'SQLite',
        type: 'SQLite',
        category: 'Memory',
        description: 'Small, fast, self-contained, high-reliability, full-featured, SQL database engine.',
        imageUrl: '/img/sqlite-logo.png',
        by: 'SQLite'
    },
    {
        id: 'mcp-server',
        name: 'MCP Server',
        type: 'MCPServer',
        category: 'MCP',
        description: 'Connect to an MCP Server.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Anthropic'
    },
    {
        id: 'model-armor',
        name: 'Model Armor',
        type: 'ModelArmor',
        category: 'Guardrails',
        description: 'Protect your AI models with Model Armor.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Model Armor'
    },
    {
        id: 'custom-llm',
        name: 'Custom LLM',
        type: 'CustomLLM',
        category: 'Guardrails',
        description: 'Define custom LLM guardrails.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'ban-list',
        name: 'Ban List',
        type: 'BanList',
        category: 'Guardrails',
        description: 'Prevents the model from generating or accepting specific forbidden words or phrases.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'bias-check',
        name: 'Bias Check',
        type: 'BiasCheck',
        category: 'Guardrails',
        description: 'Detects and mitigates content that promotes stereotypes or discrimination.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'competition-check',
        name: 'Competition Check',
        type: 'CompetitionCheck',
        category: 'Guardrails',
        description: 'Ensures the model does not mention specific competitor brand names.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'correct-language',
        name: 'Correct Language',
        type: 'CorrectLanguage',
        category: 'Guardrails',
        description: 'Verifies that the input or output is written in the expected language.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'detect-pii',
        name: 'Detect PII',
        type: 'DetectPII',
        category: 'Guardrails',
        description: 'Ensures that any given text does not contain PII.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'gibberish-text',
        name: 'Gibberish Text',
        type: 'GibberishText',
        category: 'Guardrails',
        description: 'Filters out nonsensical, incoherent, or repetitive output.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'nsfw-text',
        name: 'NSFW Text',
        type: 'NSFWText',
        category: 'Guardrails',
        description: 'Blocks content that is sexually explicit, violent, or unsafe.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'detect-jailbreak',
        name: 'Detect Jailbreak',
        type: 'DetectJailbreak',
        category: 'Guardrails',
        description: 'Identifies attempts to manipulate the model into bypassing safety guidelines.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'restrict-topic',
        name: 'Restrict Topic',
        type: 'RestrictTopic',
        category: 'Guardrails',
        description: 'Keeps the conversation strictly within a defined subject area.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'secrets',
        name: 'Secrets',
        type: 'Secrets',
        category: 'Guardrails',
        description: 'Detects exposed secrets such as API keys and passwords.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'valid-sql',
        name: 'Valid SQL',
        type: 'ValidSQL',
        category: 'Guardrails',
        description: 'Verifies that generated SQL code is syntactically correct and safe.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'valid-python',
        name: 'Valid Python',
        type: 'ValidPython',
        category: 'Guardrails',
        description: 'Ensures generated Python code is syntactically valid.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    },
    {
        id: 'web-sanitization',
        name: 'Web Sanitization',
        type: 'WebSanitization',
        category: 'Guardrails',
        description: 'Strips dangerous HTML tags to prevent XSS attacks.',
        imageUrl: '/img/agent-icon.svg',
        by: 'Idun'
    }
];

export const fetchApplications = async (): Promise<ApplicationConfig[]> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    const stored = localStorage.getItem('idun_applications');
    if (stored) {
        return JSON.parse(stored);
    }
    return MOCK_APPS;
};

export const createApplication = async (app: Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt' | 'owner'>): Promise<ApplicationConfig> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newApp: ApplicationConfig = {
        ...app,
        id: Math.random().toString(36).substr(2, 9),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owner: 'Current User' // Mock owner
    };
    
    const currentApps = await fetchApplications();
    const updatedApps = [...currentApps, newApp];
    localStorage.setItem('idun_applications', JSON.stringify(updatedApps));
    return newApp;
};

export const updateApplication = async (id: string, updates: Partial<ApplicationConfig>): Promise<ApplicationConfig> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const currentApps = await fetchApplications();
    const index = currentApps.findIndex(a => a.id === id);
    if (index === -1) throw new Error('App not found');
    
    const updatedApp = {
        ...currentApps[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };
    
    currentApps[index] = updatedApp;
    localStorage.setItem('idun_applications', JSON.stringify(currentApps));
    return updatedApp;
};

export const deleteApplication = async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const currentApps = await fetchApplications();
    const updatedApps = currentApps.filter(a => a.id !== id);
    localStorage.setItem('idun_applications', JSON.stringify(updatedApps));
};
