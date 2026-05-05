"use client";

import "./A2UISurface.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "@a2ui/markdown-it";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import type {
  A2uiClientAction,
  A2uiMessage,
  SurfaceModel,
} from "@a2ui/web_core/v0_9";
import {
  A2uiSurface,
  MarkdownContext,
  basicCatalog,
} from "@a2ui/react/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";

import type { A2UISurfaceState } from "@/lib/agui";
import { useChatActions } from "@/lib/use-chat";

type Props = {
  surface: A2UISurfaceState;
  /**
   * True when this surface lives on the latest assistant message AND
   * chat status is "idle". Drives both CSS pointer-events and the
   * actionHandler no-op guard (defence in depth). Parent computes;
   * the wrapper just respects.
   */
  isInteractive: boolean;
};

/**
 * Owns one ``MessageProcessor`` per assistant-message-surface entry.
 * The processor lives as long as this component instance — i.e. as
 * long as the assistant message exists. Per WS2 design decision Q2.
 *
 * Two phases:
 *   1. Pre-model — processor exists but no surface has been created
 *      yet. Render null. The chat bubble's text body (above this
 *      component in MessageView) is the user-facing fallback.
 *   2. Post-model — processor.onSurfaceCreated fires for our surfaceId,
 *      we capture the SurfaceModel, and <A2uiSurface> renders.
 *
 * Replays only NEW messages on each render via lastSeenLength to
 * avoid re-processing the entire history on every chat reducer
 * update.
 */
export function A2UISurfaceWrapper({ surface, isInteractive }: Props) {
  const { sendAction } = useChatActions();

  // Closure-on-a-ref so the actionHandler always reads the latest
  // sendAction + isInteractive without recreating the MessageProcessor
  // (per WS2 design Q2: per-surface processor, lifetime = assistant
  // message). The processor takes its handler at construction time;
  // after that we route through the ref.
  const handlerRef = useRef<(a: A2uiClientAction) => void>(() => {});

  const processor = useMemo(
    () =>
      new MessageProcessor<ReactComponentImplementation>(
        [basicCatalog],
        (action) => handlerRef.current(action),
      ),
    [],
  );

  // Re-bind the handler whenever sendAction or isInteractive changes
  // (no React re-render of the processor; just an inert ref swap).
  handlerRef.current = (action) => {
    if (!isInteractive) return;
    sendAction(action, processor.getClientDataModel());
  };

  const [model, setModel] =
    useState<SurfaceModel<ReactComponentImplementation> | null>(null);
  const lastSeenLength = useRef(0);

  useEffect(() => {
    const sub = processor.onSurfaceCreated((s) => {
      if (s.id === surface.surfaceId) setModel(s);
    });
    return () => {
      sub.unsubscribe();
      processor.model.dispose();
    };
  }, [processor, surface.surfaceId]);

  useEffect(() => {
    lastSeenLength.current = 0;
  }, [processor]);

  useEffect(() => {
    const next = surface.messages.slice(lastSeenLength.current);
    if (next.length === 0) return;
    try {
      processor.processMessages(next as A2uiMessage[]);
    } catch (err) {
      console.error("[a2ui] processMessages failed", err);
    }
    // Advance past the batch even on failure — leaving the counter
    // unchanged would permanently block all subsequent messages.
    lastSeenLength.current = surface.messages.length;
  }, [processor, surface.messages]);

  if (!model) return null;
  // Tailwind preflight resets heading sizes; reapply them inside the
  // A2UI surface so Text variants ("h1"-"h5") and markdown headings
  // render with visible hierarchy. Scoped to descendants of this
  // wrapper, no global override.
  return (
    <div
      className={[
        "a2ui-surface",
        isInteractive ? "" : "pointer-events-none opacity-60",
        "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:my-2",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2",
        "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1.5",
        "[&_h4]:text-base [&_h4]:font-semibold [&_h4]:my-1.5",
        "[&_h5]:text-sm [&_h5]:font-semibold [&_h5]:my-1",
        "[&_p]:my-1",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_ul]:list-disc [&_ul]:ml-5",
        "[&_ol]:list-decimal [&_ol]:ml-5",
        "[&_a]:underline [&_a]:text-foreground",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-disabled={!isInteractive || undefined}
    >
      <MarkdownContext.Provider value={renderMarkdown}>
        <A2uiSurface surface={model} />
      </MarkdownContext.Provider>
    </div>
  );
}
