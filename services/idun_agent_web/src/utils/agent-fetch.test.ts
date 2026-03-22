import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentFetch } from './agent-fetch';

function setHostname(hostname: string): void {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            location: { hostname },
            __RUNTIME_CONFIG__: {},
        },
    });
}

describe('agentFetch', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses loopback targetAddressSpace for localhost from a public origin', async () => {
        setHostname('cloud.idunplatform.com');

        await agentFetch('http://localhost:8817/health');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8817/health',
            expect.objectContaining({ targetAddressSpace: 'loopback' }),
        );
    });

    it('uses local targetAddressSpace for private network hosts from a public origin', async () => {
        setHostname('cloud.idunplatform.com');

        await agentFetch('http://192.168.1.20:8817/health');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://192.168.1.20:8817/health',
            expect.objectContaining({ targetAddressSpace: 'local' }),
        );
    });

    it('does not annotate requests when the frontend itself runs on loopback', async () => {
        setHostname('localhost');

        await agentFetch('http://localhost:8817/health');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8817/health',
            expect.not.objectContaining({ targetAddressSpace: expect.anything() }),
        );
    });
});
