import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/agui";

export function ChatMessage({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <div className="self-end rounded-xl rounded-br-sm bg-[var(--color-primary)] text-white px-4 py-2 max-w-[72%] text-sm whitespace-pre-wrap">
        {m.text}
      </div>
    );
  }
  return (
    <div className="self-start flex flex-col gap-2 max-w-[72%]">
      {m.thinking.length > 0 && (
        <details className="text-xs italic rounded-md bg-[var(--color-muted)] px-3 py-1 text-[var(--color-fg)]/60">
          <summary className="cursor-pointer">Thinking…</summary>
        </details>
      )}
      {m.toolCalls.map((tc) => (
        <div
          key={tc.id}
          className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs"
        >
          <div className="font-mono text-[var(--color-fg)]/60">🔧 {tc.name}</div>
          {tc.args && (
            <pre className="text-[10px] mt-1 overflow-x-auto whitespace-pre-wrap">
              {tc.args}
            </pre>
          )}
          {tc.result && (
            <pre className="text-[10px] mt-1 opacity-70 overflow-x-auto whitespace-pre-wrap">
              → {tc.result}
            </pre>
          )}
        </div>
      ))}
      {m.text && (
        <div className="prose prose-sm max-w-none rounded-xl rounded-bl-sm bg-[var(--color-muted)] text-[var(--color-fg)] px-4 py-2 text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: (p) => (
                <a
                  {...p}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                />
              ),
              code: ({ inline, children, ...p }: any) =>
                inline ? (
                  <code className="bg-[var(--color-muted)] rounded px-1 text-[0.9em]">
                    {children}
                  </code>
                ) : (
                  <pre className="bg-[var(--color-muted)] rounded p-2 text-xs overflow-x-auto">
                    <code {...p}>{children}</code>
                  </pre>
                ),
              p: (p) => <p className="last:mb-0" {...p} />,
            }}
          >
            {m.text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
