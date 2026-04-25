"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

export function ChatInput({
  onSend,
  streaming,
  onStop,
}: {
  onSend: (text: string) => void;
  streaming: boolean;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <form
      className="flex gap-2 border-t border-[var(--color-border)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Message…"
        rows={1}
        className="flex-1 min-h-9 max-h-40"
      />
      {streaming ? (
        <Button type="button" variant="secondary" onClick={onStop}>
          Stop
        </Button>
      ) : (
        <Button type="submit" disabled={!text.trim()}>
          Send
        </Button>
      )}
    </form>
  );
}
