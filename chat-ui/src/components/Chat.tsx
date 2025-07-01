'use client';

import { useState, useEffect, useRef } from 'react';
import { Message, UIEvent, EventType, Agent, ToolCall, TextMessageStartEvent, TextMessageContentEvent, ToolCallStartEvent, ToolCallArgsEvent } from '../types';
import { v4 as uuidv4 } from 'uuid';

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [toolCalls, setToolCalls] = useState<Record<string, ToolCall>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, events]);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch('/api/agents');
        if (!response.ok) {
          throw new Error('Failed to fetch agents');
        }
        const data: Agent[] = await response.json();
        setAgents(data);
        if (data.length > 0) {
          setSelectedAgent(data[0].id);
        }
      } catch (error) {
        console.error(error);
      }
    };
    fetchAgents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedAgent) return;

    const userMessage: Message = {
      id: `user-${uuidv4()}`,
      role: 'user',
      content: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setEvents([]);
    setToolCalls({});

    try {
      const response = await fetch(`/api/agents/${selectedAgent}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: input,
          session_id: `session-${uuidv4()}`,
        }),
      });

      if (!response.body) return;

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const event: UIEvent = JSON.parse(data);
              setEvents((prev) => [...prev, event]);
              handleEvent(event);
              await new Promise((resolve) => setTimeout(resolve, 0));
            } catch (e) {
              console.error('Failed to parse event:', data, e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during chat:', error);
    }
  };

  const handleEvent = (event: UIEvent) => {
    switch (event.type) {
      case EventType.TEXT_MESSAGE_START:
        const startEvent = event as TextMessageStartEvent;
        setMessages((prev) => [
          ...prev,
          { id: startEvent.message_id, role: 'assistant', content: '' },
        ]);
        break;
      case EventType.TEXT_MESSAGE_CONTENT:
        const contentEvent = event as TextMessageContentEvent;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === contentEvent.message_id
              ? { ...m, content: m.content + contentEvent.delta }
              : m
          )
        );
        break;
      case EventType.TOOL_CALL_START:
        const toolStartEvent = event as ToolCallStartEvent;
        setToolCalls((prev) => ({
            ...prev,
            [toolStartEvent.tool_call_id]: {
                id: toolStartEvent.tool_call_id,
                name: toolStartEvent.tool_call_name,
                args: "",
            },
        }));
        break;
      case EventType.TOOL_CALL_ARGS:
        const toolArgsEvent = event as ToolCallArgsEvent;
        setToolCalls((prev) => ({
            ...prev,
            [toolArgsEvent.tool_call_id]: {
                ...prev[toolArgsEvent.tool_call_id],
                args: prev[toolArgsEvent.tool_call_id].args + toolArgsEvent.delta,
            },
        }));
        break;
    }
  };

  return (
    <div className="flex w-full h-full">
      <div className="flex-grow flex flex-col justify-between">
        <div className="p-4 bg-gray-100 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
            <label htmlFor="agent-select" className="sr-only">Select Agent</label>
            <select
                id="agent-select"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md dark:bg-zinc-700 dark:border-neutral-600"
            >
                <option value="" disabled>Select an agent</option>
                {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                    {agent.name}
                </option>
                ))}
            </select>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`p-2 rounded-lg max-w-lg ${
                  m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-zinc-700'
                }`}
              >
                {m.content}
                {m.role === 'assistant' && (
                    <div>
                        {Object.values(toolCalls).map(tc => (
                            <div key={tc.id} className="mt-2 p-2 bg-gray-100 dark:bg-zinc-600 rounded">
                                <p className="font-semibold text-xs">{tc.name}</p>
                                <pre className="text-xs whitespace-pre-wrap"><code>{tc.args}</code></pre>
                            </div>
                        ))}
                    </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-zinc-700">
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-2 border border-gray-300 rounded-md dark:bg-zinc-700 dark:border-neutral-600"
              disabled={!selectedAgent}
            />
          </form>
        </div>
      </div>
      <div className="w-1/3 border-l border-gray-200 dark:border-zinc-700 flex flex-col">
        <h2 className="text-lg font-semibold p-4 border-b border-gray-200 dark:border-zinc-700">Events</h2>
        <div className="flex-1 overflow-y-auto p-2 text-xs">
            {events.map((event, index) => (
                <div key={index} className="p-1 border-b border-gray-200 dark:border-zinc-700">
                    <p><span className="font-semibold">{event.type}</span></p>
                    <pre className="whitespace-pre-wrap"><code>{JSON.stringify(event, null, 2)}</code></pre>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
} 