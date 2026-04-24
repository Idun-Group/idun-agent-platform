"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/types";
import ReasoningPanel from "./ReasoningPanel";
import { IdunMark } from "./Logos";

export default function MessageView({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md bg-ink px-4 py-2.5 text-[15.5px] leading-snug text-canvas shadow-soft">
          {m.content}
        </div>
      </div>
    );
  }

  const hasAnything = m.opener || m.plan || m.content || (m.toolCalls && m.toolCalls.length > 0);
  const waiting = m.streaming && !hasAnything;

  return (
    <div className="flex w-full gap-3.5">
      <div className="shrink-0 pt-0.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface shadow-soft ring-1 ring-rule">
          <IdunMark className="h-5" />
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-3.5">
        {waiting && (
          <div className="flex items-center gap-2 py-2">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-ink/40 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-ink/40 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-ink/40 animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}

        {m.opener && (
          <div className="text-[16px] leading-relaxed text-ink">
            {m.opener}
          </div>
        )}

        <ReasoningPanel
          plan={m.plan}
          thoughts={m.thoughts}
          thinking={m.thinking}
          toolCalls={m.toolCalls || []}
          streaming={m.streaming}
        />

        {m.content && (
          <div className="prose-chat max-w-none text-[16px] leading-[1.65] text-ink">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            {m.streaming && (
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-ink/60 align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
