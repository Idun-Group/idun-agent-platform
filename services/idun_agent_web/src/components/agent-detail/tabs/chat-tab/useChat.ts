import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { EventType } from '@ag-ui/client';
import type {
  BaseEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  RunErrorEvent,
  Tool,
  Context,
} from '@ag-ui/client';
import type { ChatMessage, StreamEvent, ToolCallInfo, AgentError } from './types';
import { streamAgent } from './agui-client';

export interface UseChatOptions {
  agentUrl: string;
  endpoint: '/agent/copilotkit/stream' | '/agent/stream';
  threadId: string;
  state: Record<string, unknown>;
  tools: Tool[];
  context: Context[];
  forwardedProps: Record<string, unknown>;
  extraMessages: ChatMessage[];
}

export function useChat({ agentUrl, endpoint, threadId, state, tools, context, forwardedProps, extraMessages }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<AgentError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const eventCounter = useRef(0);
  const currentMsgRef = useRef<{ id: string; content: string } | null>(null);
  const toolCallsRef = useRef<Map<string, ToolCallInfo>>(new Map());

  const addEvent = useCallback((data: BaseEvent) => {
    setEvents(prev => [...prev, {
      id: eventCounter.current++,
      timestamp: Date.now(),
      data,
    }]);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    setError(null);
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    currentMsgRef.current = null;
    toolCallsRef.current = new Map();

    const allMessages = [...extraMessages, userMsg];
    const effectiveRunId = uuidv4();

    const controller = await streamAgent({
      agentUrl,
      endpoint,
      threadId,
      runId: effectiveRunId,
      messages: allMessages,
      state,
      tools,
      context,
      forwardedProps,
      onEvent: (event: BaseEvent) => {
        addEvent(event);

        switch (event.type) {
          case EventType.TEXT_MESSAGE_START: {
            const e = event as TextMessageStartEvent;
            currentMsgRef.current = { id: e.messageId, content: '' };
            setMessages(prev => [...prev, {
              id: e.messageId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
            }]);
            break;
          }
          case EventType.TEXT_MESSAGE_CONTENT: {
            const e = event as TextMessageContentEvent;
            if (currentMsgRef.current) {
              currentMsgRef.current.content += e.delta;
              const updated = currentMsgRef.current.content;
              const msgId = currentMsgRef.current.id;
              setMessages(prev =>
                prev.map(m => m.id === msgId ? { ...m, content: updated } : m)
              );
            }
            break;
          }
          case EventType.TOOL_CALL_START: {
            const e = event as ToolCallStartEvent;
            const tc: ToolCallInfo = {
              id: e.toolCallId,
              name: e.toolCallName,
              arguments: '',
              status: 'streaming',
            };
            toolCallsRef.current.set(e.toolCallId, tc);
            const targetId = e.parentMessageId || currentMsgRef.current?.id;
            if (targetId) {
              setMessages(prev =>
                prev.map(m => m.id === targetId
                  ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
                  : m
                )
              );
            }
            break;
          }
          case EventType.TOOL_CALL_ARGS: {
            const e = event as ToolCallArgsEvent;
            const tc = toolCallsRef.current.get(e.toolCallId);
            if (tc) {
              tc.arguments += e.delta;
              setMessages(prev =>
                prev.map(m => ({
                  ...m,
                  toolCalls: m.toolCalls?.map(t =>
                    t.id === e.toolCallId ? { ...t, arguments: tc.arguments } : t
                  ),
                }))
              );
            }
            break;
          }
          case EventType.TOOL_CALL_END: {
            const e = event as ToolCallEndEvent;
            const tc = toolCallsRef.current.get(e.toolCallId);
            if (tc) {
              tc.status = 'pending';
              setMessages(prev =>
                prev.map(m => ({
                  ...m,
                  toolCalls: m.toolCalls?.map(t =>
                    t.id === e.toolCallId ? { ...t, status: 'pending' as const } : t
                  ),
                }))
              );
            }
            break;
          }
          case EventType.TOOL_CALL_RESULT: {
            const e = event as ToolCallResultEvent;
            const tc = toolCallsRef.current.get(e.toolCallId);
            if (tc) {
              tc.result = e.content;
              tc.status = 'complete';
              setMessages(prev =>
                prev.map(m => ({
                  ...m,
                  toolCalls: m.toolCalls?.map(t =>
                    t.id === e.toolCallId ? { ...t, result: e.content, status: 'complete' as const } : t
                  ),
                }))
              );
            }
            break;
          }
          case EventType.RUN_ERROR: {
            const e = event as RunErrorEvent;
            setError({
              message: e.message,
              timestamp: Date.now(),
            });
            break;
          }
        }
      },
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      },
      onDone: () => {
        setIsStreaming(false);
      },
    });

    abortRef.current = controller;
  }, [agentUrl, endpoint, threadId, state, tools, context, forwardedProps, extraMessages, addEvent]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setEvents([]);
    setError(null);
    eventCounter.current = 0;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { messages, events, isStreaming, error, sendMessage, stopStreaming, clearChat, clearError };
}
