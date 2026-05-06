/**
 * Low level fetch wrapper.
 *
 * - Sends the session cookie on every request.
 * - Redirects to /login/?next=<encoded path> once on 401 so the user
 *   lands back on their original page after authenticating. Skips the
 *   `?next=` round-trip when the request already came from /login.
 * - Throws ApiError on non-2xx so TanStack Query surfaces the failure.
 *   ApiError carries `fieldErrors` pre-parsed from the standard admin
 *   error envelope so consumers (forms via applyFieldErrors) don't need
 *   to traverse `error.detail.error.fieldErrors`.
 */

import type { FieldError } from "./types";

export class ApiError extends Error {
  public readonly fieldErrors: readonly FieldError[];

  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`API ${status}`);
    this.fieldErrors = extractFieldErrors(detail);
  }
}

function extractFieldErrors(detail: unknown): readonly FieldError[] {
  if (!detail || typeof detail !== "object") return [];
  const error = (detail as { error?: unknown }).error;
  if (!error || typeof error !== "object") return [];
  const raw = (error as { fieldErrors?: unknown }).fieldErrors;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is FieldError => {
    if (item == null || typeof item !== "object") return false;
    const o = item as { field?: unknown; message?: unknown; code?: unknown };
    if (typeof o.field !== "string") return false;
    if (typeof o.message !== "string") return false;
    return typeof o.code === "string" || o.code === null;
  });
}

let redirected = false;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined" && !redirected) {
    if (window.location.pathname.startsWith("/login")) {
      throw new ApiError(401, null);
    }
    redirected = true;
    const nextPath = window.location.pathname + window.location.search;
    const next = encodeURIComponent(nextPath);
    window.location.href = `/login/?next=${next}`;
    throw new ApiError(401, null);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const j = (body: unknown) => JSON.stringify(body);
