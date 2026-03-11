import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function setHostname(hostname: string): void {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            location: { hostname },
            __RUNTIME_CONFIG__: {},
        },
    });
}

describe('fetchEngineHealth', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ status: 'ok', version: '0.4.9' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        setHostname('cloud.idunplatform.com');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('routes localhost health checks through agentFetch address-space handling', async () => {
        const { fetchEngineHealth } = await import('./agents');

        const result = await fetchEngineHealth('http://localhost:8817');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8817/health',
            expect.objectContaining({
                signal: expect.any(AbortSignal),
                targetAddressSpace: 'loopback',
            }),
        );
        expect(result).toEqual({ status: 'ok', engineVersion: '0.4.9' });
    });
});
