/**
 * Low level fetch wrapper.
 *
 * - Sends the session cookie on every request.
 * - Redirects to /login/ once on 401.
 * - Throws ApiError on non-2xx so TanStack Query surfaces the failure.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`API ${status}`);
  }
}

let redirected = false;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined" && !redirected) {
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
