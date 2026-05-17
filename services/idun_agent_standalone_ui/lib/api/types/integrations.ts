export type IntegrationRead = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  integration: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationCreate = {
  name: string;
  enabled?: boolean;
  integration: Record<string, unknown>;
};

export type IntegrationPatch = {
  name?: string;
  enabled?: boolean;
  integration?: Record<string, unknown>;
};
