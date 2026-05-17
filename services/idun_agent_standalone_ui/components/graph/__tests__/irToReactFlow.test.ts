import { describe, expect, it } from "vitest";

import type { AgentGraph } from "@/lib/api/types/graph";
import { irToReactFlow } from "../irToReactFlow";

const SAMPLE: AgentGraph = {
  format_version: "1",
  metadata: {
    framework: "ADK",
    agent_name: "root",
    root_id: "agent:root",
    warnings: [],
  },
  nodes: [
    {
      kind: "agent",
      id: "agent:root",
      name: "root",
      agent_kind: "llm",
      is_root: true,
      description: null,
      model: "gemini-2.5-flash",
      loop_max_iterations: null,
    },
    {
      kind: "tool",
      id: "tool:search@root",
      name: "search",
      tool_kind: "mcp",
      description: null,
      mcp_server_name: "stdio: x",
    },
  ],
  edges: [
    {
      source: "agent:root",
      target: "tool:search@root",
      kind: "tool_attach",
      order: null,
      condition: null,
      label: null,
    },
  ],
};

describe("irToReactFlow", () => {
  it("maps every IR node to one ReactFlow node with the IR id", () => {
    const { nodes } = irToReactFlow(SAMPLE);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["agent:root", "tool:search@root"].sort(),
    );
  });

  it("uses 'agent' / 'tool' for ReactFlow node types", () => {
    const { nodes } = irToReactFlow(SAMPLE);
    expect(nodes.find((n) => n.id === "agent:root")?.type).toBe("agent");
    expect(nodes.find((n) => n.id === "tool:search@root")?.type).toBe("tool");
  });

  it("maps every IR edge to one ReactFlow edge", () => {
    const { edges } = irToReactFlow(SAMPLE);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "agent:root",
      target: "tool:search@root",
      type: "pretty",
    });
  });
});
