// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../hooks/use-project');
vi.mock('../../hooks/use-workspace');
vi.mock('../../services/applications');

vi.mock('../../components/applications/delete-confirm-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="delete-modal-open" /> : <div data-testid="delete-modal-closed" />,
}));

// Stub i18n — return fallback when provided, else key. Supports {{var}} interpolation.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallbackOrOptions?: string | Record<string, unknown>, maybeOptions?: Record<string, unknown>) => {
            const fallback = typeof fallbackOrOptions === 'string' ? fallbackOrOptions : undefined;
            const options = typeof fallbackOrOptions === 'object' ? fallbackOrOptions : maybeOptions;
            let value = fallback ?? key;
            if (options) {
                for (const [k, v] of Object.entries(options)) {
                    value = value.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
                }
            }
            return value;
        },
    }),
}));

import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';
import { fetchApplications } from '../../services/applications';
import ObservabilityPage from './page';

const mockUseProject = vi.mocked(useProject);
const mockUseWorkspace = vi.mocked(useWorkspace);
const mockFetchApplications = vi.mocked(fetchApplications);

const baseProject = {
    id: 'proj-1',
    workspace_id: 'ws-1',
    name: 'Test Project',
    is_default: true,
    current_user_role: 'admin' as const,
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

function workspaceHook() {
    return {
        selectedWorkspaceId: 'ws-1',
        currentWorkspace: { id: 'ws-1', name: 'Test Workspace', is_owner: true },
        workspaces: [],
        isCurrentWorkspaceOwner: true,
        setSelectedWorkspaceId: vi.fn(),
        getAllWorkspace: vi.fn().mockResolvedValue([]),
    };
}

function renderPage() {
    return render(
        <MemoryRouter>
            <ObservabilityPage />
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
});

describe('ObservabilityPage — Reader with no providers (empty state)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(workspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
        mockFetchApplications.mockResolvedValue([]);
    });

    it('renders reader-aware empty-state copy (passive title, ask-admin description)', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText(/No observability providers configured in Test Project/i)).not.toBeNull();
            expect(screen.queryByText(/Ask a contributor or admin to connect one/i)).not.toBeNull();
        });
        // Writer-flavored invitation must not appear for readers.
        expect(screen.queryByText(/Connect a provider to get started/i)).toBeNull();
    });
});

describe('ObservabilityPage — Admin with no providers (empty state)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(workspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(true, true));
        mockFetchApplications.mockResolvedValue([]);
    });

    it('renders the write-flavored empty-state title', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText(/Connect a provider to get started/i)).not.toBeNull();
        });
    });
});
