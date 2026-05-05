"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { getRuntimeConfig } from "@/lib/runtime-config";

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 320;

type Props = {
  onSend: (text: string) => void;
  streaming?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
};

/**
 * Editorial composer pill — full-width rounded-3xl card with an auto-growing
 * textarea and a circular send button. ENTER submits, Shift+ENTER inserts a
 * newline. While streaming with an `onStop` handler the send button morphs
 * into a Stop control.
 */
export function ChatInput({
  onSend,
  streaming = false,
  onStop,
  autoFocus,
}: Props) {
  const [input, setInput] = useState("");
  const [appName, setAppName] = useState("Idun Agent");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Read the app name from the runtime config inside an effect so SSR /
  // static-export builds render a sensible fallback before hydration.
  useEffect(() => {
    setAppName(getRuntimeConfig().theme.appName ?? "Idun Agent");
  }, []);

  // Auto-grow the textarea as the user types. Reset to 0 first so the
  // scrollHeight reflects the current content (not the previous height),
  // then cap at MAX_HEIGHT and let scrollbars take over beyond that.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
  }, [input.length]);

  const submit = () => {
    const text = input.trim();
    if (!text || streaming) return;
    onSend(text);
    setInput("");
  };

  const showStop = streaming && Boolean(onStop);
  const sendDisabled = !input.trim() || streaming;

  return (
    <form
      data-tour="chat-composer"
      className="relative rounded-3xl border border-border bg-card shadow-sm transition focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={`Message ${appName}…`}
        disabled={streaming && !onStop}
        autoFocus={autoFocus}
        rows={1}
        style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${MAX_HEIGHT}px` }}
        className="w-full resize-none rounded-3xl bg-transparent px-6 py-4 pr-16 text-[17px] leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      {showStop ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generation"
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:bg-destructive disabled:opacity-40"
        >
          <Square className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={sendDisabled}
          aria-label="Send message"
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:bg-accent disabled:opacity-40"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}
