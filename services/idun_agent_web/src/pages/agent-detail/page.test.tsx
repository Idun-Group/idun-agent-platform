// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../hooks/use-project');
vi.mock('../../hooks/use-auth');
vi.mock('../../services/agents');

// Stub the lazy-loaded tab components so the suspense boundary resolves
// synchronously and the tests don't depend on their internals. The
// OverviewTab receives `isEditing` and the resource selection UI — we want
// to observe the page-level header gating, not the tab internals here.
vi.mock('../../components/agent-detail/tabs/overview-tab/component', () => ({
    default: ({
        isEditing,
        canWrite,
    }: {
        isEditing: boolean;
        canWrite: boolean;
    }) => (
        <div data-testid="overview-tab">
            <span data-testid="overview-isEditing">{String(isEditing)}</span>
            <span data-testid="overview-canWrite">{String(canWrite)}</span>
        </div>
    ),
}));
vi.mock('../../components/agent-detail/tabs/gateway-tab/component', () => ({
    default: () => <div data-testid="gateway-tab" />,
}));
vi.mock('../../components/agent-detail/tabs/configuration-tab/component', () => ({
    default: () => <div data-testid="configuration-tab" />,
}));
vi.mock('../../components/agent-detail/tabs/chat-tab/component', () => ({
    default: () => <div data-testid="chat-tab" />,
}));
vi.mock('../../components/agent-detail/tabs/prompts-tab/component', () => ({
    default: () => <div data-testid="prompts-tab" />,
}));
vi.mock('../../components/agent-detail/tabs/overview-tab/sections/enrollment-section', () => ({
    default: () => <div data-testid="enrollment-section" />,
}));

vi.mock('../../components/applications/delete-confirm-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="delete-modal-open" /> : <div data-testid="delete-modal-closed" />,
}));

import { useProject } from '../../hooks/use-project';
import { useAuth } from '../../hooks/use-auth';
import {
    getAgent,
    deleteAgent,
    performHealthCheck,
    fetchEngineHealth,
    fetchLatestEngineVersion,
} from '../../services/agents';
import type { BackendAgent } from '../../services/agents';
import AgentDetailPage from './page';

const mockUseProject = vi.mocked(useProject);
const mockUseAuth = vi.mocked(useAuth);
const mockGetAgent = vi.mocked(getAgent);

// ── Fixtures ────────────────────────────────────────────────────────────────

const fixtureAgent: BackendAgent = {
    id: 'agent-1',
    project_id: 'proj-1',
    name: 'Test Agent',
    status: 'active',
    version: '0.1.0',
    engine_config: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    framework: 'LANGGRAPH',
    description: null,
    base_url: null,
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
        <MemoryRouter initialEntries={['/agents/agent-1']}>
            <Routes>
                <Route path="/agents/:id" element={<AgentDetailPage />} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
        session: null,
        isLoading: false,
        // the page only reads isLoading — the others are stubbed for TS
        login: vi.fn(),
        loginOIDC: vi.fn(),
        logout: vi.fn(),
        signup: vi.fn(),
        refresh: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockGetAgent.mockResolvedValue(fixtureAgent);
    vi.mocked(deleteAgent).mockResolvedValue(undefined);
    vi.mocked(performHealthCheck).mockImplementation(() => undefined);
    vi.mocked(fetchEngineHealth).mockResolvedValue(null);
    vi.mocked(fetchLatestEngineVersion).mockResolvedValue(null);
});

afterEach(() => {
    cleanup();
});

// ── Reader ──────────────────────────────────────────────────────────────────

describe('AgentDetailPage — Reader (canWrite=false, canAdmin=false)', () => {
    beforeEach(() => {
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
    });

    it('does not render the Edit Agent button', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByText(/edit agent/i)).toBeNull();
    });

    it('does not render the Restart button', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByText(/restart/i)).toBeNull();
    });

    it('does not render the Delete agent action', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByText(/delete agent/i)).toBeNull();
    });

    it('passes canWrite=false down to OverviewTab', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.getByTestId('overview-canWrite').textContent).toBe('false');
    });
});

// ── Contributor ─────────────────────────────────────────────────────────────

describe('AgentDetailPage — Contributor (canWrite=true, canAdmin=false)', () => {
    beforeEach(() => {
        mockUseProject.mockReturnValue(makeProjectHook(true, false));
    });

    it('renders the Edit Agent button', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByText(/edit agent/i)).not.toBeNull();
    });

    it('renders the Restart button', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByText(/restart/i)).not.toBeNull();
    });

    it('does not render the Delete agent action', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByText(/delete agent/i)).toBeNull();
    });

    it('passes canWrite=true down to OverviewTab', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.getByTestId('overview-canWrite').textContent).toBe('true');
    });
});

// ── Admin ───────────────────────────────────────────────────────────────────

describe('AgentDetailPage — Admin (canWrite=true, canAdmin=true)', () => {
    beforeEach(() => {
        mockUseProject.mockReturnValue(makeProjectHook(true, true));
    });

    it('renders the Edit Agent, Restart, and Delete agent actions', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByText(/edit agent/i)).not.toBeNull();
        expect(screen.queryByText(/restart/i)).not.toBeNull();
        expect(screen.queryByText(/delete agent/i)).not.toBeNull();
    });

    it('passes canWrite=true down to OverviewTab', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.getByTestId('overview-canWrite').textContent).toBe('true');
    });
});

// ── DeleteConfirmModal lifecycle ────────────────────────────────────────────

describe('AgentDetailPage — DeleteConfirmModal always mounted', () => {
    beforeEach(() => {
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
    });

    it('mounts DeleteConfirmModal regardless of role (closed state)', async () => {
        renderPage();
        await screen.findByTestId('overview-tab');
        expect(screen.queryByTestId('delete-modal-closed')).not.toBeNull();
    });
});
