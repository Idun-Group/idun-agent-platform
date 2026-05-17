// Wire types for GET /admin/api/v1/dashboard.
// Mirrors libs/idun_agent_schema/src/idun_agent_schema/standalone/dashboard.py.
// camelCase keys per the standalone _CamelModel base.

export type DashboardRange = "1h" | "24h" | "7d" | "30d";

export interface TimeBucketPoint {
  t: string; // ISO 8601 UTC
  v: number;
}

export interface LatencyBucketPoint {
  t: string;
  p50: number | null;
  p95: number | null;
}

export interface RequestsBlock {
  total: number;
  deltaPct: number | null;
  series: TimeBucketPoint[];
}

export interface LatencyBlock {
  p50Ms: number | null;
  p95Ms: number | null;
  p95DeltaPct: number | null;
  series: LatencyBucketPoint[];
}

export interface ErrorRateBlock {
  /** Decimal fraction. 0.0042 == 0.42%. */
  valuePct: number;
  /** Percentage-point delta as a decimal fraction. NOT a relative %. */
  deltaPp: number | null;
  series: TimeBucketPoint[];
}

export interface CostBlock {
  totalUsd: number;
  deltaPct: number | null;
  series: TimeBucketPoint[];
}

export interface TopErrorRow {
  spanName: string;
  count: number;
  lastSeen: string;
  sampleTraceId: string;
}

export interface DashboardResponse {
  range: DashboardRange;
  generatedAt: string;
  bucketSeconds: number;
  requests: RequestsBlock;
  latency: LatencyBlock;
  errorRate: ErrorRateBlock;
  cost: CostBlock;
  topErrors: TopErrorRow[];
}
