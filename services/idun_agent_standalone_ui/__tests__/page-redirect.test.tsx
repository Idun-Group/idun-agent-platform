import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import Home from "@/app/page";
import { DEFAULT_RUNTIME_CONFIG } from "@/lib/runtime-config";

const replace = vi.fn();
const routerInstance = { replace };

vi.mock("next/navigation", () => ({
  useRouter: () => routerInstance,
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/chat/BrandedLayout", () => ({
  BrandedLayout: () => <div data-testid="branded-layout" />,
}));

vi.mock("@/components/chat/MinimalLayout", () => ({
  MinimalLayout: () => <div data-testid="minimal-layout" />,
}));

vi.mock("@/components/chat/InspectorLayout", () => ({
  InspectorLayout: () => <div data-testid="inspector-layout" />,
}));

/**
 * Home reads `agentReady` + `bootReason` from `window.__IDUN_CONFIG__`
 * (seeded by /runtime-config.js) and decides:
 *   - agentReady=true → render chat,
 *   - agentReady=false + no bootReason → redirect to /onboarding (wizard),
 *   - agentReady=false + bootReason → render chat (wizard can't fix a
 *     broken-config deploy; let the eventual 503 surface).
 * Source of truth: SPEC S1.9.
 */
describe("Home (chat root)", () => {
  beforeEach(() => {
    replace.mockReset();
  });
  afterEach(() => {
    delete window.__IDUN_CONFIG__;
  });

  it("renders chat when the bootstrap reports the agent is ready", async () => {
    window.__IDUN_CONFIG__ = { ...DEFAULT_RUNTIME_CONFIG, agentReady: true };
    const { findByTestId } = render(<Home />);
    await findByTestId("branded-layout");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /onboarding on fresh install (no agent, no boot error)", async () => {
    window.__IDUN_CONFIG__ = {
      ...DEFAULT_RUNTIME_CONFIG,
      agentReady: false,
      bootReason: null,
    };
    render(<Home />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding"),
    );
  });

  it("renders chat on a broken-config deploy so the eventual 503 reaches the user", async () => {
    // Wizard can't fix assembly errors. Redirecting would loop the
    // operator through onboarding fruitlessly.
    window.__IDUN_CONFIG__ = {
      ...DEFAULT_RUNTIME_CONFIG,
      agentReady: false,
      bootReason: "Agent assembly failed: bad YAML",
    };
    const { findByTestId } = render(<Home />);
    await findByTestId("branded-layout");
    expect(replace).not.toHaveBeenCalled();
  });
});
