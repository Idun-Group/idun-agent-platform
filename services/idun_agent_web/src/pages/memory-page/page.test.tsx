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

vi.mock('../../components/toast/notify', () => ({
    notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// Stub i18n — return fallback when provided, else key
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';
import { fetchApplications } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import MemoryPage from './page';

const mockUseProject = vi.mocked(useProject);
const mockUseWorkspace = vi.mocked(useWorkspace);
const mockFetchApplications = vi.mocked(fetchApplications);

// ── Fixtures ────────────────────────────────────────────────────────────────

const baseProject = {
    id: 'proj-1',
    workspace_id: 'ws-1',
    name: 'Test Project',
    is_default: true,
    current_user_role: 'admin' as const,
};

function projectHookSelected() {
    return {
        selectedProjectId: 'proj-1',
        currentProject: baseProject,
        projects: [baseProject],
        currentRole: 'admin' as const,
        canWrite: true,
        canAdmin: true,
        isLoadingProjects: false,
        setSelectedProjectId: vi.fn(),
        refreshProjects: vi.fn().mockResolvedValue([]),
    };
}

function projectHookNone(projectsCount: number) {
    const projects = Array.from({ length: projectsCount }, (_, i) => ({
        ...baseProject,
        id: `proj-${i + 1}`,
        name: `Project ${i + 1}`,
    }));
    return {
        selectedProjectId: null,
        currentProject: null,
        projects,
        currentRole: null,
        canWrite: false,
        canAdmin: false,
        isLoadingProjects: false,
        setSelectedProjectId: vi.fn(),
        refreshProjects: vi.fn().mockResolvedValue([]),
    };
}

function workspaceHook(isOwner: boolean) {
    return {
        selectedWorkspaceId: 'ws-1',
        currentWorkspace: {
            id: 'ws-1',
            name: 'Test Workspace',
            is_owner: isOwner,
        },
        workspaces: [],
        isCurrentWorkspaceOwner: isOwner,
        setSelectedWorkspaceId: vi.fn(),
        getAllWorkspace: vi.fn().mockResolvedValue([]),
    };
}

const fixtureMemory: ApplicationConfig = {
    id: 'mem-1',
    name: 'Production State',
    type: 'PostgreSQL',
    category: 'Memory',
    framework: 'LANGGRAPH',
    config: { connectionString: 'postgresql://localhost:5432/db' },
    updatedAt: '2024-01-01T00:00:00Z',
    agentCount: 0,
};

function renderPage() {
    return render(
        <MemoryRouter>
            <MemoryPage />
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MemoryPage — no project selected, no projects, workspace owner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(projectHookNone(0));
        // Use "as any"-free cast via a ReturnType-compatible helper value
        mockUseWorkspace.mockReturnValue(workspaceHook(true) as ReturnType<typeof useWorkspace>);
        mockFetchApplications.mockResolvedValue([]);
    });

    it('renders NoProjectState with owner CTA linking to workspace projects settings', () => {
        renderPage();
        const cta = screen.queryByRole('link', { name: /create project/i });
        expect(cta).not.toBeNull();
        expect(cta?.getAttribute('href')).toBe('/settings/workspace-projects');
    });

    it('does not render the normal Memory page UI (no provider pick list)', () => {
        renderPage();
        // The normal page shows provider names like "SQLite"/"PostgreSQL" in its picker.
        expect(screen.queryByText('SQLite')).toBeNull();
        expect(screen.queryByText('PostgreSQL')).toBeNull();
    });
});

describe('MemoryPage — no project selected, no projects, workspace member', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(projectHookNone(0));
        mockUseWorkspace.mockReturnValue(workspaceHook(false) as ReturnType<typeof useWorkspace>);
        mockFetchApplications.mockResolvedValue([]);
    });

    it('renders NoProjectState with no CTA', () => {
        renderPage();
        const matches = screen.queryAllByText(/workspace owner/i);
        expect(matches.length).toBeGreaterThan(0);
        // No buttons / links
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });
});

describe('MemoryPage — no project selected, but projects exist', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(projectHookNone(2));
        mockUseWorkspace.mockReturnValue(workspaceHook(false) as ReturnType<typeof useWorkspace>);
        mockFetchApplications.mockResolvedValue([]);
    });

    it('renders NoProjectState none-selected variant', () => {
        renderPage();
        expect(screen.queryByRole('button', { name: /select a project/i })).not.toBeNull();
    });
});

describe('MemoryPage — project selected (happy path)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(projectHookSelected());
        mockUseWorkspace.mockReturnValue(workspaceHook(true) as ReturnType<typeof useWorkspace>);
        mockFetchApplications.mockResolvedValue([fixtureMemory]);
    });

    it('renders the normal Memory page content (provider picker visible)', async () => {
        renderPage();
        // The regular page shows provider labels in the left picker.
        await vi.waitFor(() => {
            expect(screen.queryByText('PostgreSQL')).not.toBeNull();
        });
    });

    it('does not render the NoProjectState banner', () => {
        renderPage();
        expect(screen.queryByRole('link', { name: /create project/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /select a project/i })).toBeNull();
    });
});
