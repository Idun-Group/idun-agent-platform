import {
  DEFAULT_RUNTIME_CONFIG,
  type TelemetryConfig,
} from "@/lib/runtime-config";

/**
 * Read the telemetry block from window.__IDUN_CONFIG__ (populated by the
 * backend's /runtime-config.js before React hydration). Falls back to the
 * SSR-safe DEFAULT_RUNTIME_CONFIG.telemetry (enabled=false) when missing.
 *
 * Mirrors libs/idun_agent_engine/src/idun_agent_engine/telemetry/config.py.
 */
export function getTelemetryConfig(): TelemetryConfig {
  if (typeof window === "undefined") {
    return DEFAULT_RUNTIME_CONFIG.telemetry;
  }
  return window.__IDUN_CONFIG__?.telemetry ?? DEFAULT_RUNTIME_CONFIG.telemetry;
}
