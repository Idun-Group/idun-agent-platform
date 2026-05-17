import { capture, reset } from "./capture";
import { Events } from "./events";

/**
 * Run the server-side logout API call, then record the AUTH_LOGOUT event and
 * reset the PostHog distinct_id. Telemetry fires from a `finally` block so a
 * failed logout still produces an event and clears local identity state.
 *
 * Returns the result of the inner promise (rethrows on failure) so callers
 * keep their existing error handling and post-logout navigation.
 */
export async function logoutWithTelemetry<T>(
  method: "basic" | "oidc",
  logout: () => Promise<T>,
): Promise<T> {
  try {
    return await logout();
  } finally {
    void capture(Events.AUTH_LOGOUT, { method });
    void reset();
  }
}
