// Types pour les agents basés sur les données de la base de données

export type AgentStatus =
    | 'deployed'
    | 'pending_deployment'
    | 'failed'
    | 'error'
    | 'disabled';

export type FrameworkType = 'ADK' | 'N8N' | 'LANGGRAPH' | 'SMOLAGENT';

export type SourceType = 'local' | 'Git' | 'remote';

export type SchemaType =
    | 'csv'
    | 'json'
    | 'boolean'
    | 'text'
    | 'pdf'
    | 'url_list';

export type ObservabilityType = 'LANGFUSE' | 'ARIZE_PHOENIX';

export type CheckpointType = 'SQLITE';

export interface AgentSource {
    type: SourceType;
    path: string;
}

export interface AgentConfig {
    a2a: boolean;
    streaming: boolean;
    input: {
        schema: SchemaType;
    };
    output: {
        schema: SchemaType;
    };
    param1: string;
    param2: string;
}

export interface LangGraphCheckpoints {
    type: CheckpointType;
    db_path: string;
}

export interface LangGraphConfig {
    checkpoints: LangGraphCheckpoints;
}

export interface AgentObservability {
    type: ObservabilityType;
    param1: string;
    param2: string;
}

export interface Agent {
    id: string;
    status: AgentStatus;
    name: string;
    description: string;
    framework_type: FrameworkType;
    source: AgentSource;
    config: AgentConfig;
    langgraph_config: LangGraphConfig | null;
    obervability: AgentObservability;
    tools: string[];
    sso_config_id?: string;
}

// Type pour les colonnes du tableau
export interface TableColumn {
    id: string;
    label: string;
    width: number;
    sortable: boolean;
    alignment?: 'left' | 'center' | 'right'; // Alignement des colonnes et données
}

// Type générique pour les props du data board
export interface DataBoardProps<T = any> {
    columns: TableColumn[];
    data: T[];
    itemsPerPage?: number;
    showPagination?: boolean;
    children: (props: {
        paginatedData: T[];
        startIndex: number;
        endIndex: number;
    }) => React.ReactNode;
}
