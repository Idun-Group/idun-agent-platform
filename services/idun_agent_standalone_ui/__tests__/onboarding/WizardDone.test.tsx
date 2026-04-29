import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardDone } from "@/components/onboarding/WizardDone";
import type { AgentRead } from "@/lib/api";

const AGENT: AgentRead = {
  id: "x",
  slug: null,
  name: "Foo",
  description: null,
  version: null,
  status: "draft",
  baseUrl: null,
  baseEngineConfig: {},
  createdAt: "2026-04-29T00:00:00Z",
  updatedAt: "2026-04-29T00:00:00Z",
};

describe("WizardDone", () => {
  it("renders the agent name", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="starter"
        onGoToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/Foo is ready/i)).toBeInTheDocument();
  });

  it("starter + LANGGRAPH shows OPENAI_API_KEY reminder", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="starter"
        onGoToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/OPENAI_API_KEY/)).toBeInTheDocument();
  });

  it("starter + ADK shows GOOGLE_API_KEY reminder", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="ADK"
        mode="starter"
        onGoToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/GOOGLE_API_KEY/)).toBeInTheDocument();
  });

  it("detection mode shows the generic env reminder", () => {
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="detection"
        onGoToChat={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/make sure your agent's environment variables are set/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/OPENAI_API_KEY/)).not.toBeInTheDocument();
  });

  it("calls onGoToChat when CTA clicked", () => {
    const onGoToChat = vi.fn();
    render(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="starter"
        onGoToChat={onGoToChat}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /go to chat/i }));
    expect(onGoToChat).toHaveBeenCalled();
  });
});
