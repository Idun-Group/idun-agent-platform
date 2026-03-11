/**
 * Centralized fetch wrapper for cross-origin calls to agent base_url.
 *
 * Handles two concerns:
 * 1. URL normalization — eliminates the repeated `endsWith('/')` pattern
 * 2. Local network access — when the cloud frontend calls a loopback or
 *    private-network agent, annotate the request with the matching Chrome
 *    address space (`loopback` or `local`).
 *    Skipped in local dev (both sides are localhost, no PNA rules apply).
 */

function isLoopbackHost(hostname: string): boolean {
    if (hostname === 'localhost' || hostname === '::1') {
        return true;
    }

    return hostname.startsWith('127.');
}

function isPrivateIpv4Host(hostname: string): boolean {
    return (
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
        hostname.startsWith('169.254.')
    );
}

function isLoopbackUrl(url: string): boolean {
    try {
        return isLoopbackHost(new URL(url).hostname);
    } catch {
        return false;
    }
}

function isLocalNetworkUrl(url: string): boolean {
    try {
        return isPrivateIpv4Host(new URL(url).hostname);
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
 * domain (e.g. cloud.idunplatform.com) and the agent is on loopback or the
 * local network, adds the matching `targetAddressSpace` for Chrome Local
 * Network Access checks.
 */
export function agentFetch(url: string, init?: RequestInit): Promise<Response> {
    const options: RequestInit = { ...init };

    if (!isLoopbackOrigin()) {
        const requestOptions = options as RequestInit & {
            targetAddressSpace?: 'local' | 'loopback';
        };

        if (isLoopbackUrl(url)) {
            requestOptions.targetAddressSpace = 'loopback';
        } else if (isLocalNetworkUrl(url)) {
            requestOptions.targetAddressSpace = 'local';
        }
    }

    return fetch(url, options);
}
