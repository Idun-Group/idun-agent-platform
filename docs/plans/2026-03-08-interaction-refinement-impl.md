# Agent Interaction Refinement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the UI to correctly interact with all 4 agent types (LangGraph chat/structured, ADK chat/structured), add schema-driven form generation, structured output viewer, improved error display, and comprehensive testing.

**Architecture:** The UI becomes framework-aware via `capabilities.framework` when building `RunAgentInput`. LangGraph structured agents receive data in `state`, ADK structured agents in `messages[-1].content`. Structured output is extracted from `STATE_SNAPSHOT` events. New components: `SchemaForm` (generates form fields from JSON Schema), `StructuredOutputViewer` (renders output as tables/key-value/JSON).

**Tech Stack:** React 19, TypeScript, AG-UI Client, CSS (chat-tab.css conventions), Python (pytest, FastAPI TestClient)

**Design doc:** `docs/plans/2026-03-08-interaction-refinement-design.md`

---

### Task 1: Update types — Add error code and state snapshot to types

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/types.ts`

**Step 1: Add `code` to AgentError and add StateSnapshot type**

```typescript
// In types.ts, update AgentError:
export interface AgentError {
  message: string;
  code?: string;          // <-- ADD: from RunErrorEvent.code
  status?: number;
  statusText?: string;
  url?: string;
  responseBody?: string;
  timestamp: number;
}
```

No test needed — type-only change.

**Step 2: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/types.ts
git commit -m "feat(web): add error code field to AgentError type"
```

---

### Task 2: Fix useChat — Framework-aware request building + STATE_SNAPSHOT handling

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/useChat.ts`

**Step 1: Update `sendMessage` to build RunAgentInput based on framework + mode**

The key change is in the `sendMessage` callback (around line 191). When `capabilities` is available:

```typescript
// Inside sendMessage, replace the current input construction (lines 192-200) with:
if (capabilities) {
  const isStructured = capabilities.input.mode === 'structured';
  const isLangGraph = capabilities.framework === 'LANGGRAPH';

  let runState: Record<string, unknown>;
  let runMessages: import('@ag-ui/client').Message[];

  if (isStructured && isLangGraph) {
    // LangGraph structured: input goes in state, messages empty
    try {
      runState = JSON.parse(content);
    } catch {
      runState = { ...state };
    }
    runMessages = [];
  } else if (isStructured) {
    // ADK structured: input goes in messages as JSON string
    runState = state;
    runMessages = [{ id: userMsg.id, role: 'user' as const, content }] as import('@ag-ui/client').Message[];
  } else {
    // Chat mode (any framework): messages as conversation history
    runState = state;
    runMessages = allMessages.map(m => ({ id: m.id, role: m.role, content: m.content }) as import('@ag-ui/client').Message);
  }

  const input = {
    threadId,
    runId: effectiveRunId,
    state: runState,
    messages: runMessages,
    tools,
    context,
    forwardedProps,
  };

  // ... rest stays the same (runAgent call)
}
```

**Step 2: Add STATE_SNAPSHOT event handling in `handleEvent`**

Add a new case after the existing `EventType.CUSTOM` case (around line 160):

```typescript
case EventType.STATE_SNAPSHOT: {
  const snapshot = (event as BaseEvent & { snapshot?: Record<string, unknown> }).snapshot;
  if (snapshot && capabilities?.output.mode === 'structured' && capabilities?.output.schema) {
    // Extract only the fields defined in the output schema
    const schemaProps = (capabilities.output.schema as Record<string, unknown>)?.properties;
    if (schemaProps && typeof schemaProps === 'object') {
      const outputKeys = Object.keys(schemaProps as Record<string, unknown>);
      const extracted: Record<string, unknown> = {};
      for (const key of outputKeys) {
        if (key in snapshot) extracted[key] = snapshot[key];
      }
      if (Object.keys(extracted).length > 0) {
        setStructuredOutput(extracted);
      }
    } else {
      // No schema properties — use full snapshot
      setStructuredOutput(snapshot);
    }
  } else if (snapshot) {
    // Non-structured or no schema — store full snapshot
    setStructuredOutput(snapshot);
  }
  break;
}
```

**Step 3: Update RUN_ERROR handling to capture `code`**

Replace the current `EventType.RUN_ERROR` case (line 161-168):

```typescript
case EventType.RUN_ERROR: {
  const e = event as RunErrorEvent;
  setError({
    message: e.message,
    code: (e as RunErrorEvent & { code?: string }).code,
    timestamp: Date.now(),
  });
  break;
}
```

**Step 4: Add `EventType.STATE_SNAPSHOT` to the import if not present**

Check that `EventType` includes STATE_SNAPSHOT. The ag-ui/client package should already export it. If there's a type issue, cast as needed.

**Step 5: Verify TypeScript compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/useChat.ts
git commit -m "feat(web): framework-aware request building and STATE_SNAPSHOT output extraction"
```

