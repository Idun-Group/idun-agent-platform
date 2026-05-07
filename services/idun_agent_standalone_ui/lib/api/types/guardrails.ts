export type GuardrailPosition = "input" | "output";

export type GuardrailRead = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  position: GuardrailPosition;
  sortOrder: number;
  guardrail: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GuardrailCreate = {
  name: string;
  enabled?: boolean;
  position: GuardrailPosition;
  sortOrder?: number;
  guardrail: Record<string, unknown>;
};

export type GuardrailPatch = {
  name?: string;
  enabled?: boolean;
  position?: GuardrailPosition;
  sortOrder?: number;
  guardrail?: Record<string, unknown>;
};
