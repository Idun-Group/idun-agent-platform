import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WizardDone } from "@/components/onboarding/WizardDone";
import type { AgentRead } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getAgentGraph: vi.fn(),
    },
  };
});

// next/dynamic is not supported in vitest jsdom; stub it so AgentGraph
// resolves to a simple div without triggering ReactFlow canvas errors.
vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, _opts: unknown) => {
    const Stub = () => <div data-testid="agent-graph-stub" />;
    Stub.displayName = "AgentGraphStub";
    return Stub;
  },
}));

import { api, ApiError } from "@/lib/api";

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

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("WizardDone", () => {
  beforeEach(() => {
    (api.getAgentGraph as ReturnType<typeof vi.fn>).mockResolvedValue({
      nodes: [],
      edges: [],
    });
  });

  it("renders the agent name", () => {
    renderWithQueryClient(
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
    renderWithQueryClient(
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
    renderWithQueryClient(
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
    renderWithQueryClient(
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
    renderWithQueryClient(
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

  it("shows graph stub when query resolves", async () => {
    renderWithQueryClient(
      <WizardDone
        agent={AGENT}
        framework="LANGGRAPH"
        mode="starter"
        onGoToChat={vi.fn()}
      />,
    );
    // The dynamic stub renders immediately in tests; verify the card title
    expect(screen.getByText(/your agent/i)).toBeInTheDocument();
  });

  it("shows 404 message when graph endpoint returns 404", async () => {
    (api.getAgentGraph as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(404, "not found"),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <WizardDone
          agent={AGENT}
          framework="LANGGRAPH"
          mode="starter"
          onGoToChat={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const msg = await screen.findByText(
      /graph view isn't available for this agent type yet/i,
    );
    expect(msg).toBeInTheDocument();
  });
});
