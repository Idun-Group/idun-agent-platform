import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/agui";

const MARKDOWN_COMPONENTS: Components = {
  a: (p) => (
    <a
      {...p}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    />
  ),
  code: ({ className, children, node, ...rest }) => {
    // react-markdown v10 dropped the `inline` prop. We detect inline by the
    // absence of a language- className (block code is always wrapped in a
    // <pre> and gets a fenced className from remark-gfm); the parent <pre>
    // emits its own component so we don't double-wrap here.
    const isInline = !className || !/language-/.test(className);
    if (isInline) {
      return (
        <code className="bg-[var(--color-muted)] rounded px-1 text-[0.9em]">
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-[var(--color-muted)] rounded p-2 text-xs overflow-x-auto">
      {children}
    </pre>
  ),
  p: (p) => <p className="last:mb-0" {...p} />,
};

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
          {m.thinking.map((block, i) => (
            <pre
              key={i}
              className="mt-1 whitespace-pre-wrap text-[10px] not-italic"
            >
              {block}
            </pre>
          ))}
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
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {m.text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
