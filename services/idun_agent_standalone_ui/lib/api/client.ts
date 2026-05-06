/**
 * Low level fetch wrapper.
 *
 * - Sends the session cookie on every request.
 * - Attaches an SSO Bearer token from oidc-client-ts when one is available.
 * - Redirects to /login/?next=<encoded path> once on 401 so the user
 *   lands back on their original page after authenticating. Skips the
 *   `?next=` round-trip when the request already came from /login.
 * - Throws ApiError on non-2xx so TanStack Query surfaces the failure.
 */

import { authHeaders, clearManualToken, fetchSsoInfo } from "@/lib/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`API ${status}`);
  }
}

let redirected = false;

function isAgentPath(path: string): boolean {
  return path.startsWith("/agent/");
}

async function handleUnauthorized(path: string): Promise<void> {
  if (typeof window === "undefined") return;
  // SSO-protected agent path: clear stale token, reload root so SsoLogin
  // re-renders. Avoids hard-redirecting to /login which is the admin-only
  // password screen and 404s in standalone deployments without password mode.
  if (isAgentPath(path)) {
    const info = await fetchSsoInfo().catch(() => null);
    if (info?.enabled) {
      clearManualToken();
      window.location.replace("/");
      return;
    }
  }
  if (window.location.pathname.startsWith("/login")) return;
  const nextPath = window.location.pathname + window.location.search;
  const next = encodeURIComponent(nextPath);
  window.location.href = `/login/?next=${next}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const bearer = await authHeaders();
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...bearer,
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined" && !redirected) {
    if (window.location.pathname.startsWith("/login")) {
      throw new ApiError(401, null);
    }
    redirected = true;
    await handleUnauthorized(path);
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
