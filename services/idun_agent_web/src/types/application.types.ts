
export type AppCategory = 'Observability' | 'Memory' | 'MCP' | 'Guardrails';

export type AppType = 'Langfuse' | 'Phoenix' | 'PostgreSQL' | 'SQLite' | 'GoogleCloudLogging' | 'GoogleCloudTrace' | 'LangSmith' | 'MCPServer' | 'Guard' | 'ModelArmor' | 'CustomLLM' | 'BanList' | 'BiasCheck' | 'CompetitionCheck' | 'CorrectLanguage' | 'DetectPII' | 'GibberishText' | 'NSFWText' | 'DetectJailbreak' | 'RestrictTopic' | 'PromptInjection' | 'RagHallucination' | 'ToxicLanguage' | 'CodeScanner';

export interface MarketplaceApp {
    id: string;
    name: string;
    type: AppType;
    category: AppCategory;
    description: string;
    imageUrl: string;
    by: string;
}

export interface ApplicationConfig {
    id: string;
    name: string;
    type: AppType;
    category: AppCategory;
    owner: string;
    createdAt: string;
    updatedAt: string;
    config: Record<string, any>; // For storing keys, urls, etc.
    imageUrl?: string;
}
