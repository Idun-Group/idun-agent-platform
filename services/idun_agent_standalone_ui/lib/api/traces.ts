/**
 * Typed wrappers for /admin/api/v1/traces.
 *
 * Hand-rolled types mirroring libs/idun_agent_schema/src/idun_agent_schema/
 * standalone/traces.py (the StandaloneTrace and StandaloneSpan models).
 * The backend uses `to_camel` alias generator with `populate_by_name=True`,
 * so the wire format is camelCase — these TS interfaces match the JSON
 * keys exactly.
 *
 * All fetchers go through the shared `apiFetch` from `./client`, the same
 * wrapper the rest of the admin pages use (cookie credentials, SSO
 * bearer header, 401 redirect, ApiError envelope).
 */

import { apiFetch } from "./client";

// ── Types ───────────────────────────────────────────────────────────────

/**
 * One row in `GET /admin/api/v1/traces`.
 *
 * `otelTraceId` is the lowercase hex encoding of the 16-byte W3C trace
 * id; the DB stores raw bytes and the router converts at the boundary.
 */
export type StandaloneTraceListItem = {
  otelTraceId: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  latencyMs: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
  models: string[];
  status: string | null;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
};

/**
 * One span row from `standalone_span`.
 *
 * `otelSpanId` and `parentSpanId` are 8-byte hex strings. `otelTraceId`
 * is the trailing 8-byte slice of the parent trace id (the span table
 * stores half — see the exporter).
 */
export type StandaloneSpanRead = {
  otelSpanId: string;
  otelTraceId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  startedAt: string;
  endedAt: string | null;
  latencyMs: number | null;
  model: string | null;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  costBreakdown: Record<string, unknown> | null;
  costSource: string | null;
  status: string | null;
  attributes: Record<string, unknown> | null;
  events: Array<Record<string, unknown>> | null;
};

/**
 * Recursive node carrying a span and its children. Depth capped at 32
 * by the router (see schema `§28`).
 */
export type StandaloneSpanTreeNode = {
  span: StandaloneSpanRead;
  children: StandaloneSpanTreeNode[];
};

/** Body of `GET /admin/api/v1/traces/{otelTraceId}`. */
export type StandaloneTraceDetail = {
  trace: StandaloneTraceListItem;
  tree: StandaloneSpanTreeNode[];
};

/**
 * Query filters for `GET /admin/api/v1/traces`.
 *
 * Pagination is cursor-based on `(startedAt DESC, otelTraceId)`; the
 * `cursor` is an opaque base64url payload the router round-trips.
 */
export type StandaloneTraceListFilters = {
  startedAfter?: string;
  startedBefore?: string;
  model?: string;
  status?: string;
  userId?: string;
  sessionId?: string;
  nameContains?: string;
  limit?: number;
  cursor?: string;
};

/** Filter shape for bulk delete — mirrors list filters minus pagination. */
export type StandaloneTraceBulkDeleteFilters = Omit<
  StandaloneTraceListFilters,
  "limit" | "cursor"
>;

/** List response envelope. `nextCursor` is `null` on the last page. */
export type StandaloneTraceListResponse = {
  items: StandaloneTraceListItem[];
  nextCursor: string | null;
  totalEstimate: number | null;
};

/**
 * Body of `GET /admin/api/v1/traces/_health`.
 *
 * When the trace pipeline is not attached the router returns zeroes
 * + `writerRunning: false` (a 404-free idle state for the UI panel).
 *
 * `databaseDialect` is the SQLAlchemy bind dialect name read off the
 * standalone DB engine (`"sqlite"`, `"postgresql"`, ...). It falls
 * back to `"unknown"` when the engine isn't reachable so the SQLite
 * banner only renders on a confirmed signal.
 */
export type StandaloneTraceHealth = {
  queueDepth: number;
  maxQueueSize: number;
  overflowCount: number;
  writerRunning: boolean;
  databaseDialect: string;
};

/**
 * Body of `DELETE /admin/api/v1/traces/{id}`.
 *
 * The router returns the `deleted: true` discriminator + the cascaded
 * span count so the UI can show "removed N spans" without a follow-up.
 */
export type StandaloneTraceDeleteResult = {
  deleted: true;
  deletedSpans: number;
};

/** Body of `DELETE /admin/api/v1/traces` (bulk by filter). */
export type StandaloneTraceBulkDeleteResult = {
  deletedTraces: number;
  deletedSpans: number;
};

// ── Fetchers ────────────────────────────────────────────────────────────

const BASE = "/admin/api/v1/traces";

/**
 * Shared TanStack Query cache key for `getTraceHealth`. Both the
 * `SqliteBanner` and the `PipelineHealthPanel` mount their own
 * `useQuery` with this key so the two consumers de-duplicate to a
 * single in-flight request and a single cache entry — addresses the
 * "two polls per 5s for the same endpoint" finding (#39).
 */
export const TRACE_HEALTH_QUERY_KEY = ["traces", "health"] as const;

/**
 * Strip undefined / null / empty-string entries from a record so a
 * downstream `URLSearchParams` doesn't leak `?model=&status=` to the
 * API. Centralised so future filter fields can't reintroduce the leak.
 */
export function pickDefined<T extends Record<string, unknown>>(
  params: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(params) as [keyof T, unknown][]) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value as T[keyof T];
  }
  return out;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const filtered = pickDefined(params);
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(filtered)) {
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export function listTraces(
  filters: StandaloneTraceListFilters = {},
): Promise<StandaloneTraceListResponse> {
  return apiFetch<StandaloneTraceListResponse>(`${BASE}${buildQuery(filters)}`);
}

export function getTrace(otelTraceId: string): Promise<StandaloneTraceDetail> {
  return apiFetch<StandaloneTraceDetail>(
    `${BASE}/${encodeURIComponent(otelTraceId)}`,
  );
}

export function deleteTrace(
  otelTraceId: string,
): Promise<StandaloneTraceDeleteResult> {
  return apiFetch<StandaloneTraceDeleteResult>(
    `${BASE}/${encodeURIComponent(otelTraceId)}`,
    { method: "DELETE" },
  );
}

export function bulkDeleteTraces(
  filters: StandaloneTraceBulkDeleteFilters = {},
): Promise<StandaloneTraceBulkDeleteResult> {
  return apiFetch<StandaloneTraceBulkDeleteResult>(
    `${BASE}${buildQuery(filters)}`,
    { method: "DELETE" },
  );
}

export function getTraceHealth(): Promise<StandaloneTraceHealth> {
  return apiFetch<StandaloneTraceHealth>(`${BASE}/_health`);
}

export const tracesApi = {
  listTraces,
  getTrace,
  deleteTrace,
  bulkDeleteTraces,
  getTraceHealth,
};
