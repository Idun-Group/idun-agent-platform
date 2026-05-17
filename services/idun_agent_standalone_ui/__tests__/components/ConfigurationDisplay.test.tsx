import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ConfigurationDisplay } from "@/components/admin/ConfigurationDisplay";

// AgentRead has many required fields per
// services/idun_agent_standalone_ui/lib/api/types/agent.ts. A helper
// keeps the per-test override surface small while still satisfying the
// type checker.
const baseAgent = {
  id: "singleton",
  slug: null,
  name: "My Agent",
  description: "Customer support",
  version: null,
  status: "live" as const,
  baseUrl: null,
  baseEngineConfig: {
    agent: {
      type: "LANGGRAPH",
      config: { graph_definition: "./graph.py:app" },
    },
  } as Record<string, unknown>,
  createdAt: "2026-05-11T10:00:00Z",
  updatedAt: "2026-05-11T10:00:00Z",
};

describe("ConfigurationDisplay", () => {
  it("renders langgraph identity and definition", () => {
    render(<ConfigurationDisplay agent={baseAgent} />);
    expect(screen.getByText("My Agent")).toBeInTheDocument();
    expect(screen.getByText("Customer support")).toBeInTheDocument();
    expect(screen.getByText("./graph.py:app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/admin/agent",
    );
  });

  it("renders adk identity and agent path", () => {
    render(
      <ConfigurationDisplay
        agent={{
          ...baseAgent,
          name: "Vertex Agent",
          description: null,
          baseEngineConfig: {
            agent: {
              type: "ADK",
              config: { agent: "./agent.py:root_agent" },
            },
          },
        }}
      />,
    );
    expect(screen.getByText("Vertex Agent")).toBeInTheDocument();
    expect(screen.getByText("./agent.py:root_agent")).toBeInTheDocument();
  });
});
