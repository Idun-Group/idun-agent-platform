"use client";

import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

/**
 * Catches render errors inside an A2UI surface so a renderer bug
 * (e.g., a malformed component tree from the agent, a regression in
 * @a2ui/react) doesn't crash the whole chat bubble.
 *
 * On error: logs to console.error with the standard ``[a2ui]`` prefix
 * for searchability, returns null so the surrounding markdown text
 * (which renders ABOVE the surface in MessageView) stays visible.
 *
 * Per WS2 design decision Q5 — we DO NOT show an inline error
 * indicator in the chat. Devs find errors via console; end users
 * see only the assistant's text response.
 */
export class A2UISurfaceErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[a2ui] surface render failed", error, info);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
