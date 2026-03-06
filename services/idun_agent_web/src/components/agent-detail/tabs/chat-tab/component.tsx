import { useState, useRef, useEffect, type FormEvent, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import { useChat } from './useChat';
import { buildCurlCommand } from './agui-client';
import type { StreamEvent, ChatMessage, AgentError } from './types';
import type { BackendAgent } from '../../../../services/agents';
import './chat-tab.css';

function useCopyButton(getText: () => string, delay = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), delay);
    });
  }, [getText, delay]);
  return { copied, copy };
}

// --- Event Inspector ---
interface RunGroup {
  index: number;
  timestamp: number;
  events: StreamEvent[];
}

function groupEventsByRun(events: StreamEvent[]): RunGroup[] {
  const groups: RunGroup[] = [];
  let current: RunGroup | null = null;

  for (const ev of events) {
    if (ev.data.type === 'RUN_STARTED') {
      current = { index: groups.length + 1, timestamp: ev.timestamp, events: [] };
      groups.push(current);
    }
    if (current) {
      current.events.push(ev);
    } else {
      if (groups.length === 0) {
        current = { index: 1, timestamp: ev.timestamp, events: [] };
        groups.push(current);
      }
      groups[0].events.push(ev);
    }
  }
  return groups;
}

const typeColor = (type: string) => {
  if (type.includes('ERROR')) return '#ef4444';
  if (type.includes('RUN_')) return '#8b5cf6';
  if (type.includes('STEP_')) return '#6366f1';
  if (type.includes('TEXT_MESSAGE')) return '#22c55e';
  if (type.includes('TOOL_CALL')) return '#f59e0b';
  if (type.includes('STATE_') || type.includes('MESSAGES_')) return '#06b6d4';
  if (type.includes('REASONING')) return '#ec4899';
  return '#94a3b8';
};

