import type { BaseEvent } from '@ag-ui/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: number;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  status: 'streaming' | 'pending' | 'complete' | 'error';
}

export interface StreamEvent {
  id: number;
  timestamp: number;
  data: BaseEvent;
}

export interface AgentError {
  message: string;
  code?: string;
  status?: number;
  statusText?: string;
  url?: string;
  responseBody?: string;
  timestamp: number;
}
