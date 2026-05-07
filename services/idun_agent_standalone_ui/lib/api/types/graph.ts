/**
 * TypeScript mirror of idun_agent_schema.engine.graph (Pydantic).
 *
 * The schema package is the source of truth — when those models change, this
 * file must follow. Discriminated unions on `kind`.
 */

export type AgentKind =
  | "llm"
  | "sequential"
  | "parallel"
  | "loop"
  | "custom";

export type ToolKind = "native" | "mcp" | "built_in";

export type EdgeKind =
  | "parent_child"
  | "sequential_step"
  | "parallel_branch"
  | "loop_step"
  | "tool_attach"
  | "graph_edge";

// `extends Record<string, unknown>` satisfies @xyflow/react v12's
// `Node<TData extends Record<string, unknown>>` / `Edge<TData ...>`
// generic constraint when these types are used as ReactFlow payloads.
// Doesn't change the wire shape — Pydantic emits the same JSON.

export interface AgentNode extends Record<string, unknown> {
  kind: "agent";
  id: string;
  name: string;
  agent_kind: AgentKind;
  is_root: boolean;
  description: string | null;
  model: string | null;
  loop_max_iterations: number | null;
}

export interface ToolNode extends Record<string, unknown> {
  kind: "tool";
  id: string;
  name: string;
  tool_kind: ToolKind;
  description: string | null;
  mcp_server_name: string | null;
}

export type AgentGraphNode = AgentNode | ToolNode;

export interface AgentGraphEdge extends Record<string, unknown> {
  source: string;
  target: string;
  kind: EdgeKind;
  order: number | null;
  condition: string | null;
  label: string | null;
}

export interface AgentGraphMetadata {
  framework: "LANGGRAPH" | "ADK" | "HAYSTACK";
  agent_name: string;
  root_id: string;
  warnings: string[];
}

export interface AgentGraph {
  format_version: "1";
  metadata: AgentGraphMetadata;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
}
