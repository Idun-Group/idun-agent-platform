import { getClient } from "./client";
import { getTelemetryConfig } from "./config";
import { sanitize } from "./sanitize";
import type { EventName } from "./events";

type Props = Record<string, unknown>;

/**
 * Emit a typed event. No-op when telemetry is disabled.
 * Sanitizes props at the boundary as a defense-in-depth layer over
 * `before_send` in client init.
 */
export async function capture(name: EventName, props?: Props): Promise<void> {
  const ph = await getClient();
  if (!ph) return;
  const safe = props ? (sanitize(props) as Props) : undefined;
  try {
    ph.capture(name, safe);
  } catch (err) {
    console.warn("[telemetry] capture failed", err);
  }
}

/**
 * Identify the current user. No-op when telemetry is disabled or when the
 * runtime config has set identifyUsers=false (procurement knob).
 */
export async function identify(distinctId: string, traits?: Props): Promise<void> {
  const cfg = getTelemetryConfig();
  if (!cfg.identifyUsers) return;
  const ph = await getClient();
  if (!ph) return;
  const safe = traits ? (sanitize(traits) as Props) : undefined;
  try {
    ph.identify(distinctId, safe);
  } catch (err) {
    console.warn("[telemetry] identify failed", err);
  }
}

/** Clear identified state (e.g. on logout). */
export async function reset(): Promise<void> {
  const ph = await getClient();
  if (!ph) return;
  try {
    ph.reset();
  } catch (err) {
    console.warn("[telemetry] reset failed", err);
  }
}
