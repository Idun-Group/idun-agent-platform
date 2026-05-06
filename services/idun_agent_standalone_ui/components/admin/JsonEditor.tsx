"use client";

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

/**
 * Minimal JSON editor — replaces Monaco for the MVP. Validates the buffer
 * on every keystroke and only emits the parsed value when valid, so the
 * page-level save action can commit the change.
 */
export function JsonEditor({
  value,
  onChange,
  rows = 14,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  rows?: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // External value updates (e.g., revert) reset the buffer.
    setText(JSON.stringify(value ?? {}, null, 2));
    setError(null);
  }, [value]);

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        rows={rows}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            setError(null);
            onChange(parsed);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        className="font-mono text-xs"
      />
      {error && (
        <div className="text-xs text-red-500 font-mono">JSON: {error}</div>
      )}
    </div>
  );
}
