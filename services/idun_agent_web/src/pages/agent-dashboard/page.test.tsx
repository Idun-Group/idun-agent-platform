// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../hooks/use-project');
vi.mock('../../services/agents');

vi.mock('../../components/dashboard/agents/agent-card/component', () => ({
    default: ({
        agent,
        canWrite,
        canAdmin,
    }: {
        agent: { id: string; name: string };
        canWrite?: boolean;
        canAdmin?: boolean;
    }) => (
        <div data-testid={`agent-card-${agent.id}`}>
            <span>{agent.name}</span>
            {canWrite && <button>Edit</button>}
            {canAdmin && <button>Delete</button>}
        </div>
    ),
}));

vi.mock('../../components/applications/delete-confirm-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="delete-modal-open" /> : <div data-testid="delete-modal-closed" />,
}));

// Stub i18n — returns the key or fallback
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const map: Record<string, string> = {
                'dashboard.agent.title': 'Agents',
                'dashboard.agent.create': 'Create agent',
                'dashboard.search.placeholder': 'Search...',
            };
            return map[key] ?? key;
        },
    }),
}));

import { useProject } from '../../hooks/use-project';
import { listAgents, performHealthCheck } from '../../services/agents';
import type { BackendAgent } from '../../services/agents';
import AgentDashboardPage from './page';

const mockUseProject = vi.mocked(useProject);
const mockListAgents = vi.mocked(listAgents);

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
            <AgentDashboardPage />
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AgentDashboardPage — Reader (canWrite=false, canAdmin=false)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
        mockListAgents.mockResolvedValue([fixtureAgent]);
        vi.mocked(performHealthCheck).mockImplementation(() => undefined);
    });

    it('does not render the Create agent button in the header', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Create agent')).toBeNull();
        });
    });

    it('does not render the Add card (Connect a new agent)', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Connect a new agent')).toBeNull();
        });
    });
});

describe('AgentDashboardPage — Reader with no agents (empty state)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
        mockListAgents.mockResolvedValue([]);
        vi.mocked(performHealthCheck).mockImplementation(() => undefined);
    });

    it('does not render the Create agent button in the empty state', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Create agent')).toBeNull();
        });
    });
});

describe('AgentDashboardPage — Contributor (canWrite=true, canAdmin=false)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(makeProjectHook(true, false));
        mockListAgents.mockResolvedValue([fixtureAgent]);
        vi.mocked(performHealthCheck).mockImplementation(() => undefined);
    });

    it('renders the Create agent button in the header', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Create agent')).not.toBeNull();
        });
    });

    it('renders the Add card (Connect a new agent)', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Connect a new agent')).not.toBeNull();
        });
    });
});

describe('AgentDashboardPage — Contributor with no agents (empty state)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(makeProjectHook(true, false));
        mockListAgents.mockResolvedValue([]);
        vi.mocked(performHealthCheck).mockImplementation(() => undefined);
    });

    it('renders the Create agent button in the empty state', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Create agent')).not.toBeNull();
        });
    });
});

describe('AgentDashboardPage — Admin (canWrite=true, canAdmin=true)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(makeProjectHook(true, true));
        mockListAgents.mockResolvedValue([fixtureAgent]);
        vi.mocked(performHealthCheck).mockImplementation(() => undefined);
    });

    it('renders the Create agent button in the header', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Create agent')).not.toBeNull();
        });
    });

    it('renders the Add card (Connect a new agent)', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Connect a new agent')).not.toBeNull();
        });
    });

    it('passes canAdmin=true to agent cards (enabling per-card delete)', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Delete')).not.toBeNull();
        });
    });
});

describe('AgentDashboardPage — DeleteConfirmModal always mounted', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
        mockListAgents.mockResolvedValue([fixtureAgent]);
        vi.mocked(performHealthCheck).mockImplementation(() => undefined);
    });

    it('mounts DeleteConfirmModal regardless of role', async () => {
        renderPage();
        await vi.waitFor(() => {
            // Modal is always mounted (closed state), never conditionally rendered
            expect(screen.queryByTestId('delete-modal-closed')).not.toBeNull();
        });
    });
});
