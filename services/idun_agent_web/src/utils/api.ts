import { runtimeConfig } from './runtime-config';

const resolveBaseUrl = (): string => {
    if (runtimeConfig.API_URL.length > 0) return runtimeConfig.API_URL;
    return import.meta.env.DEV ? 'http://localhost:8000' : '';
};

export const API_BASE_URL = resolveBaseUrl();

export const ACTIVE_WORKSPACE_KEY = 'activeWorkspaceId';
export const LEGACY_WORKSPACE_KEY = 'activeTenantId';

function getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
}

function projectStorageKey(workspaceId: string): string {
    return `activeProjectId:${workspaceId}`;
}

export function getStoredWorkspaceId(): string | null {
    const storage = getStorage();
    if (!storage) return null;
    return storage.getItem(ACTIVE_WORKSPACE_KEY) ?? storage.getItem(LEGACY_WORKSPACE_KEY);
}

export function setStoredWorkspaceId(workspaceId: string | null): void {
    const storage = getStorage();
    if (!storage) return;
    if (!workspaceId) {
        storage.removeItem(ACTIVE_WORKSPACE_KEY);
        storage.removeItem(LEGACY_WORKSPACE_KEY);
        return;
    }
    storage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
    storage.setItem(LEGACY_WORKSPACE_KEY, workspaceId);
}

export function getStoredProjectId(workspaceId?: string | null): string | null {
    const storage = getStorage();
    const resolvedWorkspaceId = workspaceId ?? getStoredWorkspaceId();
    if (!storage || !resolvedWorkspaceId) return null;
    return storage.getItem(projectStorageKey(resolvedWorkspaceId));
}

export function setStoredProjectId(workspaceId: string, projectId: string | null): void {
    const storage = getStorage();
    if (!storage) return;
    const key = projectStorageKey(workspaceId);
    if (!projectId) {
        storage.removeItem(key);
        return;
    }
    storage.setItem(key, projectId);
}

export function clearStoredProjectId(workspaceId: string): void {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(projectStorageKey(workspaceId));
}

function shouldAttachScopeHeaders(path: string): boolean {
    return path.includes('/api/v1/') && !path.includes('/api/v1/auth/');
}

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

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    const workspaceId = getStoredWorkspaceId();
    const projectId = getStoredProjectId(workspaceId);
    const scopeHeaders =
        shouldAttachScopeHeaders(url) && workspaceId
            ? {
                  'X-Workspace-Id': workspaceId,
                  ...(projectId ? { 'X-Project-Id': projectId } : {}),
              }
            : {};
    const response = await fetch(url, {
        credentials: 'include',
        ...options,
        headers: {
            'Accept': 'application/json',
            ...(options.body && !(options.headers && options.headers['Content-Type'])
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...scopeHeaders,
            ...(options.headers ?? {}),
        },
    });

    if (response.status === 401) {
        // Notify listeners; do not redirect. Show a toast once to avoid spam.
        unauthorizedHandlers.forEach((h) => {
            try {
                h();
            } catch {
                // Ignore handler errors so one broken consumer doesn't block auth recovery.
            }
        });
        if (!hasNotifiedOn401) {
            hasNotifiedOn401 = true;
            // try { toast.error('Unauthorized (401). Please check your access.'); } catch {}
            setTimeout(() => { hasNotifiedOn401 = false; }, 2000);
        }
        throw new Error('unauthorized');
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Request failed with status ${response.status}`);
    }

    if (response.status === 204) {
        return undefined as unknown as T;
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
