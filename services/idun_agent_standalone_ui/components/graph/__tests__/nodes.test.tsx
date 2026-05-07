import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type {
  AgentNode as AgentNodeData,
  ToolNode as ToolNodeData,
} from "@/lib/api/types/graph";

import { AgentNode } from "../nodes/AgentNode";
import { ToolNode } from "../nodes/ToolNode";

const wrap = (ui: React.ReactNode) =>
  render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe("AgentNode", () => {
  it("renders name, kind chip, and root indicator", () => {
    const data: AgentNodeData = {
      kind: "agent",
      id: "agent:root",
      name: "support_agent",
      agent_kind: "llm",
      is_root: true,
      description: null,
      model: "gemini-2.5-flash",
      loop_max_iterations: null,
    };
    wrap(<AgentNode data={data} id={data.id} selected={false} />);
    expect(screen.getByText("support_agent")).toBeInTheDocument();
    expect(screen.getByText(/LlmAgent/i)).toBeInTheDocument();
    expect(screen.getByText(/root/i)).toBeInTheDocument();
  });
});

describe("ToolNode", () => {
  it("renders MCP server name when tool_kind=mcp", () => {
    const data: ToolNodeData = {
      kind: "tool",
      id: "tool:search@root",
      name: "search_faq",
      tool_kind: "mcp",
      description: null,
      mcp_server_name: "stdio: npx server-filesystem",
    };
    wrap(<ToolNode data={data} id={data.id} selected={false} />);
    expect(screen.getByText("search_faq")).toBeInTheDocument();
    expect(screen.getByText(/stdio: npx server-filesystem/)).toBeInTheDocument();
  });
});
