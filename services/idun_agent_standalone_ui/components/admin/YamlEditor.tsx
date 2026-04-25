"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { parse, stringify } from "yaml";

const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] grid place-items-center text-xs text-[var(--color-fg)]/50">
      Loading editor…
    </div>
  ),
});

type Mode = "yaml" | "jinja";

type Props = {
  value?: unknown;
  onChange?: (value: unknown) => void;
  rows?: number;
  /** Read-only preview when the form is the editor; editable when "Edit YAML" is toggled. */
  readOnly?: boolean;
  /** Free-text mode (e.g., Jinja prompt content). When set, the value is treated as a string and
   * onChange receives the raw string instead of a parsed YAML value. */
  mode?: Mode;
  /** Optional explicit text used when mode === "jinja" */
  text?: string;
};

const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 12,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  automaticLayout: true,
  tabSize: 2,
  renderLineHighlight: "line" as const,
};

/** Round-trip a value through YAML, hiding parse errors for the read-only case. */
function safeStringify(value: unknown): string {
  try {
    if (value == null) return "";
    return stringify(value);
  } catch {
    return "# (invalid value)\n";
  }
}

export function YamlEditor({
  value,
  onChange,
  rows = 14,
  readOnly = false,
  mode = "yaml",
  text,
}: Props) {
  const initial =
    mode === "jinja" ? (text ?? "") : safeStringify(value);
  const [buffer, setBuffer] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // External value updates (revert, fresh fetch) reset the buffer.
    setBuffer(mode === "jinja" ? (text ?? "") : safeStringify(value));
    setError(null);
    // Stringifying on every render would be expensive; the JSON snapshot is the cheap
    // dependency that captures structural change.
  }, [JSON.stringify(value), text, mode]);

  const language =
    mode === "jinja" ? "handlebars" : "yaml";
  const height = `${Math.max(rows * 18, 200)}px`;

  return (
    <div className="space-y-2">
      <div
        className="rounded-md border border-[var(--color-border)] overflow-hidden"
        style={{ height }}
      >
        <Monaco
          height="100%"
          language={language}
          value={buffer}
          theme="vs-dark"
          options={{ ...MONACO_OPTIONS, readOnly }}
          onChange={(next) => {
            const text = next ?? "";
            setBuffer(text);
            if (readOnly || !onChange) return;
            if (mode === "jinja") {
              onChange(text);
              setError(null);
              return;
            }
            try {
              const parsed = text.trim() ? parse(text) : {};
              setError(null);
              onChange(parsed);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      </div>
      {error && (
        <div className="text-xs text-red-500 font-mono">YAML: {error}</div>
      )}
    </div>
  );
}
