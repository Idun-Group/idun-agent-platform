import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SpanDetailRail } from "@/components/traces/SpanDetailRail";
import type { StandaloneSpanRead } from "@/lib/api/traces";

function makeSpan(overrides: Partial<StandaloneSpanRead> = {}): StandaloneSpanRead {
  return {
    otelSpanId: "00000000",
    otelTraceId: "ffffffff",
    parentSpanId: null,
    name: "llm.call",
    kind: "LLM",
    startedAt: "2026-05-09T12:00:00.000Z",
    endedAt: "2026-05-09T12:00:01.000Z",
    latencyMs: 1234,
    model: "gpt-4o",
    provider: "openai",
    promptTokens: 100,
    completionTokens: 200,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    totalTokens: 300,
    costUsd: 0.0123,
    costBreakdown: null,
    costSource: "model_pricing",
    status: "OK",
    attributes: {
      "input.value": JSON.stringify([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ]),
      "output.value": JSON.stringify({ text: "Hi there!" }),
      "llm.model_name": "gpt-4o",
    },
    events: [
      {
        name: "first_token",
        timestamp: "2026-05-09T12:00:00.500Z",
        latency_ms: 500,
      },
    ],
    ...overrides,
  };
}

describe("SpanDetailRail", () => {
  it("renders the empty-state when no span is selected", () => {
    render(<SpanDetailRail span={null} />);
    expect(
      screen.getByText(/select a span to view its details/i),
    ).toBeInTheDocument();
  });

  it("renders the sticky header with the span name and kind badge", () => {
    render(<SpanDetailRail span={makeSpan()} />);
    // The header carries the span name (and the Info dl row repeats it,
    // hence getAllByText).
    expect(screen.getAllByText("llm.call").length).toBeGreaterThanOrEqual(1);
    // The badge in the header echoes the kind enum.
    const badges = screen.getAllByText("LLM");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Info tab with model, provider, latency, tokens, and cost", () => {
    render(<SpanDetailRail span={makeSpan()} />);
    // Info is the default tab so its dl rows are visible immediately.
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("1,234ms")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    // No partial-cost hint when cost_breakdown is null.
    expect(screen.queryByTestId("streaming-cost-hint")).toBeNull();
  });

  it("prefixes cost with ~ and renders the streaming hint when costBreakdown.partial is true", () => {
    render(
      <SpanDetailRail
        span={makeSpan({ costBreakdown: { partial: true } })}
      />,
    );
    expect(screen.getByText("~$0.0123")).toBeInTheDocument();
    expect(screen.getByTestId("streaming-cost-hint")).toBeInTheDocument();
  });

  it("switches to the Input tab and renders chat bubbles by default (Pretty)", async () => {
    const user = userEvent.setup();
    render(<SpanDetailRail span={makeSpan()} />);
    await user.click(screen.getByRole("tab", { name: "Input" }));
    // The system message is rendered in a chat bubble.
    expect(
      screen.getByText("You are a helpful assistant."),
    ).toBeInTheDocument();
    expect(screen.getByText("Hello!")).toBeInTheDocument();
    // Pretty button has aria-pressed=true; Raw is unpressed.
    expect(screen.getByRole("button", { name: "Pretty" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Raw" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggles Input from Pretty to Raw and back via the segmented control", async () => {
    const user = userEvent.setup();
    render(<SpanDetailRail span={makeSpan()} />);
    await user.click(screen.getByRole("tab", { name: "Input" }));

    await user.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByRole("button", { name: "Raw" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // After flipping to Raw, the chat-bubbles container is no longer
    // mounted — the JSON tree viewer renders instead.
    expect(screen.queryByTestId("chat-bubbles")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Pretty" }));
    expect(screen.getByRole("button", { name: "Pretty" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Pretty is back — chat-bubbles container is mounted again.
    expect(screen.getByTestId("chat-bubbles")).toBeInTheDocument();
    expect(screen.getAllByTestId("chat-bubble")).toHaveLength(2);
  });

  it("renders the Events tab content when events are present", async () => {
    const user = userEvent.setup();
    render(<SpanDetailRail span={makeSpan()} />);
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(screen.getByText("first_token")).toBeInTheDocument();
  });

  it("renders the Events empty-state copy when no events are recorded", async () => {
    const user = userEvent.setup();
    render(<SpanDetailRail span={makeSpan({ events: null })} />);
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(
      screen.getByText(/no events recorded for this span/i),
    ).toBeInTheDocument();
  });

  it("invokes onClose when the close button is clicked (mobile path)", () => {
    const onClose = vi.fn();
    render(<SpanDetailRail span={makeSpan()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close span detail/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
