"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import type { A2uiMessage, SurfaceModel } from "@a2ui/web_core/v0_9";
import { A2uiSurface, basicCatalog } from "@a2ui/react/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";

import type { A2UISurfaceState } from "@/lib/agui";

type Props = { surface: A2UISurfaceState };

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
export function A2UISurfaceWrapper({ surface }: Props) {
  const processor = useMemo(
    () => new MessageProcessor<ReactComponentImplementation>([basicCatalog]),
    [],
  );

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
    const next = surface.messages.slice(lastSeenLength.current);
    if (next.length === 0) return;
    try {
      processor.processMessages(next as A2uiMessage[]);
      lastSeenLength.current = surface.messages.length;
    } catch (err) {
      console.error("[a2ui] processMessages failed", err);
    }
  }, [processor, surface.messages]);

  if (!model) return null;
  return <A2uiSurface surface={model} />;
}
