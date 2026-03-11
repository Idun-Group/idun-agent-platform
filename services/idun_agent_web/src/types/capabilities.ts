export interface CapabilityFlags {
  streaming: boolean;
  history: boolean;
  threadId: boolean;
}

export interface InputDescriptor {
  mode: 'chat' | 'structured';
  schema: Record<string, unknown> | null;
}

export interface OutputDescriptor {
  mode: 'text' | 'structured' | 'unknown';
  schema: Record<string, unknown> | null;
}

export interface AgentCapabilities {
  version: string;
  framework: string;
  capabilities: CapabilityFlags;
  input: InputDescriptor;
  output: OutputDescriptor;
}