function EventInspector({ events, isOpen, onToggle }: {
  events: StreamEvent[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [collapsedRuns, setCollapsedRuns] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState('');
  const prevRunCountRef = useRef(0);

  const filtered = filter
    ? events.filter(e => e.data.type.toLowerCase().includes(filter.toLowerCase()))
    : events;

  const runGroups = groupEventsByRun(filtered);

  useEffect(() => {
    const runCount = runGroups.length;
    if (runCount > prevRunCountRef.current && runCount > 1) {
      setCollapsedRuns(prev => {
        const next = new Set(prev);
        for (let i = 1; i < runCount; i++) {
          next.add(i);
        }
        next.delete(runCount);
        return next;
      });
    }
    prevRunCountRef.current = runCount;
  }, [runGroups.length]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events]);

  const toggleEventExpand = (id: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleRunCollapse = (runIndex: number) => {
    setCollapsedRuns(prev => {
      const next = new Set(prev);
      next.has(runIndex) ? next.delete(runIndex) : next.add(runIndex);
      return next;
    });
  };

  const getAllText = useCallback(
    () => filtered.map(e => JSON.stringify(e.data, null, 2)).join('\n\n'),
    [filtered]
  );
  const { copied: copiedAll, copy: copyAll } = useCopyButton(getAllText);

  return (
    <div className={`event-inspector ${isOpen ? 'open' : ''}`}>
      <button className="inspector-toggle" onClick={onToggle}>
        {isOpen ? '▸ Events' : '◂ Events'} ({events.length})
      </button>
      {isOpen && (
        <div className="inspector-content">
          <div className="inspector-toolbar">
            <input
              type="text"
              placeholder="Filter events..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="filter-input"
            />
            <span className="event-count">{filtered.length} events</span>
            <button
              className={`msg-btn ${copiedAll ? 'copied' : ''}`}
              onClick={copyAll}
              title="Copy all events as JSON"
            >
              {copiedAll ? '✓ all' : '⎘ all'}
            </button>
          </div>
          <div className="event-list" ref={listRef}>
            {runGroups.map(group => {
              const isCollapsed = collapsedRuns.has(group.index);
              return (
                <div key={group.index} className="event-run-group">
                  <div
                    className={`event-run-separator ${isCollapsed ? 'collapsed' : ''}`}
                    onClick={() => toggleRunCollapse(group.index)}
                  >
                    <span className="event-run-arrow">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="event-run-label">Run #{group.index}</span>
                    <span className="event-run-count">{group.events.length} events</span>
                    <span className="event-run-time">
                      {new Date(group.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                  </div>
                  {!isCollapsed && group.events.map(ev => (
                    <EventItem
                      key={ev.id}
                      ev={ev}
                      expanded={expandedEvents.has(ev.id)}
                      onToggle={() => toggleEventExpand(ev.id)}
                      typeColor={typeColor}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EventItem({ ev, expanded, onToggle, typeColor: getTypeColor }: {
  ev: StreamEvent;
  expanded: boolean;
  onToggle: () => void;
  typeColor: (t: string) => string;
}) {
  const getJson = useCallback(() => JSON.stringify(ev.data, null, 2), [ev.data]);
  const { copied, copy } = useCopyButton(getJson);

  return (
    <div className="event-item" onClick={onToggle}>
      <div className="event-header">
        <span className="event-type" style={{ color: getTypeColor(ev.data.type) }}>
          {ev.data.type}
        </span>
        <span className="event-time">
          {new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}
        </span>
        <button
          className={`msg-btn event-copy-btn ${copied ? 'copied' : ''}`}
          onClick={e => { e.stopPropagation(); copy(); }}
          title="Copy event as JSON"
        >
          {copied ? '✓' : '⎘'}
        </button>
      </div>
      {expanded && (
        <pre className="event-json">{JSON.stringify(ev.data, null, 2)}</pre>
      )}
    </div>
  );
}

// --- Tool Call Display ---
function ToolCallDisplay({ tc }: { tc: NonNullable<ChatMessage['toolCalls']>[number] }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    streaming: '⟳',
    pending: '⏳',
    complete: '✓',
    error: '✗',
  }[tc.status];

  let parsedArgs: string;
  try {
    parsedArgs = JSON.stringify(JSON.parse(tc.arguments), null, 2);
  } catch {
    parsedArgs = tc.arguments;
  }

  return (
    <div className={`tool-call ${tc.status}`} onClick={() => setExpanded(!expanded)}>
      <div className="tool-call-header">
        <span className="tool-status-icon">{statusIcon}</span>
        <span className="tool-name">{tc.name}</span>
        <span className="tool-id">{tc.id.slice(0, 8)}</span>
      </div>
      {expanded && (
        <div className="tool-call-details">
          <div className="tool-section">
            <span className="tool-label">Args:</span>
            <pre>{parsedArgs || '(none)'}</pre>
          </div>
          {tc.result && (
            <div className="tool-section">
              <span className="tool-label">Result:</span>
              <pre>{tc.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Message Bubble ---
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [msg.content]);

  const hasContent = !!msg.content;

  return (
    <div className={`message ${msg.role}`}>
      <div className="message-meta">
        <span className="message-role">{msg.role}</span>
        <span className="message-time">
          {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false })}
        </span>
        {hasContent && (
          <div className="message-actions">
            <button
              className={`msg-btn ${raw ? 'active' : ''}`}
              onClick={() => setRaw(v => !v)}
              title={raw ? 'Show rendered' : 'Show raw'}
            >
              {raw ? 'MD' : 'RAW'}
            </button>
            <button
              className={`msg-btn ${copied ? 'copied' : ''}`}
              onClick={copy}
              title="Copy raw content"
            >
              {copied ? '✓' : '⎘'}
            </button>
          </div>
        )}
      </div>
      <div className={`message-content ${raw ? 'raw' : 'rendered'}`}>
        {raw
          ? <pre className="message-raw">{msg.content}</pre>
          : <ReactMarkdown>{msg.content || (msg.role === 'assistant' ? '...' : '')}</ReactMarkdown>
        }
      </div>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="tool-calls">
          {msg.toolCalls.map(tc => (
            <ToolCallDisplay key={tc.id} tc={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- JSON Editor (collapsible) ---
function JsonEditor({ label, value, onChange, placeholder, hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  let isValid = true;
  try { if (value.trim()) JSON.parse(value); } catch { isValid = false; }

  return (
    <div className="json-editor">
      <button className="json-editor-toggle" onClick={() => setOpen(v => !v)}>
        <span className="json-toggle-arrow">{open ? '▾' : '▸'}</span>
        <span className="json-toggle-label">{label}</span>
        {!isValid && <span className="json-error-badge">invalid</span>}
        {isValid && value.trim() && value.trim() !== '{}' && value.trim() !== '[]' && (
          <span className="json-set-badge">set</span>
        )}
      </button>
      {open && (
        <>
          {hint && <div className="config-description">{hint}</div>}
          <textarea
            className={`json-textarea ${!isValid ? 'invalid' : ''}`}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={4}
            spellCheck={false}
          />
        </>
      )}
    </div>
  );
}

// --- Extra Messages Editor ---
function ExtraMessagesEditor({ messages, onChange, hint }: {
  messages: { role: string; content: string }[];
  onChange: (msgs: { role: string; content: string }[]) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);

  const addMessage = () => {
    onChange([...messages, { role: 'system', content: '' }]);
    setOpen(true);
  };

  const removeMessage = (idx: number) => {
    onChange(messages.filter((_, i) => i !== idx));
  };

  const updateMessage = (idx: number, field: 'role' | 'content', value: string) => {
    onChange(messages.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  return (
    <div className="json-editor">
      <button className="json-editor-toggle" onClick={() => setOpen(v => !v)}>
        <span className="json-toggle-arrow">{open ? '▾' : '▸'}</span>
        <span className="json-toggle-label">Extra Messages</span>
        {messages.length > 0 && (
          <span className="json-set-badge">{messages.length}</span>
        )}
      </button>
      {open && (
        <div className="extra-messages">
          {hint && <div className="config-description">{hint}</div>}
          {messages.map((msg, idx) => (
            <div key={idx} className="extra-msg-row">
              <select
                value={msg.role}
                onChange={e => updateMessage(idx, 'role', e.target.value)}
                className="extra-msg-role"
              >
                <option value="system">system</option>
                <option value="developer">developer</option>
                <option value="user">user</option>
                <option value="assistant">assistant</option>
              </select>
              <textarea
                value={msg.content}
                onChange={e => updateMessage(idx, 'content', e.target.value)}
                placeholder="Message content..."
                rows={2}
                className="extra-msg-content"
              />
              <button
                className="btn-small btn-danger extra-msg-remove"
                onClick={() => removeMessage(idx)}
                title="Remove"
              >x</button>
            </div>
          ))}
          <button className="btn-small extra-msg-add" onClick={addMessage}>+ Add Message</button>
        </div>
      )}
    </div>
  );
}

// --- Config Panel (now togglable) ---
function ConfigPanel({
  agentUrl,
  stateJson, setStateJson,
  toolsJson, setToolsJson,
  contextJson, setContextJson,
  forwardedPropsJson, setForwardedPropsJson,
  extraMessages, setExtraMessages,
}: {
  agentUrl: string;
  stateJson: string; setStateJson: (v: string) => void;
  toolsJson: string; setToolsJson: (v: string) => void;
  contextJson: string; setContextJson: (v: string) => void;
  forwardedPropsJson: string; setForwardedPropsJson: (v: string) => void;
  extraMessages: { role: string; content: string }[]; setExtraMessages: (v: { role: string; content: string }[]) => void;
}) {
  return (
    <div className="config-panel">
      <div className="config-top-row">
        <div className="config-row">
          <label>Agent URL</label>
          <div className="agent-url-display" title={agentUrl}>{agentUrl}</div>
        </div>
        <div className="config-row">
          <label>Run ID <span className="config-hint">(auto)</span></label>
          <div className="config-description">Auto-generated unique UUID per request.</div>
        </div>
      </div>
      <div className="config-editors">
        <JsonEditor
          label="State"
          value={stateJson}
          onChange={setStateJson}
          placeholder='{"key": "value"}'
          hint="Structured memory for the conversation (workflow status, selected options, intermediate values). Sent with each request and typically updated over time."
        />
        <JsonEditor
          label="Tools"
          value={toolsJson}
          onChange={setToolsJson}
          placeholder='[{"name": "...", "description": "...", "parameters": {}}]'
          hint="Actions the agent is allowed to use during this request. Leave empty to disable actions."
        />
        <JsonEditor
          label="Context"
          value={contextJson}
          onChange={setContextJson}
          placeholder='[{"description": "...", "value": "..."}]'
          hint="Extra supporting information that is not a chat message (background facts, retrieved data, app metadata)."
        />
        <JsonEditor
          label="ForwardedProps"
          value={forwardedPropsJson}
          onChange={setForwardedPropsJson}
          placeholder='{"key": "value"}'
          hint="Additional metadata to pass through to your backend or runtime (user/tenant identifiers, flags, UI settings), without treating it as conversation text."
        />
        <ExtraMessagesEditor
          messages={extraMessages}
          onChange={setExtraMessages}
          hint="Conversation content the agent should consider (system prompts, prior context). Prepended before the chat history."
        />
      </div>
    </div>
  );
}

// --- Error Banner ---
function ErrorBanner({ error, onDismiss }: { error: AgentError; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);

  let prettyBody: string | null = null;
  if (error.responseBody) {
    try {
      prettyBody = JSON.stringify(JSON.parse(error.responseBody), null, 2);
    } catch {
      prettyBody = error.responseBody;
    }
  }

  const getErrorText = useCallback(() => JSON.stringify(error, null, 2), [error]);
  const { copied, copy } = useCopyButton(getErrorText);

  return (
    <div className="error-banner">
      <div className="error-banner-header">
        <div className="error-banner-title">
          {error.status && <span className="error-status">{error.status}</span>}
          <span className="error-message">{error.message}</span>
        </div>
        <div className="error-banner-actions">
          <button
            className={`msg-btn ${copied ? 'copied' : ''}`}
            onClick={copy}
            title="Copy error details"
          >
            {copied ? '✓' : '⎘'}
          </button>
          <button
            className="msg-btn"
            onClick={() => setExpanded(v => !v)}
            title={expanded ? 'Collapse' : 'Expand details'}
          >
            {expanded ? '▾' : '▸'}
          </button>
          <button className="msg-btn" onClick={onDismiss} title="Dismiss">✕</button>
        </div>
      </div>
      {expanded && (
        <div className="error-banner-details">
          {error.url && (
            <div className="error-detail-row">
              <span className="error-detail-label">URL</span>
              <span className="error-detail-value">{error.url}</span>
            </div>
          )}
          {error.statusText && (
            <div className="error-detail-row">
              <span className="error-detail-label">Status</span>
              <span className="error-detail-value">{error.status} {error.statusText}</span>
            </div>
          )}
          <div className="error-detail-row">
            <span className="error-detail-label">Time</span>
            <span className="error-detail-value">
              {new Date(error.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}
            </span>
          </div>
          {prettyBody && (
            <div className="error-detail-row error-detail-body">
              <span className="error-detail-label">Response Body</span>
              <pre className="error-body-content">{prettyBody}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- cURL Viewer ---
function CurlViewer({ curlCommand, onClose }: { curlCommand: string; onClose: () => void }) {
  const getCurl = useCallback(() => curlCommand, [curlCommand]);
  const { copied, copy } = useCopyButton(getCurl);

  return (
    <div className="curl-overlay" onClick={onClose}>
      <div className="curl-modal" onClick={e => e.stopPropagation()}>
        <div className="curl-modal-header">
          <span className="curl-modal-title">cURL Request</span>
          <div className="curl-modal-actions">
            <button
              className={`msg-btn ${copied ? 'copied' : ''}`}
              onClick={copy}
              title="Copy cURL command"
            >
              {copied ? '✓ Copied' : '⎘ Copy'}
            </button>
            <button className="msg-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>
        <pre className="curl-command">{curlCommand}</pre>
      </div>
    </div>
  );
}

function safeParse<T>(json: string, fallback: T): T {
  try { return json.trim() ? JSON.parse(json) : fallback; } catch { return fallback; }
}

// --- Chat Tab ---
const ChatTab: React.FC<{ agent?: BackendAgent | null }> = ({ agent }) => {
  const agentUrl = (agent?.base_url || '').replace(/\/+$/, '');
  const [endpoint, setEndpoint] = useState<'/agent/copilotkit/stream' | '/agent/stream'>('/agent/copilotkit/stream');
  const [threadId, setThreadId] = useState(() => uuidv4());
  const [input, setInput] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [stateJson, setStateJson] = useState('{}');
  const [toolsJson, setToolsJson] = useState('[]');
  const [contextJson, setContextJson] = useState('[]');
  const [forwardedPropsJson, setForwardedPropsJson] = useState('{}');
  const [extraMessages, setExtraMessages] = useState<{ role: string; content: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const extraChatMessages = extraMessages
    .filter(m => m.content.trim())
    .map((m, i) => ({
      id: `extra-${i}`,
      role: m.role as ChatMessage['role'],
      content: m.content,
      timestamp: 0,
    }));

  const [curlOpen, setCurlOpen] = useState(false);

  const { messages, events, isStreaming, error, sendMessage, stopStreaming, clearChat, clearError } = useChat({
    agentUrl,
    endpoint,
    threadId,
    state: safeParse(stateJson, {}),
    tools: safeParse(toolsJson, []),
    context: safeParse(contextJson, []),
    forwardedProps: safeParse(forwardedPropsJson, {}),
    extraMessages: extraChatMessages,
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isStreaming) return;
    const trimmed = input.trim();
    setInput('');
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewThread = () => {
    setThreadId(uuidv4());
    clearChat();
  };

  return (
    <div className="agui-chat" style={{ height: 'calc(100vh - 260px)', minHeight: '500px' }}>
      {/* Compact toolbar */}
      <div className="chat-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-badge">{endpoint === '/agent/copilotkit/stream' ? 'AG-UI' : 'SSE'}</span>
          <select
            className="toolbar-select"
            value={endpoint}
            onChange={e => setEndpoint(e.target.value as typeof endpoint)}
          >
            <option value="/agent/copilotkit/stream">AG-UI Stream</option>
            <option value="/agent/stream">Custom Stream</option>
          </select>
        </div>

        <span className="toolbar-sep" />

        <div className="toolbar-group">
          <span className="toolbar-label">Thread</span>
          <input
            type="text"
            className="toolbar-input"
            value={threadId}
            onChange={e => setThreadId(e.target.value)}
          />
          <button className="toolbar-btn" onClick={handleNewThread} title="New thread">↻</button>
        </div>

        <span className="toolbar-sep" />

        <button className="toolbar-btn danger" onClick={clearChat}>Clear</button>

        <span className="toolbar-spacer" />

        <button
          className={`toolbar-btn ${configOpen ? 'active' : ''}`}
          onClick={() => setConfigOpen(v => !v)}
          title="Toggle config panel"
        >
          ⚙ Config
        </button>
        <button
          className={`toolbar-btn ${inspectorOpen ? 'active' : ''}`}
          onClick={() => setInspectorOpen(v => !v)}
          title="Toggle event inspector"
        >
          Events{events.length > 0 ? ` (${events.length})` : ''}
        </button>
      </div>

      {/* Collapsible config panel */}
      {configOpen && (
        <ConfigPanel
          agentUrl={agentUrl}
          stateJson={stateJson} setStateJson={setStateJson}
          toolsJson={toolsJson} setToolsJson={setToolsJson}
          contextJson={contextJson} setContextJson={setContextJson}
          forwardedPropsJson={forwardedPropsJson} setForwardedPropsJson={setForwardedPropsJson}
          extraMessages={extraMessages} setExtraMessages={setExtraMessages}
        />
      )}

      {/* Chat + Event Inspector */}
      <div className="app-body">
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="empty-state">
                <p>Send a message to start chatting with your agent.</p>
                <p className="hint">Use the toolbar to switch endpoints, manage threads, or open the config panel for advanced options.</p>
              </div>
            )}
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {isStreaming && !messages.findLast(m => m.role === 'assistant')?.content && (
              <div className="thinking-indicator">
                <div className="thinking-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.5V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.5c2.9-1.2 5-4.1 5-7.5a8 8 0 0 0-8-8z"/>
                    <line x1="10" y1="22" x2="14" y2="22"/>
                  </svg>
                </div>
                <span className="thinking-label">Thinking</span>
                <span className="thinking-dots">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </span>
              </div>
            )}
            {error && (
              <ErrorBanner error={error} onDismiss={clearError} />
            )}
            <div ref={chatEndRef} />
          </div>
          <form className="chat-input" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              rows={2}
              disabled={isStreaming}
            />
            <div className="input-actions">
              <button
                type="button"
                className="btn-curl"
                onClick={() => setCurlOpen(true)}
                title="View cURL request for current config"
              >
                {'{ }'}
                <span className="btn-curl-label">cURL</span>
              </button>
              {isStreaming ? (
                <button type="button" onClick={stopStreaming} className="btn-stop">Stop</button>
              ) : (
                <button type="submit" disabled={isStreaming} className="btn-send">Send</button>
              )}
            </div>
          </form>
        </div>

        <EventInspector
          events={events}
          isOpen={inspectorOpen}
          onToggle={() => setInspectorOpen(v => !v)}
        />
      </div>

      {curlOpen && (
        <CurlViewer
          curlCommand={buildCurlCommand({
            agentUrl, endpoint, threadId,
            messages: [
              ...extraChatMessages,
              ...(input.trim() ? [{ id: uuidv4(), role: 'user' as const, content: input.trim(), timestamp: Date.now() }] : []),
            ],
            state: safeParse(stateJson, {}),
            tools: safeParse(toolsJson, []),
            context: safeParse(contextJson, []),
            forwardedProps: safeParse(forwardedPropsJson, {}),
          })}
          onClose={() => setCurlOpen(false)}
        />
      )}
    </div>
  );
};

export default ChatTab;
