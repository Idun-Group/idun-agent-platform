import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";

import type { AgentGraph as AgentGraphIR } from "@/lib/api/types/graph";

import { AgentGraph } from "../AgentGraph";

const FIXTURE: AgentGraphIR = {
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
      model: null,
      loop_max_iterations: null,
    },
  ],
  edges: [],
};

describe("AgentGraph", () => {
  it("renders a single-node graph without crashing", () => {
    render(
      <div style={{ width: 800, height: 400 }}>
        <AgentGraph graph={FIXTURE} />
      </div>,
    );
    // The node name appears in the graph; there may also be a "root" badge chip
    expect(screen.getAllByText("root").length).toBeGreaterThanOrEqual(1);
  });

  it("exposes a handle with getCanvasElement and getNodesBounds via ref", () => {
    function Probe() {
      const ref = useRef<import("../AgentGraph").AgentGraphHandle>(null);
      return (
        <div style={{ width: 800, height: 400 }}>
          <AgentGraph ref={ref} graph={FIXTURE} />
          <button
            data-testid="probe"
            onClick={() => {
              const el = ref.current?.getCanvasElement();
              const bounds = ref.current?.getNodesBounds();
              (window as unknown as { _probe: unknown })._probe = {
                hasEl: el instanceof HTMLElement,
                bounds,
              };
            }}
          />
        </div>
      );
    }
    render(<Probe />);
    screen.getByTestId("probe").click();
    const probe = (window as unknown as { _probe: { hasEl: boolean; bounds: unknown } })._probe;
    expect(probe.hasEl).toBe(true);
    expect(probe.bounds).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });
});