---

### Task 3: Build StructuredInputForm with schema-generated fields

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx` (replace existing StructuredInputForm, lines 590-695)

**Step 1: Rewrite StructuredInputForm**

Replace the existing `StructuredInputForm` component (lines 590-695 in component.tsx) with a version that:

1. Reads `schema.properties` and `schema.required` to generate form fields
2. Supports a toggle between Form view and Raw JSON view
3. Each property type maps to an input element:
   - `string` → `<textarea>` (single row) or `<input type="text">`
   - `number`/`integer` → `<input type="number">`
   - `boolean` → `<input type="checkbox">`
   - `array` → `<textarea>` with comma-separated hint or JSON array
   - `object` → `<textarea>` with JSON
4. Required fields marked with `*`
5. Field descriptions shown below inputs
6. Form values collected into an object and passed to `onSubmit`
7. Falls back to raw JSON textarea when schema has no `properties`

```typescript
function SchemaField({ name, schema, value, onChange, required }: {
  name: string;
  schema: Record<string, unknown>;
  value: unknown;
  onChange: (v: unknown) => void;
  required: boolean;
}) {
  const type = schema.type as string;
  const description = schema.description as string | undefined;
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="schema-field">
      <label className="schema-field-label">
        {label}{required && <span className="schema-field-required">*</span>}
      </label>
      {description && <div className="schema-field-desc">{description}</div>}
      {type === 'boolean' ? (
        <label className="schema-checkbox">
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
          />
          <span>{value ? 'true' : 'false'}</span>
        </label>
      ) : type === 'number' || type === 'integer' ? (
        <input
          type="number"
          className="schema-field-input"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          step={type === 'integer' ? 1 : 'any'}
        />
      ) : type === 'array' ? (
        <textarea
          className="schema-field-textarea"
          value={typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)}
          onChange={e => {
            try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
          }}
          rows={3}
          placeholder='["item1", "item2"]'
          spellCheck={false}
        />
      ) : type === 'object' ? (
        <textarea
          className="schema-field-textarea"
          value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={e => {
            try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
          }}
          rows={3}
          placeholder='{"key": "value"}'
          spellCheck={false}
        />
      ) : (
        <input
          type="text"
          className="schema-field-input"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={e => onChange(e.target.value)}
          placeholder={description || ''}
        />
      )}
    </div>
  );
}

