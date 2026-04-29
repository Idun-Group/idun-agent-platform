import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardManyDetected } from "@/components/onboarding/WizardManyDetected";
import type { DetectedAgent } from "@/lib/api";

const detections: DetectedAgent[] = [
  {
    framework: "ADK",
    filePath: "main_adk.py",
    variableName: "agent",
    inferredName: "B Agent",
    confidence: "MEDIUM",
    source: "source",
  },
  {
    framework: "LANGGRAPH",
    filePath: "agent.py",
    variableName: "graph",
    inferredName: "A Agent",
    confidence: "HIGH",
    source: "source",
  },
];

describe("WizardManyDetected", () => {
  it("renders the title with the count", () => {
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(screen.getByText(/pick your agent/i)).toBeInTheDocument();
    expect(screen.getByText(/2 agents/i)).toBeInTheDocument();
  });

  it("sorts: HIGH confidence first, then LANGGRAPH first, then by name", () => {
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole("radio");
    // First row should be the LANGGRAPH HIGH detection ("A Agent").
    // First row's radio value is the unique "filePath:variableName" key of
    // the LANGGRAPH HIGH detection (sorted to the top).
    expect(rows[0]).toHaveAttribute("value", "agent.py:graph");
    const aAgentText = screen.getByText("A Agent");
    const bAgentText = screen.getByText("B Agent");
    // A Agent should appear before B Agent in the document order.
    expect(
      aAgentText.compareDocumentPosition(bAgentText) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Use selected agent is disabled until a row is picked", () => {
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={vi.fn()}
        onRescan={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /use selected/i }),
    ).toBeDisabled();
  });

  it("calls onConfirm with the picked detection", () => {
    const onConfirm = vi.fn();
    render(
      <WizardManyDetected
        detections={detections}
        onConfirm={onConfirm}
        onRescan={vi.fn()}
      />,
    );
    // Click the radio for "B Agent" (the second in sorted order).
    fireEvent.click(screen.getByLabelText(/B Agent/));
    fireEvent.click(screen.getByRole("button", { name: /use selected/i }));
    // B Agent is the ADK MEDIUM detection.
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ inferredName: "B Agent" }),
    );
  });
});
