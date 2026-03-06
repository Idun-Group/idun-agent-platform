/**
 * Centralized fetch wrapper for cross-origin calls to agent base_url.
 *
 * Handles two concerns:
 * 1. URL normalization — eliminates the repeated `endsWith('/')` pattern
 * 2. Local network access — when the cloud frontend calls a localhost agent,
 *    adds `targetAddressSpace: "loopback"` so the browser permits the request.
 *    Skipped in local dev (both sides are localhost, no PNA rules apply).
 */

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function isLoopbackUrl(url: string): boolean {
    try {
        return LOOPBACK_HOSTS.includes(new URL(url).hostname);
    } catch {
        return false;
    }
}

function isPublicOrigin(): boolean {
    return !LOOPBACK_HOSTS.includes(window.location.hostname);
}

/**
 * Build a full URL from agent base_url + path, normalizing trailing slashes.
 */
export function buildAgentUrl(baseUrl: string, path: string): string {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
}

/**
 * Fetch wrapper for agent endpoints. When the frontend runs on a public
 * domain (e.g. cloud.idunplatform.com) and the agent is on localhost,
 * adds `targetAddressSpace: "loopback"` to allow the browser request.
 */
export function agentFetch(url: string, init?: RequestInit): Promise<Response> {
    const options: RequestInit = { ...init };

    if (isPublicOrigin() && isLoopbackUrl(url)) {
        (options as Record<string, unknown>).targetAddressSpace = 'loopback';
    }

    return fetch(url, options);
}
