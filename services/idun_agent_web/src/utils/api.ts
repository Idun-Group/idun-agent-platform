const resolveBaseUrl = (): string => {
    const envUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (envUrl && envUrl.trim().length > 0) return envUrl;
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:8000`;
    }
    return 'http://localhost:8000';
};

export const API_BASE_URL = resolveBaseUrl();

type ApiOptions = RequestInit & {
    headers?: Record<string, string>;
};

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    const response = await fetch(url, {
        credentials: 'include',
        ...options,
        headers: {
            'Accept': 'application/json',
            ...(options.body && !(options.headers && options.headers['Content-Type'])
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...(options.headers ?? {}),
        },
    });

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


