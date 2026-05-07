export type McpRead = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  mcpServer: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type McpCreate = {
  name: string;
  enabled?: boolean;
  mcpServer: Record<string, unknown>;
};

export type McpPatch = {
  name?: string;
  enabled?: boolean;
  mcpServer?: Record<string, unknown>;
};
