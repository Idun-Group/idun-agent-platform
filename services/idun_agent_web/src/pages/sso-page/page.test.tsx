// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../hooks/use-project');
vi.mock('../../hooks/use-workspace');
vi.mock('../../services/sso');

// Stub modals so they don't need their own heavy deps
vi.mock('../../components/applications/create-sso-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="create-modal" /> : null,
}));

vi.mock('../../components/applications/delete-confirm-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="delete-modal-open" /> : <div data-testid="delete-modal-closed" />,
}));

import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';
import { fetchSSOs, deleteSSO } from '../../services/sso';
import type { ManagedSSO } from '../../services/sso';
import SSOPage from './page';

const mockUseProject = vi.mocked(useProject);
const mockUseWorkspace = vi.mocked(useWorkspace);
const mockFetchSSOs = vi.mocked(fetchSSOs);

function defaultWorkspaceHook() {
    return {
        selectedWorkspaceId: 'ws-1',
        currentWorkspace: { id: 'ws-1', name: 'Test Workspace', is_owner: true },
        workspaces: [],
        isCurrentWorkspaceOwner: true,
        setSelectedWorkspaceId: vi.fn(),
        getAllWorkspace: vi.fn().mockResolvedValue([]),
    };
}

// ── Fixture SSO config ─────────────────────────────────────────────────────

const fixtureSso: ManagedSSO = {
    id: 'sso-1',
    name: 'Google OIDC',
    sso: {
        issuer: 'https://accounts.google.com',
        clientId: 'my-client-id',
        enabled: true,
        allowedDomains: ['example.com'],
        allowedEmails: [],
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    agentCount: 0,
};

const baseProject = {
    id: 'proj-1',
    workspace_id: 'ws-1',
    name: 'Test Project',
    is_default: true,
    current_user_role: 'reader' as const,
};

function makeProjectHook(canWrite: boolean, canAdmin: boolean) {
    return {
        selectedProjectId: 'proj-1',
        currentProject: {
            ...baseProject,
            current_user_role: canAdmin ? 'admin' : canWrite ? 'contributor' : 'reader',
        },
        projects: [baseProject],
        currentRole: canAdmin ? ('admin' as const) : canWrite ? ('contributor' as const) : ('reader' as const),
        canWrite,
        canAdmin,
        isLoadingProjects: false,
        setSelectedProjectId: vi.fn(),
        refreshProjects: vi.fn().mockResolvedValue([]),
    };
}

function renderPage() {
    return render(
        <MemoryRouter>
            <SSOPage />
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SSOPage — Reader (canWrite=false, canAdmin=false)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(defaultWorkspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
        mockFetchSSOs.mockResolvedValue([fixtureSso]);
        vi.mocked(deleteSSO).mockResolvedValue(undefined);
    });

    it('does not render the Add SSO config button in the header', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('+ Add SSO config')).toBeNull();
        });
    });

    it('does not render the Edit button on SSO cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Edit')).toBeNull();
        });
    });

    it('does not render the Remove button on SSO cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Remove')).toBeNull();
        });
    });

    it('does not render the Add SSO configuration card', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Add SSO configuration')).toBeNull();
        });
    });
});

describe('SSOPage — Contributor (canWrite=true, canAdmin=false)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(defaultWorkspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(true, false));
        mockFetchSSOs.mockResolvedValue([fixtureSso]);
        vi.mocked(deleteSSO).mockResolvedValue(undefined);
    });

    it('renders the Add SSO config button in the header', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('+ Add SSO config')).not.toBeNull();
        });
    });

    it('renders the Edit button on SSO cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            const editBtns = screen.queryAllByText('Edit');
            expect(editBtns.length).toBeGreaterThan(0);
        });
    });

    it('does not render the Remove button on SSO cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Remove')).toBeNull();
        });
    });

    it('renders the Add SSO configuration card', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Add SSO configuration')).not.toBeNull();
        });
    });
});

describe('SSOPage — Admin (canWrite=true, canAdmin=true)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(defaultWorkspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(true, true));
        mockFetchSSOs.mockResolvedValue([fixtureSso]);
        vi.mocked(deleteSSO).mockResolvedValue(undefined);
    });

    it('renders the Add SSO config button in the header', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('+ Add SSO config')).not.toBeNull();
        });
    });

    it('renders both Edit and Remove buttons on SSO cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryAllByText('Edit').length).toBeGreaterThan(0);
            expect(screen.queryAllByText('Remove').length).toBeGreaterThan(0);
        });
    });

    it('renders the Add SSO configuration card', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Add SSO configuration')).not.toBeNull();
        });
    });
});
