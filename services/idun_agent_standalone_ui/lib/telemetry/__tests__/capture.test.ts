import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRuntimeConfig } from "@/__tests__/helpers/runtime-config-fixture";

vi.mock("posthog-js", async () => {
  const mod = await import("./__mocks__/posthog-js");
  return { default: mod.default, __mock: mod.__mock };
});

import { capture, identify, reset } from "../capture";
import { _resetClientForTests } from "../client";
import * as posthogModule from "posthog-js";

const mock = (posthogModule as unknown as { __mock: Record<string, ReturnType<typeof vi.fn>> }).__mock;

beforeEach(() => {
  _resetClientForTests();
  Object.values(mock).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  delete window.__IDUN_CONFIG__;
});

describe("capture()", () => {
  it("is a no-op when telemetry is disabled", async () => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: false,
        host: "https://us.i.posthog.com",
        projectKey: "phc_t",
        deploymentType: "dev",
        identifyUsers: false,
        sessionReplay: false,
      },
    });
    await capture("agent.run.started", { agent_id: "a", session_id: "s", message_index: 1 });
    expect(mock.init).not.toHaveBeenCalled();
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("forwards the event when enabled and sanitizes properties", async () => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: true,
        host: "https://us.i.posthog.com",
        projectKey: "phc_t",
        deploymentType: "self-hosted",
        identifyUsers: true,
        sessionReplay: true,
      },
    });
    await capture("agent.run.started", {
      agent_id: "agent-1",
      session_id: "sess-1",
      message_index: 3,
      api_key: "shouldNotBeSent",
    } as unknown as Parameters<typeof capture>[1]);
    expect(mock.init).toHaveBeenCalledTimes(1);
    expect(mock.capture).toHaveBeenCalledWith("agent.run.started", {
      agent_id: "agent-1",
      session_id: "sess-1",
      message_index: 3,
      api_key: "[redacted]",
    });
  });
});

describe("identify() / reset()", () => {
  beforeEach(() => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: true,
        host: "https://us.i.posthog.com",
        projectKey: "phc_t",
        deploymentType: "self-hosted",
        identifyUsers: true,
        sessionReplay: true,
      },
    });
  });

  it("identify() calls posthog.identify with the distinct id and traits", async () => {
    await identify("user@example.com", { sso_provider: "okta" });
    expect(mock.identify).toHaveBeenCalledWith("user@example.com", {
      sso_provider: "okta",
    });
  });

  it("identify() is skipped when identifyUsers=false", async () => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: true,
        host: "https://us.i.posthog.com",
        projectKey: "phc_t",
        deploymentType: "self-hosted",
        identifyUsers: false,
        sessionReplay: true,
      },
    });
    await identify("user@example.com");
    expect(mock.identify).not.toHaveBeenCalled();
  });

  it("reset() forwards to posthog.reset", async () => {
    await reset();
    expect(mock.reset).toHaveBeenCalled();
  });
});
