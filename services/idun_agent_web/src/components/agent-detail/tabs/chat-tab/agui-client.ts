import { HttpAgent } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput, Message, Tool, Context } from '@ag-ui/client';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, AgentError } from './types';
import type { AgentCapabilities } from '../../../../types/capabilities';
import { agentFetch } from '../../../../utils/agent-fetch';

export interface StreamOptions {
  agentUrl: string;
  endpoint: '/agent/copilotkit/stream' | '/agent/stream';
  threadId: string;
  runId?: string;
  messages: ChatMessage[];
  tools?: Tool[];
  context?: Context[];
  forwardedProps?: Record<string, unknown>;
  state?: Record<string, unknown>;
  onEvent: (event: BaseEvent) => void;
  onError: (error: AgentError) => void;
  onDone: () => void;
}

function chatMessagesToAgUI(messages: ChatMessage[]): Message[] {
  return messages.map(m => {
    const base = { id: m.id, role: m.role, content: m.content } as Message;
    return base;
  });
}

export function buildCurlCommand(options: Pick<StreamOptions, 'agentUrl' | 'endpoint' | 'threadId' | 'runId' | 'messages' | 'tools' | 'context' | 'forwardedProps' | 'state'> & { capabilities?: AgentCapabilities | null }): string {
  const { agentUrl, endpoint, threadId, runId, messages, tools = [], context = [], forwardedProps = {}, state = {}, capabilities } = options;

  // Use /agent/run when capabilities are available
  const url = capabilities ? `${agentUrl}/agent/run` : `${agentUrl}${endpoint}`;

  let body: Record<string, unknown>;
  if (capabilities || endpoint === '/agent/copilotkit/stream') {
    body = {
      threadId,
      runId: runId || uuidv4(),
      state,
      messages: chatMessagesToAgUI(messages),
      tools,
      context,
      forwardedProps,
    };
  } else {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    body = { session_id: threadId, query: lastUserMsg?.content ?? '' };
  }

  const jsonBody = JSON.stringify(body, null, 2);
  const escaped = jsonBody.replace(/'/g, "'\\''");
  return `curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${escaped}'`;
}

export async function streamAgent(options: StreamOptions): Promise<AbortController> {
  const {
    agentUrl, endpoint, threadId, runId, messages, tools = [], context = [],
    forwardedProps = {}, state = {}, onEvent, onError, onDone
  } = options;

  const controller = new AbortController();

  if (endpoint === '/agent/copilotkit/stream') {
    const agent = new HttpAgent({
      url: `${agentUrl}${endpoint}`,
      threadId,
    });

    const effectiveRunId = runId || uuidv4();
    const input: RunAgentInput = {
      threadId,
      runId: effectiveRunId,
      state,
      messages: chatMessagesToAgUI(messages),
      tools,
      context,
      forwardedProps,
    };

    const observable = agent.run(input);
    const subscription = observable.subscribe({
      next: (event: BaseEvent) => onEvent(event),
      error: (err: unknown) => {
        if ((err as Error).name !== 'AbortError') {
          const errObj = err instanceof Error ? err : new Error(String(err));
          onError({
            message: errObj.message,
            url: `${agentUrl}${endpoint}`,
            responseBody: errObj.stack,
            timestamp: Date.now(),
          });
        }
      },
      complete: () => onDone(),
    });

    controller.signal.addEventListener('abort', () => {
      agent.abortRun();
      subscription.unsubscribe();
    });
  } else {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const body = { session_id: threadId, query: lastUserMsg?.content ?? '' };

    try {
      const response = await agentFetch(`${agentUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        onError({
          message: `HTTP ${response.status} ${response.statusText}`,
          status: response.status,
          statusText: response.statusText,
          url: `${agentUrl}${endpoint}`,
          responseBody: text,
          timestamp: Date.now(),
        });
        return controller;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError({
          message: 'No response body returned from server',
          url: `${agentUrl}${endpoint}`,
          timestamp: Date.now(),
        });
        return controller;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const jsonStr = trimmed.slice(6);
              if (jsonStr === '[DONE]') continue;
              try {
                onEvent(JSON.parse(jsonStr) as BaseEvent);
              } catch {
                console.warn('Failed to parse SSE event:', jsonStr);
              }
            }
          }
          if (buffer.trim().startsWith('data: ')) {
            const jsonStr = buffer.trim().slice(6);
            if (jsonStr && jsonStr !== '[DONE]') {
              try { onEvent(JSON.parse(jsonStr) as BaseEvent); } catch { /* ignore */ }
            }
          }
          onDone();
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            const errObj = err instanceof Error ? err : new Error(String(err));
            onError({
              message: errObj.message,
              url: `${agentUrl}${endpoint}`,
              responseBody: errObj.stack,
              timestamp: Date.now(),
            });
          }
        }
      };
      processStream();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errObj = err instanceof Error ? err : new Error(String(err));
        onError({
          message: errObj.message,
          url: `${agentUrl}${endpoint}`,
          timestamp: Date.now(),
        });
      }
    }
  }

  return controller;
}

/**
 * Fetch agent capabilities from the discovery endpoint.
 */
export async function fetchCapabilities(agentUrl: string): Promise<AgentCapabilities | null> {
  try {
    const response = await agentFetch(`${agentUrl}/agent/capabilities`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Run agent via the canonical /agent/run endpoint using AG-UI protocol.
 */
export function runAgent(
  agentUrl: string,
  input: RunAgentInput,
  onEvent: (event: BaseEvent) => void,
  onError: (error: Error) => void,
  onDone: () => void,
): AbortController {
  const controller = new AbortController();

  const agent = new HttpAgent({
    url: `${agentUrl}/agent/run`,
  });

  const observable = agent.run(input);
  const subscription = observable.subscribe({
    next: (event: BaseEvent) => onEvent(event),
    error: (err: unknown) => {
      if ((err as Error).name !== 'AbortError') {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    complete: () => onDone(),
  });

  controller.signal.addEventListener('abort', () => {
    agent.abortRun();
    subscription.unsubscribe();
  });

  return controller;
}
