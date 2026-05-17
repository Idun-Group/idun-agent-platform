import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTelemetryConfig } from "../config";
import { makeRuntimeConfig } from "@/__tests__/helpers/runtime-config-fixture";

const ORIGINAL_WINDOW_CONFIG = window.__IDUN_CONFIG__;

afterEach(() => {
  window.__IDUN_CONFIG__ = ORIGINAL_WINDOW_CONFIG;
});

describe("getTelemetryConfig", () => {
  it("returns the runtime telemetry block when present", () => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: true,
        host: "https://eu.i.posthog.com",
        projectKey: "phc_test",
        deploymentType: "self-hosted",
        identifyUsers: false,
        sessionReplay: false,
      },
    });
    const cfg = getTelemetryConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.host).toBe("https://eu.i.posthog.com");
    expect(cfg.identifyUsers).toBe(false);
    expect(cfg.sessionReplay).toBe(false);
  });

  it("falls back to defaults when window.__IDUN_CONFIG__ is missing", () => {
    delete window.__IDUN_CONFIG__;
    const cfg = getTelemetryConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.deploymentType).toBe("dev");
  });

  it("returns enabled=false when the runtime block disables it", () => {
    window.__IDUN_CONFIG__ = makeRuntimeConfig({
      telemetry: {
        enabled: false,
        host: "https://us.i.posthog.com",
        projectKey: "phc_test",
        deploymentType: "cloud",
        identifyUsers: true,
        sessionReplay: true,
      },
    });
    expect(getTelemetryConfig().enabled).toBe(false);
  });
});
