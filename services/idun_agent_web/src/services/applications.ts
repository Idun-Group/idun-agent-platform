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

