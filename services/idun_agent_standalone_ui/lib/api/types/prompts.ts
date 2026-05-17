export type PromptRead = {
  id: string;
  promptId: string;
  version: number;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type PromptCreate = {
  promptId: string;
  content: string;
  tags?: string[];
};

export type PromptPatch = {
  tags?: string[];
};
