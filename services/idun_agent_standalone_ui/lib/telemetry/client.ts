import type { CaptureResult, PostHog } from "posthog-js";
import { getTelemetryConfig } from "./config";
import { sanitize } from "./sanitize";

let _client: PostHog | null = null;
let _initialized = false;

/**
 * Initialize the PostHog client once per browser session. No-op on the
 * server, no-op when telemetry is disabled, no-op on repeat calls.
 *
 * Mirrors _initialize_client() in
 * libs/idun_agent_engine/src/idun_agent_engine/telemetry/telemetry.py.
 */
export async function getClient(): Promise<PostHog | null> {
  if (typeof window === "undefined") return null;
  if (_initialized) return _client;
  _initialized = true;

  const cfg = getTelemetryConfig();
  if (!cfg.enabled) return null;

  const { default: posthog } = await import("posthog-js");
  posthog.init(cfg.projectKey, {
    api_host: cfg.host,
    capture_pageview: true,
    autocapture: true,
    persistence: "localStorage+cookie",
    disable_session_recording: !cfg.sessionReplay,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask], .ph-mask-text",
      blockSelector: "[data-ph-no-capture]",
    },
    before_send: (event: CaptureResult | null): CaptureResult | null => {
      if (event && event.properties) {
        event.properties = sanitize(event.properties) as Record<
          string,
          unknown
        >;
      }
      return event;
    },
    loaded: (ph) => {
      ph.register({
        deployment_type: cfg.deploymentType,
      });
    },
  });
  _client = posthog;
  return _client;
}

/** Test-only helper. Clears the singleton between tests. */
export function _resetClientForTests(): void {
  _client = null;
  _initialized = false;
}
