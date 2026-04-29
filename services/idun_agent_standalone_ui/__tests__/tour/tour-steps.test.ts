import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "@/components/tour/tour-steps";

describe("TOUR_STEPS", () => {
  it("has exactly 5 steps", () => {
    expect(TOUR_STEPS).toHaveLength(5);
  });

  it("step 0 is the chat-composer step on /", () => {
    expect(TOUR_STEPS[0].route).toBe("/");
    expect(TOUR_STEPS[0].element).toBe('[data-tour="chat-composer"]');
    expect(TOUR_STEPS[0].popover.title).toBe("Chat");
    expect(TOUR_STEPS[0].popover.description).toBe(
      "This is where you test your agent. Send a message to confirm it is running through Idun.",
    );
  });

  it("steps 1-3 share the /admin/agent route", () => {
    expect(TOUR_STEPS[1].route).toBe("/admin/agent");
    expect(TOUR_STEPS[2].route).toBe("/admin/agent");
    expect(TOUR_STEPS[3].route).toBe("/admin/agent");
  });

  it("step 1 anchors on the sidebar Configuration item", () => {
    expect(TOUR_STEPS[1].element).toBe('[data-tour="sidebar-agent-config"]');
    expect(TOUR_STEPS[1].popover.title).toBe("Admin config");
    expect(TOUR_STEPS[1].popover.description).toBe(
      "Admin lets you inspect and manage the active config for this standalone agent.",
    );
  });

  it("step 2 anchors on the sidebar Agent group label", () => {
    expect(TOUR_STEPS[2].element).toBe('[data-tour="sidebar-agent-group"]');
    expect(TOUR_STEPS[2].popover.title).toBe("Prompts, tools, and guardrails");
    expect(TOUR_STEPS[2].popover.description).toBe(
      "When you are ready, add prompts, tools, and guardrails to make the agent safer and more useful.",
    );
  });

  it("step 3 anchors on the sidebar Observability item", () => {
    expect(TOUR_STEPS[3].element).toBe('[data-tour="sidebar-observability"]');
    expect(TOUR_STEPS[3].popover.title).toBe("Observability");
    expect(TOUR_STEPS[3].popover.description).toBe(
      "Later, connect observability providers to follow your agent beyond local traces.",
    );
  });

  it("step 4 is a modal-only deployment step (no element, no route)", () => {
    expect(TOUR_STEPS[4].element).toBeUndefined();
    expect(TOUR_STEPS[4].route).toBeUndefined();
    expect(TOUR_STEPS[4].popover.title).toBe("Deployment");
    expect(TOUR_STEPS[4].popover.description).toContain("Docker or Cloud Run");
  });

  it("every step has non-empty title and description", () => {
    for (const step of TOUR_STEPS) {
      expect(step.popover.title.length).toBeGreaterThan(0);
      expect(step.popover.description.length).toBeGreaterThan(0);
    }
  });
});
