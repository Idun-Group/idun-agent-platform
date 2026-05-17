import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRuntimeConfig } from "./helpers/runtime-config-fixture";

const captureMock = vi.fn();
const identifyMock = vi.fn();
const resetMock = vi.fn();

// Mock the telemetry barrel so we don't need to thread a fake posthog through.
vi.mock("@/lib/telemetry", () => ({
  capture: (...args: unknown[]) => captureMock(...args),
  identify: (...args: unknown[]) => identifyMock(...args),
  reset: (...args: unknown[]) => resetMock(...args),
}));

// Mock useAuth so we can drive the auth state transition manually.
let mockUser: { email: string } | null = null;
vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({ data: mockUser, isLoading: false }),
}));

import { PostHogProvider } from "@/components/providers/PostHogProvider";

beforeEach(() => {
  captureMock.mockReset();
  identifyMock.mockReset();
  resetMock.mockReset();
  mockUser = null;
});

afterEach(() => {
  delete window.__IDUN_CONFIG__;
});

describe("PostHogProvider", () => {
  it("does not call identify when user is anonymous", () => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: true,
        host: "https://us.i.posthog.com",
        projectKey: "phc_t",
        deploymentType: "dev",
        identifyUsers: true,
        sessionReplay: true,
      },
    });
    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>,
    );
    expect(identifyMock).not.toHaveBeenCalled();
  });

  it("calls identify(email) when user logs in", () => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: true,
        host: "https://us.i.posthog.com",
        projectKey: "phc_t",
        deploymentType: "dev",
        identifyUsers: true,
        sessionReplay: true,
      },
    });
    mockUser = { email: "alice@example.com" };
    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>,
    );
    expect(identifyMock).toHaveBeenCalledWith("alice@example.com", expect.any(Object));
  });
});
