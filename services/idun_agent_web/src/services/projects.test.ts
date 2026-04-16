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

describe('projects service', () => {
    const fetchMock = vi.fn();
    const localStorageMock = createStorage();

    beforeEach(() => {
        vi.resetModules();
        fetchMock.mockReset();
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
        localStorage.setItem('activeWorkspaceId', 'ws-1');
        localStorage.setItem('activeTenantId', 'ws-1');
        localStorage.setItem('activeProjectId:ws-1', 'proj-1');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('lists projects from the manager API', async () => {
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify([
                    {
                        id: 'proj-1',
                        workspace_id: 'ws-1',
                        name: 'Default Project',
                        is_default: true,
                        current_user_role: 'admin',
                        created_at: '2026-04-09T00:00:00Z',
                        updated_at: '2026-04-09T00:00:00Z',
                    },
                ]),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        );

        const { listProjects } = await import('./projects');
        const projects = await listProjects();

        expect(projects).toHaveLength(1);
        expect(projects[0]?.id).toBe('proj-1');
        expect(projects[0]?.current_user_role).toBe('admin');
    });
});
