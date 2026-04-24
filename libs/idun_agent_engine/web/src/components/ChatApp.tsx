"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadSession, runAgent, stripChartPaths, type AguiMessage } from "@/lib/agui";
import { clearStoredToken, getStoredToken, getUserEmail } from "@/lib/auth";
import {
  createFrontendTools,
  indexByName,
  schemasOf,
  type FrontendTool,
} from "@/lib/frontendTools";
import type { Message, StepBadge, ToolCall } from "@/lib/types";
import MessageView from "./MessageView";
import HistorySidebar from "./HistoryDrawer";
import type { SessionSummary } from "@/lib/agui";
import { IdunMark } from "./Logos";

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^<think>[\s\S]*$/, "")
    .replace(/^\s*\n+/, "");
}

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [threadId, setThreadId] = useState<string>(() => uid());
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const confirmResolverRef = useRef<((v: boolean) => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const askConfirmation = (question: string) =>
    new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setPendingConfirm(question);
    });

  function resolveConfirmation(v: boolean) {
    confirmResolverRef.current?.(v);
    confirmResolverRef.current = null;
    setPendingConfirm(null);
  }

  const frontendTools: FrontendTool[] = useMemo(
    () => createFrontendTools({ setBackgroundColor: setBgColor, askConfirmation }),
    []
  );
  const toolSchemas = useMemo(() => schemasOf(frontendTools), [frontendTools]);
  const toolIndex = useMemo(() => indexByName(frontendTools), [frontendTools]);

  const empty = messages.length === 0;

  function resetConversation() {
    setMessages([]);
    setThreadId(uid());
  }

  function signOut() {
    clearStoredToken();
    if (typeof window !== "undefined") {
      window.google?.accounts.id.disableAutoSelect?.();
    }
    window.location.reload();
  }

  async function pickSession(id: string) {
    setLoadingSession(true);
    try {
      const detail = await loadSession(id);
      const loaded: Message[] = detail.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }));
      setMessages(loaded);
      setThreadId(detail.threadId ?? detail.id);
    } catch (e: any) {
      setMessages([
        { id: uid(), role: "assistant", content: `⚠️ ${e.message ?? "Failed to load session"}` },
      ]);
    } finally {
      setLoadingSession(false);
    }
  }

  const hasToken = typeof window !== "undefined" && !!getStoredToken();
  const email = hasToken ? getUserEmail() : null;
  const emailLocal = email ? email.split("@")[0] : null;

  useEffect(() => {
    if (!empty) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, running, empty]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const name = typeof data.agentName === "string" ? data.agentName.trim() : "";
        if (name) setAgentName(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(prompt: string) {
    if (!prompt.trim() || running) return;
    setInput("");
    const userMsg: Message = { id: uid(), role: "user", content: prompt };
    const assistantMsg: Message = {
      id: uid(),
      role: "assistant",
      content: "",
      toolCalls: [],
      steps: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setRunning(true);

    const update = (fn: (m: Message) => Message) => {
      setMessages((prev) => prev.map((x) => (x.id === assistantMsg.id ? fn(x) : x)));
    };

    let turnMessages: AguiMessage[] = [
      { id: userMsg.id, role: "user", content: prompt },
    ];

    try {
      let turn = 0;
      while (turn < 8) {
        turn += 1;
        let currentStep = "";
        const pendingFrontend: Array<{ id: string; name: string; args: string }> = [];
        const frontendToolIds = new Set<string>();

        for await (const ev of runAgent({
          threadId,
          runId: uid(),
          messages: turnMessages,
          tools: toolSchemas,
        })) {
        switch (ev.type) {
          case "STEP_STARTED": {
            const name = ev.stepName || ev.step_name;
            if (!name) break;
            currentStep = name;
            const step: StepBadge = { id: uid(), name };
            update((m) => ({ ...m, steps: [...(m.steps || []), step] }));
            break;
          }
          case "STEP_FINISHED": {
            const name = ev.stepName || ev.step_name;
            if (!name) break;
            update((m) => ({
              ...m,
              steps: (m.steps || []).map((s) =>
                s.name === name && !s.finished ? { ...s, finished: true } : s
              ),
            }));
            break;
          }
          case "TEXT_MESSAGE_CONTENT": {
            const delta = ev.delta || "";
            update((m) => ({
              ...m,
              content: stripThink((m.content || "") + delta),
            }));
            break;
          }
          case "TOOL_CALL_START": {
            const id = ev.toolCallId || ev.tool_call_id;
            const name = ev.toolCallName || ev.tool_call_name || "tool";
            const tc: ToolCall = { id, name, args: "" };
            if (toolIndex.has(name)) {
              frontendToolIds.add(id);
              pendingFrontend.push({ id, name, args: "" });
            }
            update((m) => ({ ...m, toolCalls: [...(m.toolCalls || []), tc] }));
            break;
          }
          case "TOOL_CALL_ARGS": {
            const id = ev.toolCallId || ev.tool_call_id;
            const delta = ev.delta || "";
            if (frontendToolIds.has(id)) {
              const p = pendingFrontend.find((x) => x.id === id);
              if (p) p.args += delta;
            }
            update((m) => ({
              ...m,
              toolCalls: (m.toolCalls || []).map((t) =>
                t.id === id ? { ...t, args: (t.args || "") + delta } : t
              ),
            }));
            break;
          }
          case "TOOL_CALL_END": {
            const id = ev.toolCallId || ev.tool_call_id;
            update((m) => ({
              ...m,
              toolCalls: (m.toolCalls || []).map((t) => (t.id === id ? { ...t, done: true } : t)),
            }));
            break;
          }
          case "TOOL_CALL_RESULT": {
            const id = ev.toolCallId || ev.tool_call_id;
            const content = ev.content || "";
            const text = stripChartPaths(content);
            update((m) => ({
              ...m,
              toolCalls: (m.toolCalls || []).map((t) =>
                t.id === id ? { ...t, result: text, done: true } : t
              ),
            }));
            break;
          }
          case "MESSAGES_SNAPSHOT": {
            const snap: any[] = ev.messages || [];
            const toolResults = snap.filter((x) => x.role === "tool");
            if (toolResults.length === 0) break;
            update((m) => {
              const map = new Map((m.toolCalls || []).map((t) => [t.id, t]));
              for (const tr of toolResults) {
                const existing = map.get(tr.toolCallId);
                if (existing && !existing.result) {
                  const text = stripChartPaths(tr.content || "");
                  map.set(tr.toolCallId, { ...existing, result: text, done: true });
                }
              }
              return { ...m, toolCalls: Array.from(map.values()) };
            });
            break;
          }
          case "RAW": {
            const inner = ev.event;
            if (inner?.event === "on_tool_end" && inner.data?.output) {
              const output =
                typeof inner.data.output === "string"
                  ? inner.data.output
                  : inner.data.output?.content || JSON.stringify(inner.data.output);
              update((m) => {
                const text = stripChartPaths(output);
                return {
                  ...m,
                  toolCalls: (m.toolCalls || []).map((t) =>
                    !t.result && t.done !== true ? { ...t, result: text, done: true } : t
                  ),
                };
              });
            }
            break;
          }
          case "THINKING_START": {
            update((m) => ({ ...m, thinking: true }));
            break;
          }
          case "THINKING_TEXT_MESSAGE_CONTENT": {
            const delta = ev.delta || "";
            update((m) => ({ ...m, thoughts: (m.thoughts || "") + delta, thinking: true }));
            break;
          }
          case "THINKING_END": {
            update((m) => ({ ...m, thinking: false }));
            break;
          }
          case "RUN_ERROR": {
            update((m) => ({ ...m, content: (m.content || "") + `\n\n⚠️ ${ev.message}` }));
            break;
          }
        }
      }

      if (pendingFrontend.length === 0) break;

      const results = await Promise.all(
        pendingFrontend.map(async (p) => {
          const tool = toolIndex.get(p.name);
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(p.args || "{}"); } catch { parsed = {}; }
          let result: unknown;
          try {
            result = tool ? await tool.handler(parsed) : { ok: false, error: "unknown tool" };
          } catch (e: any) {
            result = { ok: false, error: String(e?.message ?? e) };
          }
          return { toolCallId: p.id, content: JSON.stringify(result) };
        })
      );

      update((m) => ({
        ...m,
        toolCalls: (m.toolCalls || []).map((t) => {
          const r = results.find((x) => x.toolCallId === t.id);
          return r ? { ...t, result: r.content, done: true } : t;
        }),
      }));

      turnMessages = results.map((r) => ({
        id: uid(),
        role: "tool",
        toolCallId: r.toolCallId,
        content: r.content,
      }));
      }
    } catch (err: any) {
      update((m) => ({ ...m, content: (m.content || "") + `\n\n⚠️ ${err.message}` }));
    } finally {
      update((m) => ({ ...m, streaming: false }));
      setRunning(false);
      setSessionsRefreshKey((k) => k + 1);
    }
  }

  return (
    <div
      className="flex h-screen bg-canvas transition-colors duration-500"
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {hasToken && (
        <HistorySidebar
          sessions={sessions}
          setSessions={setSessions}
          error={sessionsError}
          setError={setSessionsError}
          onPick={pickSession}
          onNew={resetConversation}
          activeThreadId={messages.length > 0 ? threadId : undefined}
          refreshKey={sessionsRefreshKey}
        />
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
      {hasToken && empty && (
        <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
          {emailLocal && (
            <span className="rounded-full bg-surface/70 px-3 py-1 text-[12px] text-muted">
              {emailLocal}
            </span>
          )}
          <button
            onClick={signOut}
            className="rounded-full border border-rule bg-surface/70 px-3.5 py-1.5 text-[12.5px] font-medium text-muted transition hover:border-ink/20 hover:text-ink"
            title="Clear token and return to the login screen"
          >
            Sign out
          </button>
        </div>
      )}
      {empty ? (
        <div className="relative z-10 flex flex-1 items-center justify-center px-6">
          <div className="halo" />
          <div className="relative w-full max-w-3xl">
            <Welcome
              agentName={agentName}
              input={input}
              setInput={setInput}
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              running={running}
            />
          </div>
        </div>
      ) : (
        <>
          <header className="relative z-10">
            <div className="mx-auto flex max-w-[720px] items-center justify-between px-6 pt-6 pb-4">
              <IdunMark className="h-9" />
              <div className="flex items-center gap-2">
                {emailLocal && (
                  <span className="hidden rounded-full bg-surface/70 px-3 py-1 text-[12px] text-muted sm:inline">
                    {emailLocal}
                  </span>
                )}
                <button
                  onClick={resetConversation}
                  className="rounded-full border border-rule bg-surface/70 px-3.5 py-1.5 text-[12.5px] font-medium text-muted transition hover:border-ink/20 hover:text-ink"
                >
                  New conversation
                </button>
                {hasToken && (
                  <button
                    onClick={signOut}
                    className="rounded-full border border-rule bg-surface/70 px-3.5 py-1.5 text-[12.5px] font-medium text-muted transition hover:border-ink/20 hover:text-ink"
                    title="Clear token and return to the login screen"
                  >
                    Sign out
                  </button>
                )}
              </div>
            </div>
            <div className="mx-auto max-w-[720px] px-6">
              <div className="hairline" />
            </div>
          </header>

          <div ref={scrollRef} className="scroll-fade relative z-10 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[720px] px-6 py-8">
              <div className="space-y-6">
                {messages.map((m) => (
                  <MessageView key={m.id} m={m} />
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 bg-gradient-to-t from-canvas via-canvas/90 to-canvas/0 pb-5 pt-3">
            <div className="mx-auto max-w-[720px] px-6">
              <ChatInput
                input={input}
                setInput={setInput}
                onSubmit={(e) => { e.preventDefault(); send(input); }}
                running={running}
                agentName={agentName ?? undefined}
              />
            </div>
          </div>
        </>
      )}

      {loadingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80">
          <span className="pulse-dot" />
        </div>
      )}

      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rule bg-surface p-6 shadow-lift">
            <p className="font-serif text-[20px] leading-snug text-ink">{pendingConfirm}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => resolveConfirmation(false)}
                className="rounded-full border border-rule bg-surface px-4 py-2 text-[13px] font-medium text-muted transition hover:border-ink/30 hover:text-ink"
              >
                No
              </button>
              <button
                onClick={() => resolveConfirmation(true)}
                className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-canvas transition hover:bg-accent"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Welcome({
  agentName,
  input,
  setInput,
  onSubmit,
  running,
}: {
  agentName: string | null;
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  running: boolean;
}) {
  const name = agentName || "Idun Agent";
  return (
    <div className="welcome-reveal text-center">
      <div className="mb-10 flex items-center justify-center">
        <IdunMark className="h-20" />
      </div>
      <h1 className="mb-10 font-serif text-[44px] leading-[1.1] font-medium tracking-[-0.02em] text-ink">
        Hi, I&rsquo;m <span className="italic text-accent">{name}</span>
      </h1>
      <div className="mx-auto">
        <ChatInput
          input={input}
          setInput={setInput}
          onSubmit={onSubmit}
          running={running}
          agentName={name}
        />
      </div>
    </div>
  );
}

function ChatInput({
  input,
  setInput,
  onSubmit,
  running,
  agentName,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  running: boolean;
  agentName?: string;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="relative rounded-3xl border border-rule bg-surface shadow-soft transition focus-within:border-accent/40 focus-within:shadow-lift"
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e);
          }
        }}
        placeholder={`Message ${agentName || "the agent"}\u2026`}
        rows={1}
        className="w-full resize-none rounded-3xl bg-transparent px-6 py-4 pr-16 text-[17px] leading-6 text-ink placeholder:text-muted focus:outline-none"
        style={{ minHeight: "80px" }}
        disabled={running}
      />
      <button
        type="submit"
        disabled={!input.trim() || running}
        className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-canvas transition hover:bg-accent disabled:opacity-40"
        aria-label="Send"
      >
        {running ? <span className="pulse-dot" /> : <ArrowUp />}
      </button>
    </form>
  );
}

function ArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
