/**
 * Centralized fetch wrapper for cross-origin calls to agent base_url.
 *
 * Handles two concerns:
 * 1. URL normalization — eliminates the repeated `endsWith('/')` pattern
 * 2. Local network access — when the cloud frontend calls a localhost agent,
 *    adds `targetAddressSpace: "local"` to signal that the request targets the
 *    local network (Chrome Local Network Access requirement).
 *    Skipped in local dev (both sides are localhost, no PNA rules apply).
 */

function isLoopbackHost(hostname: string): boolean {
    if (hostname === 'localhost' || hostname === '::1') {
        return true;
    }

    return hostname.startsWith('127.');
}

function isLoopbackUrl(url: string): boolean {
    try {
        return isLoopbackHost(new URL(url).hostname);
    } catch {
        return false;
    }
}

function isLoopbackOrigin(): boolean {
    return isLoopbackHost(window.location.hostname);
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
 * adds `targetAddressSpace: "local"` to signal local-network intent for
 * Chrome Local Network Access checks.
 */
export function agentFetch(url: string, init?: RequestInit): Promise<Response> {
    const options: RequestInit = { ...init };

    if (!isLoopbackOrigin() && isLoopbackUrl(url)) {
        (options as RequestInit & { targetAddressSpace?: 'local' }).targetAddressSpace =
            'local';
    }

    return fetch(url, options);
}
