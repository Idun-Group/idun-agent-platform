import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createStorage() {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
    };
}

describe('apiFetch scope headers', () => {
    const fetchMock = vi.fn();
    const localStorageMock = createStorage();

    beforeEach(() => {
        vi.resetModules();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('localStorage', localStorageMock);
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                __RUNTIME_CONFIG__: {},
                location: { hostname: 'localhost' },
                localStorage: localStorageMock,
            },
        });
        localStorageMock.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('injects workspace and project headers for authenticated manager requests', async () => {
        localStorage.setItem('activeWorkspaceId', 'ws-1');
        localStorage.setItem('activeTenantId', 'ws-1');
        localStorage.setItem('activeProjectId:ws-1', 'proj-1');

        const { getJson } = await import('./api');
        await getJson('http://example.com/api/v1/memory/');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://example.com/api/v1/memory/',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Accept: 'application/json',
                    'X-Workspace-Id': 'ws-1',
                    'X-Project-Id': 'proj-1',
                }),
            }),
        );
    });

    it('does not inject workspace or project headers for auth routes', async () => {
        localStorage.setItem('activeWorkspaceId', 'ws-1');
        localStorage.setItem('activeProjectId:ws-1', 'proj-1');

        const { getJson } = await import('./api');
        await getJson('http://example.com/api/v1/auth/me');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://example.com/api/v1/auth/me',
            expect.objectContaining({
                headers: expect.not.objectContaining({
                    'X-Workspace-Id': expect.anything(),
                    'X-Project-Id': expect.anything(),
                }),
            }),
        );
    });
});