function StructuredInputForm({
  schema,
  outputSchema,
  onSubmit,
  isStreaming,
  lastResult,
  error,
}: {
  schema: Record<string, unknown>;
  outputSchema?: Record<string, unknown> | null;
  onSubmit: (data: unknown) => void;
  isStreaming: boolean;
  lastResult?: unknown;
  error?: AgentError | null;
}) {
  const properties = schema?.properties as Record<string, Record<string, unknown>> | undefined;
  const requiredFields = (schema?.required as string[]) || [];
  const hasProperties = properties && Object.keys(properties).length > 0;

  const [mode, setMode] = useState<'form' | 'json'>(hasProperties ? 'form' : 'json');
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    if (!properties) return {};
    const initial: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      if (prop.type === 'string') initial[key] = '';
      else if (prop.type === 'integer' || prop.type === 'number') initial[key] = null;
      else if (prop.type === 'boolean') initial[key] = false;
      else if (prop.type === 'array') initial[key] = [];
      else if (prop.type === 'object') initial[key] = {};
      else initial[key] = null;
    }
    return initial;
  });
  const [rawJson, setRawJson] = useState(() => JSON.stringify(formValues, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFormSubmit = () => {
    setParseError(null);
    // Clean null values for non-required fields
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(formValues)) {
      if (val !== null && val !== undefined && val !== '') cleaned[key] = val;
      else if (requiredFields.includes(key)) cleaned[key] = val ?? '';
    }
    onSubmit(cleaned);
  };

  const handleJsonSubmit = () => {
    try {
      const parsed = JSON.parse(rawJson);
      setParseError(null);
      onSubmit(parsed);
    } catch (e) {
      setParseError(`Invalid JSON: ${e}`);
    }
  };

  const updateFormValue = (key: string, value: unknown) => {
    setFormValues(prev => {
      const next = { ...prev, [key]: value };
      setRawJson(JSON.stringify(next, null, 2));
      return next;
    });
  };

  return (
    <div className="structured-form">
      <div className="structured-form-header">
        <span className="structured-form-title">Input</span>
        {hasProperties && (
          <button
            className="toolbar-btn"
            onClick={() => {
              if (mode === 'form') {
                setRawJson(JSON.stringify(formValues, null, 2));
              } else {
                try {
                  const parsed = JSON.parse(rawJson);
                  setFormValues(parsed);
                } catch { /* keep current form values */ }
              }
              setMode(m => m === 'form' ? 'json' : 'form');
            }}
          >
            {mode === 'form' ? 'Raw JSON' : 'Form'}
          </button>
        )}
      </div>

      {mode === 'form' && hasProperties ? (
        <div className="schema-fields">
          {Object.entries(properties).map(([key, prop]) => (
            <SchemaField
              key={key}
              name={key}
              schema={prop}
              value={formValues[key]}
              onChange={v => updateFormValue(key, v)}
              required={requiredFields.includes(key)}
            />
          ))}
        </div>
      ) : (
        <div className="structured-json-input">
          <textarea
            className={`json-textarea ${parseError ? 'invalid' : ''}`}
            value={rawJson}
            onChange={e => setRawJson(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder='{"key": "value"}'
          />
          {parseError && <div className="structured-parse-error">{parseError}</div>}
        </div>
      )}

      <button
        className="btn-send structured-submit"
        onClick={mode === 'form' ? handleFormSubmit : handleJsonSubmit}
        disabled={isStreaming}
      >
        {isStreaming ? 'Running...' : 'Run Agent'}
      </button>

      {error && <ErrorBanner error={error} onDismiss={() => {}} />}

      {lastResult !== undefined && lastResult !== null && (
        <StructuredOutputViewer data={lastResult} schema={outputSchema} />
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx
git commit -m "feat(web): schema-driven structured input form with field generation"
```

---

### Task 4: Build StructuredOutputViewer component

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx` (add new component before ChatTab)

**Step 1: Add StructuredOutputViewer component**

Insert before the `ChatTab` component definition:

```typescript
function StructuredOutputViewer({ data, schema }: {
  data: unknown;
  schema?: Record<string, unknown> | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  if (data === null || data === undefined) return null;

  const isFlat = (obj: unknown): obj is Record<string, string | number | boolean | null> => {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    return Object.values(obj).every(v => v === null || typeof v !== 'object');
  };

  const isArrayOfFlat = (arr: unknown): arr is Record<string, string | number | boolean | null>[] => {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.every(item => isFlat(item));
  };

  const renderContent = () => {
    if (showRaw || typeof data === 'string') {
      return (
        <pre className="output-json">
          {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
        </pre>
      );
    }

    if (isArrayOfFlat(data)) {
      const columns = [...new Set(data.flatMap(row => Object.keys(row)))];
      return (
        <div className="output-table-wrap">
          <table className="output-table">
            <thead>
              <tr>{columns.map(col => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => <td key={col}>{row[col] === null ? '—' : String(row[col])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (isFlat(data)) {
      return (
        <table className="output-kv">
          <tbody>
            {Object.entries(data).map(([key, val]) => (
              <tr key={key}>
                <td className="output-kv-key">{key}</td>
                <td className="output-kv-val">
                  {val === null ? <span className="output-null">null</span> : String(val)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // Complex nested — pretty-print JSON
    return (
      <pre className="output-json">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  return (
    <div className="structured-output">
      <div className="structured-output-header">
        <span className="structured-form-title">Output</span>
        <button className="toolbar-btn" onClick={() => setShowRaw(v => !v)}>
          {showRaw ? 'Formatted' : 'Raw JSON'}
        </button>
      </div>
      {renderContent()}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx
git commit -m "feat(web): structured output viewer with table/kv/json rendering"
```

---

### Task 5: Redesign capabilities info bar

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx` (replace inline-style capabilities bar around lines 836-871)

**Step 1: Replace inline styles with proper CSS classes**

Replace the current capabilities info bar (the `{capabilities && ( <div style={{...}}>` block around lines 836-871) with:

```tsx
{capabilities && (
  <div className="capabilities-bar">
    <span className="capabilities-badge">{capabilities.framework}</span>
    <span className="capabilities-info">
      Input: <strong>{capabilities.input.mode}</strong>
    </span>
    <span className="capabilities-info">
      Output: <strong>{capabilities.output.mode}</strong>
    </span>
    <span className="capabilities-flags">
      {capabilities.capabilities.streaming && <span className="capabilities-flag">Streaming</span>}
      {capabilities.capabilities.history && <span className="capabilities-flag">History</span>}
      {capabilities.capabilities.threadId && <span className="capabilities-flag">ThreadId</span>}
    </span>
    {capabilities.input.mode === 'structured' && (
      <button
        className="toolbar-btn capabilities-toggle"
        onClick={() => setViewMode(viewMode === 'chat' ? 'form' : 'chat')}
      >
        {viewMode === 'chat' ? 'Form' : 'Chat'}
      </button>
    )}
  </div>
)}

{!capabilities && agentUrl && (
  <div className="capabilities-bar capabilities-warning">
    <span className="capabilities-info">
      Capabilities unavailable — using chat mode
    </span>
  </div>
)}
```

**Step 2: Update the StructuredInputForm call to pass error**

In the `viewMode === 'form'` branch (around line 876-884), update the StructuredInputForm props:

```tsx
{viewMode === 'form' ? (
  <StructuredInputForm
    schema={capabilities?.input.schema || {}}
    outputSchema={capabilities?.output.schema}
    onSubmit={(jsonData) => sendMessage(JSON.stringify(jsonData))}
    isStreaming={isStreaming}
    lastResult={structuredOutput}
    error={error}
  />
) : (
  /* existing chat view */
)}
```

**Step 3: Verify TypeScript compiles**

Run: `cd services/idun_agent_web && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx
git commit -m "feat(web): redesign capabilities info bar with proper CSS classes"
```

---

### Task 6: Improve ErrorBanner with error code display

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx` (update ErrorBanner component, around lines 487-557)

**Step 1: Add error code badge to ErrorBanner**

In the `ErrorBanner` component, update the title section to show the code:

```tsx
<div className="error-banner-title">
  {error.code && <span className="error-code-badge">{error.code}</span>}
  {error.status && <span className="error-status">{error.status}</span>}
  <span className="error-message">{error.message}</span>
</div>
```

**Step 2: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx
git commit -m "feat(web): display error code badge in error banner"
```

---

### Task 7: Add CSS styles for new components

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/chat-tab.css`

**Step 1: Add styles for capabilities bar, schema form, output viewer**

Append to the end of `chat-tab.css`:

```css
/* ── Capabilities Bar ── */
.agui-chat .capabilities-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--chat-text-dim);
  border-bottom: 1px solid var(--chat-border);
  background: var(--chat-surface);
  flex-wrap: wrap;
  flex-shrink: 0;
  margin-top: 8px;
  border-radius: 10px 10px 0 0;
}

.agui-chat .capabilities-bar.capabilities-warning {
  background: rgba(245, 158, 11, 0.06);
  border-color: rgba(245, 158, 11, 0.2);
}

.agui-chat .capabilities-badge {
  font-size: 11px;
  font-family: var(--chat-mono);
  font-weight: 700;
  background: rgba(140, 82, 255, 0.12);
  color: var(--chat-accent);
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(140, 82, 255, 0.18);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.agui-chat .capabilities-info {
  font-size: 12px;
  color: var(--chat-text-dim);
}
.agui-chat .capabilities-info strong {
  color: var(--chat-text);
  font-weight: 600;
}

.agui-chat .capabilities-flags {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.agui-chat .capabilities-flag {
  font-size: 10px;
  font-family: var(--chat-mono);
  font-weight: 600;
  background: rgba(34, 197, 94, 0.1);
  color: var(--chat-green);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(34, 197, 94, 0.15);
}

.agui-chat .capabilities-toggle {
  margin-left: 8px;
}

/* ── Structured Form ── */
.agui-chat .structured-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  flex: 1;
  overflow: auto;
}

.agui-chat .structured-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agui-chat .structured-form-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--chat-text);
}

.agui-chat .schema-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agui-chat .schema-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agui-chat .schema-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--chat-text);
  text-transform: capitalize;
}

.agui-chat .schema-field-required {
  color: var(--chat-red);
  margin-left: 2px;
}

.agui-chat .schema-field-desc {
  font-size: 11px;
  color: var(--chat-text-dim);
  line-height: 1.4;
}

.agui-chat .schema-field-input {
  padding: 8px 12px;
  background: var(--chat-elevated);
  border: 1px solid var(--chat-border);
  border-radius: 8px;
  color: var(--chat-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.agui-chat .schema-field-input:focus { border-color: var(--chat-accent); }

.agui-chat .schema-field-textarea {
  padding: 8px 12px;
  background: var(--chat-elevated);
  border: 1px solid var(--chat-border);
  border-radius: 8px;
  color: var(--chat-text);
  font-size: 13px;
  font-family: var(--chat-mono);
  outline: none;
  resize: vertical;
  min-height: 60px;
  transition: border-color 0.15s;
}
.agui-chat .schema-field-textarea:focus { border-color: var(--chat-accent); }

.agui-chat .schema-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--chat-text);
  cursor: pointer;
}
.agui-chat .schema-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--chat-accent);
}

.agui-chat .structured-json-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agui-chat .structured-parse-error {
  color: var(--chat-red);
  font-size: 12px;
  font-family: var(--chat-mono);
}

.agui-chat .structured-submit {
  align-self: flex-start;
}

/* ── Structured Output Viewer ── */
.agui-chat .structured-output {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.agui-chat .structured-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agui-chat .output-json {
  padding: 12px;
  background: var(--chat-elevated);
  border: 1px solid var(--chat-border);
  border-radius: 8px;
  font-family: var(--chat-mono);
  font-size: 12px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  margin: 0;
  color: var(--chat-text);
}

.agui-chat .output-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--chat-border);
  border-radius: 8px;
}

.agui-chat .output-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.agui-chat .output-table th {
  padding: 8px 12px;
  background: var(--chat-elevated);
  border-bottom: 1px solid var(--chat-border);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--chat-text-dim);
  text-align: left;
}

.agui-chat .output-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--overlay-subtle);
  color: var(--chat-text);
}
.agui-chat .output-table tr:last-child td { border-bottom: none; }

.agui-chat .output-kv {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  border: 1px solid var(--chat-border);
  border-radius: 8px;
  overflow: hidden;
}

.agui-chat .output-kv-key {
  padding: 8px 12px;
  background: var(--chat-elevated);
  font-weight: 600;
  font-size: 12px;
  color: var(--chat-text-dim);
  white-space: nowrap;
  width: 1%;
  border-right: 1px solid var(--chat-border);
  border-bottom: 1px solid var(--overlay-subtle);
}

.agui-chat .output-kv-val {
  padding: 8px 12px;
  color: var(--chat-text);
  border-bottom: 1px solid var(--overlay-subtle);
  word-break: break-word;
}
.agui-chat .output-kv tr:last-child td { border-bottom: none; }

.agui-chat .output-null {
  color: var(--chat-text-dim);
  font-style: italic;
}

/* ── Error Code Badge ── */
.agui-chat .error-code-badge {
  font-family: var(--chat-mono);
  font-size: 10px;
  font-weight: 700;
  background: rgba(239, 68, 68, 0.12);
  color: var(--chat-red);
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
```

**Step 2: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/chat-tab.css
git commit -m "feat(web): add CSS for capabilities bar, schema form, output viewer, error code badge"
```

---

### Task 8: Update agui-client buildCurlCommand for framework-aware format

**Files:**
- Modify: `services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/agui-client.ts`

**Step 1: Update buildCurlCommand to accept capabilities and build framework-aware body**

Update the `buildCurlCommand` function signature and logic:

```typescript
export function buildCurlCommand(options: Pick<StreamOptions, 'agentUrl' | 'endpoint' | 'threadId' | 'runId' | 'messages' | 'tools' | 'context' | 'forwardedProps' | 'state'> & { capabilities?: AgentCapabilities | null }): string {
  const { agentUrl, endpoint, threadId, runId, messages, tools = [], context = [], forwardedProps = {}, state = {}, capabilities } = options;

  // For /agent/run with capabilities, use the canonical format
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
```

**Step 2: Update the CurlViewer call in ChatTab** to pass capabilities.

In component.tsx, in the `CurlViewer` section (around lines 955-969), add `capabilities` to the `buildCurlCommand` options:

```tsx
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
    capabilities,
  })}
  onClose={() => setCurlOpen(false)}
/>
```

**Step 3: Commit**

```bash
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/agui-client.ts
git add services/idun_agent_web/src/components/agent-detail/tabs/chat-tab/component.tsx
git commit -m "feat(web): framework-aware cURL command generation"
```

---

### Task 9: Verify frontend builds and manually test

**Files:** None (verification only)

**Step 1: Run TypeScript check**

Run: `cd services/idun_agent_web && npx tsc --noEmit`
Expected: No errors

**Step 2: Run build**

Run: `cd services/idun_agent_web && npm run build`
Expected: Successful build

**Step 3: Run lint**

Run: `cd services/idun_agent_web && npm run lint`
Expected: No errors (or only pre-existing warnings)

**Step 4: Commit any lint fixes if needed**

---

### Task 10: Expand backend tests — discovery tests for structured agents

**Files:**
- Modify: `libs/idun_agent_engine/tests/unit/agent/test_discovery.py`

**Step 1: Write test for LangGraph structured input graph with Pydantic input**

Add to the existing test file:

```python
@pytest.mark.asyncio
async def test_langgraph_pydantic_input_discovery():
    """Agent with Pydantic input model (StructuredInputState) should discover as structured."""
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "pydantic_input_agent",
                "graph_definition": f"{mock_graph_path}:structured_input_graph",
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    capabilities = agent.discover_capabilities()

    assert capabilities.framework.value == "LANGGRAPH"
    assert capabilities.input.mode == "structured"
    assert capabilities.input.schema_ is not None
```

**Step 2: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py -v`
Expected: All tests pass

**Step 3: Commit**

```bash
git add libs/idun_agent_engine/tests/unit/agent/test_discovery.py
git commit -m "test: add Pydantic input discovery test for LangGraph"
```

---

### Task 11: Expand backend tests — run route tests for structured agents

**Files:**
- Modify: `libs/idun_agent_engine/tests/unit/server/test_routes_run.py`

**Step 1: Add structured agent run test**

```python
def test_run_structured(self):
    """POST /agent/run with structured state returns SSE stream."""
    config = ConfigBuilder.from_dict(_make_config("structured_io_graph")).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "threadId": "test-thread",
                "runId": "test-run",
                "state": {"user_input": "test data"},
                "messages": [],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
            headers={"Accept": "text/event-stream"},
        )
        assert response.status_code == 200
        body = response.text
        assert "RUN_STARTED" in body or "run_started" in body.lower()
```

**Step 2: Add validation error test**

```python
def test_run_structured_invalid_json(self):
    """POST /agent/run with invalid JSON in structured message should yield RUN_ERROR."""
    config = ConfigBuilder.from_dict(_make_config("structured_io_graph")).build()
    app = create_app(engine_config=config)

    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "threadId": "test-thread",
                "runId": "test-run",
                "state": {},
                "messages": [{"id": "msg_1", "role": "user", "content": "not valid json {{{"}],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
            headers={"Accept": "text/event-stream"},
        )
        assert response.status_code == 200
        body = response.text
        assert "VALIDATION_ERROR" in body or "RUN_ERROR" in body
```

**Step 3: Run tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/server/test_routes_run.py -v`
Expected: All tests pass

**Step 4: Commit**

```bash
git add libs/idun_agent_engine/tests/unit/server/test_routes_run.py
git commit -m "test: add structured agent run and validation error tests"
```

---

### Task 12: Create manual test script

**Files:**
- Create: `docs/test-scripts/test-agent-run.sh`

**Step 1: Write the test script**

```bash
#!/usr/bin/env bash
# Manual smoke test for /agent/run across all 4 agent types.
# Requires agents running on: 8811 (LG chat), 8825 (LG structured), 8800 (ADK chat), 8830 (ADK structured)
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0

check() {
  local label="$1" response="$2" pattern="$3"
  if echo "$response" | grep -qi "$pattern"; then
    echo -e "  ${GREEN}PASS${NC} $label"
    ((pass++))
  else
    echo -e "  ${RED}FAIL${NC} $label (expected '$pattern')"
    ((fail++))
  fi
}

echo -e "${YELLOW}=== LangGraph Chat (8811) ===${NC}"
LG_CHAT=$(curl -s -X POST http://localhost:8811/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {},
    "messages": [{"id": "msg-001", "role": "user", "content": "hello, tell me 1+1"}],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$LG_CHAT" "RUN_STARTED"
check "TEXT_MESSAGE" "$LG_CHAT" "TEXT_MESSAGE"
check "RUN_FINISHED" "$LG_CHAT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== LangGraph Structured (8825) ===${NC}"
LG_STRUCT=$(curl -s -X POST http://localhost:8825/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {
      "request_id": "req-123",
      "objective": "Write a launch announcement",
      "context": {"product_name": "Idun Analytics"},
      "constraints": ["Keep it under 150 words"],
      "priority": "high"
    },
    "messages": [],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$LG_STRUCT" "RUN_STARTED"
check "STATE_SNAPSHOT" "$LG_STRUCT" "STATE_SNAPSHOT"
check "RUN_FINISHED" "$LG_STRUCT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== ADK Chat (8800) ===${NC}"
ADK_CHAT=$(curl -s -X POST http://localhost:8800/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {},
    "messages": [{"id": "msg-001", "role": "user", "content": "hello you"}],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$ADK_CHAT" "RUN_STARTED"
check "TEXT_MESSAGE" "$ADK_CHAT" "TEXT_MESSAGE"
check "RUN_FINISHED" "$ADK_CHAT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== ADK Structured (8830) ===${NC}"
ADK_STRUCT=$(curl -s -X POST http://localhost:8830/agent/run \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "test-thread",
    "runId": "test-run",
    "state": {},
    "messages": [{"id": "msg-001", "role": "user", "content": "{\"request_id\":\"req-001\",\"objective\":\"Customer cannot log in\",\"category\":\"support\",\"priority\":\"high\"}"}],
    "tools": [], "context": [], "forwardedProps": {}
  }')
check "RUN_STARTED" "$ADK_STRUCT" "RUN_STARTED"
check "RUN_FINISHED" "$ADK_STRUCT" "RUN_FINISHED"

echo ""
echo -e "${YELLOW}=== Capabilities Endpoints ===${NC}"
for port in 8811 8825 8800 8830; do
  CAPS=$(curl -s http://localhost:$port/agent/capabilities)
  if echo "$CAPS" | grep -q "framework"; then
    echo -e "  ${GREEN}PASS${NC} :$port /agent/capabilities"
    ((pass++))
  else
    echo -e "  ${RED}FAIL${NC} :$port /agent/capabilities"
    ((fail++))
  fi
done

echo ""
echo -e "────────────────────────"
echo -e "Results: ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC}"
[ "$fail" -eq 0 ] && exit 0 || exit 1
```

**Step 2: Make executable and commit**

```bash
mkdir -p docs/test-scripts
chmod +x docs/test-scripts/test-agent-run.sh
git add docs/test-scripts/test-agent-run.sh
git commit -m "test: add manual smoke test script for all 4 agent types"
```

---

### Task 13: Run full verification

**Step 1: Run backend tests**

Run: `uv run pytest libs/idun_agent_engine/tests/unit/agent/test_discovery.py libs/idun_agent_engine/tests/unit/server/test_routes_run.py -v`
Expected: All pass

**Step 2: Run frontend build**

Run: `cd services/idun_agent_web && npm run build`
Expected: Successful build

**Step 3: Run lint**

Run: `make lint`
Expected: Clean

**Step 4: Run manual smoke test (if agents running)**

Run: `bash docs/test-scripts/test-agent-run.sh`
Expected: All pass

**Step 5: Final commit with any fixes**
