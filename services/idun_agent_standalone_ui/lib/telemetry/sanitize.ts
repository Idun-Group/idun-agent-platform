/**
 * Telemetry-safe redaction. Mirrors
 * libs/idun_agent_engine/src/idun_agent_engine/telemetry/telemetry.py
 * (sanitize_telemetry_config + _SENSITIVE_KEY_FRAGMENTS + _MAX_VALUE_LENGTH).
 * Keep this list in sync with the engine.
 */

const SENSITIVE_KEY_FRAGMENTS = [
  "api_key",
  "apikey",
  "access_key",
  "accesskey",
  "private_key",
  "privatekey",
  "secret",
  "token",
  "password",
  "passphrase",
  "client_secret",
  "clientsecret",
  "bearer",
  "authorization",
] as const;

const MAX_VALUE_LENGTH = 200;
const PRIVATE_KEY_MARKERS = ["PRIVATE KEY", "BEGIN OPENSSH PRIVATE KEY"];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function isPrivateKeyValue(value: string): boolean {
  const upper = value.toUpperCase();
  return PRIVATE_KEY_MARKERS.some((marker) => upper.includes(marker));
}

function truncate(value: string): string {
  return value.length <= MAX_VALUE_LENGTH ? value : value.slice(0, MAX_VALUE_LENGTH);
}

export function sanitize(value: unknown): unknown {
  return sanitizeWithSeen(value, new WeakSet());
}

function sanitizeWithSeen(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (isPrivateKeyValue(value)) return "[redacted]";
    return truncate(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeWithSeen(v, seen));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? "[redacted]" : sanitizeWithSeen(v, seen);
    }
    return out;
  }
  return value;
}
