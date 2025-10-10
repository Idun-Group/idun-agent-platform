import { toast } from 'react-toastify';

const resolveBaseUrl = (): string => {
    const envUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (envUrl && envUrl.trim().length > 0) return envUrl;
    // Default to backend port in dev when no explicit env is set
    return 'http://localhost:8000';
};

export const API_BASE_URL = resolveBaseUrl();

type ApiOptions = RequestInit & {
    headers?: Record<string, string>;
};

let unauthorizedHandlers: Array<() => void> = [];
export function addUnauthorizedHandler(handler: () => void): void {
    unauthorizedHandlers.push(handler);
}
export function removeUnauthorizedHandler(handler: () => void): void {
    unauthorizedHandlers = unauthorizedHandlers.filter((h) => h !== handler);
}

let hasNotifiedOn401 = false;

function getActiveTenantId(): string | undefined {
    try {
        const v = localStorage.getItem('activeTenantId') || '';
        // Basic UUID v4-ish check
        return /[0-9a-fA-F-]{36}/.test(v) ? v : undefined;
    } catch {
        return undefined;
    }
}

function shouldAttachTenant(path: string): boolean {
    // Only include tenant header on business endpoints that require it (e.g., agents),
    // and never on auth endpoints.
    const pathname = path.startsWith('http')
        ? (() => {
              try {
                  return new URL(path).pathname;
              } catch {
                  return path;
              }
          })()
        : path;
    if (pathname.startsWith('/api/v1/auth/')) return false;
    return pathname.startsWith('/api/v1/agents');
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    const tenantId = getActiveTenantId();
    const response = await fetch(url, {
        credentials: 'include',
        ...options,
        headers: {
            'Accept': 'application/json',
            ...(options.body && !(options.headers && options.headers['Content-Type'])
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...(tenantId && shouldAttachTenant(path) ? { 'X-Tenant-ID': tenantId } : {}),
            ...(options.headers ?? {}),
        },
    });

    if (response.status === 401) {
        // Notify listeners; do not redirect. Show a toast once to avoid spam.
        unauthorizedHandlers.forEach((h) => {
            try { h(); } catch {}
        });
        if (!hasNotifiedOn401) {
            hasNotifiedOn401 = true;
            try { toast.error('Unauthorized (401). Please check your access.'); } catch {}
            setTimeout(() => { hasNotifiedOn401 = false; }, 2000);
        }
        throw new Error('unauthorized');
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
}

export async function getJson<T = unknown>(path: string, headers?: Record<string, string>): Promise<T> {
    return apiFetch<T>(path, { method: 'GET', headers });
}

export async function postJson<T = unknown, B = unknown>(path: string, body: B, headers?: Record<string, string>): Promise<T> {
    return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), headers });
}

export async function putJson<T = unknown, B = unknown>(path: string, body: B, headers?: Record<string, string>): Promise<T> {
    return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), headers });
}

export async function patchJson<T = unknown, B = unknown>(path: string, body: B, headers?: Record<string, string>): Promise<T> {
    return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers });
}

export async function deleteRequest<T = unknown>(path: string, headers?: Record<string, string>): Promise<T> {
    return apiFetch<T>(path, { method: 'DELETE', headers });
}


