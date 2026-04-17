// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../hooks/use-workspace');
vi.mock('../../../hooks/use-project');
vi.mock('../../../services/projects');
vi.mock('../../../services/project-members');

vi.mock('../../applications/delete-confirm-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="delete-modal-open" /> : <div data-testid="delete-modal-closed" />,
}));

vi.mock('../project-members/invite-modal', () => ({
    default: ({ onClose }: { onClose: () => void }) => (
        <div data-testid="invite-modal">
            <button onClick={onClose}>Close invite</button>
        </div>
    ),
}));

import useWorkspace from '../../../hooks/use-workspace';
import { useProject } from '../../../hooks/use-project';
import { listProjects } from '../../../services/projects';
import { listProjectMembers } from '../../../services/project-members';
import WorkspaceProjectsTab from './component';
import MembersPanel from './members-panel';
import type { Project } from '../../../services/projects';
import type { ProjectMember } from '../../../services/project-members';

const mockUseWorkspace = vi.mocked(useWorkspace);
const mockUseProject = vi.mocked(useProject);
const mockListProjects = vi.mocked(listProjects);
const mockListProjectMembers = vi.mocked(listProjectMembers);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const fixtureProject: Project = {
    id: 'proj-1',
    workspace_id: 'ws-1',
    name: 'Alpha',
    description: 'Test project',
    is_default: false,
    current_user_role: 'reader',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
};

const fixtureMember: ProjectMember = {
    id: 'mem-1',
    user_id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    picture_url: null,
    role: 'contributor',
    created_at: '2024-01-01T00:00:00Z',
};

function makeWorkspaceHook(isOwner: boolean) {
    return {
        selectedWorkspaceId: 'ws-1',
        currentWorkspace: {
            id: 'ws-1',
            name: 'Test Workspace',
            is_owner: isOwner,
            default_project_id: null,
        },
        workspaces: [],
        isCurrentWorkspaceOwner: isOwner,
        setSelectedWorkspaceId: vi.fn(),
        getAllWorkspace: vi.fn().mockResolvedValue([]),
    };
}

function makeProjectHook(canAdmin: boolean) {
    return {
        selectedProjectId: 'proj-1',
        currentProject: {
            id: 'proj-1',
            workspace_id: 'ws-1',
            name: 'Alpha',
            is_default: false,
            current_user_role: canAdmin ? ('admin' as const) : ('reader' as const),
        },
        projects: [],
        currentRole: canAdmin ? ('admin' as const) : ('reader' as const),
        canWrite: canAdmin,
        canAdmin,
        isLoadingProjects: false,
        setSelectedProjectId: vi.fn(),
        refreshProjects: vi.fn().mockResolvedValue([]),
    };
}

function renderTab() {
    return render(
        <MemoryRouter>
            <WorkspaceProjectsTab />
        </MemoryRouter>,
    );
}

function renderPanel(project: Project, onClose = vi.fn()) {
    return render(
        <MemoryRouter>
            <MembersPanel project={project} onClose={onClose} />
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

// ── WorkspaceProjectsTab — Owner suite ───────────────────────────────────────

describe('WorkspaceProjectsTab — Owner', () => {
    beforeEach(() => {
        mockUseWorkspace.mockReturnValue(makeWorkspaceHook(true));
        mockUseProject.mockReturnValue(makeProjectHook(false));
        mockListProjects.mockResolvedValue([fixtureProject]);
    });

    it('renders the Create Project form', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryByText('Create Project')).not.toBeNull();
        });
    });

    it('renders per-row Rename button for each project', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryAllByText('Rename').length).toBeGreaterThan(0);
        });
    });

    it('renders per-row Delete button for non-default projects', async () => {
        renderTab();
        await vi.waitFor(() => {
            // DeleteButton has title="Delete" set via translation key 'common.delete'
            const deleteBtn = screen.queryByTitle('Delete');
            expect(deleteBtn).not.toBeNull();
        });
    });

    it('renders the Members button so the panel can be opened', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryByText('Members')).not.toBeNull();
        });
    });
});

// ── WorkspaceProjectsTab — Non-owner suite ───────────────────────────────────

describe('WorkspaceProjectsTab — Non-owner', () => {
    beforeEach(() => {
        mockUseWorkspace.mockReturnValue(makeWorkspaceHook(false));
        mockUseProject.mockReturnValue(makeProjectHook(false));
        mockListProjects.mockResolvedValue([fixtureProject]);
        mockListProjectMembers.mockResolvedValue([]);
    });

    it('does NOT render the Create Project form', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryByText('Create Project')).toBeNull();
        });
    });

    it('does NOT render a Rename button', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryByText('Rename')).toBeNull();
        });
    });

    it('does NOT render a Delete button', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryByTitle('Delete')).toBeNull();
        });
    });

    it('still renders the Members button so non-owners can open the panel', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryByText('Members')).not.toBeNull();
        });
    });

    it('opens the MembersPanel when the Members button is clicked', async () => {
        renderTab();
        await vi.waitFor(() => {
            expect(screen.queryByText('Members')).not.toBeNull();
        });
        fireEvent.click(screen.getByText('Members'));
        // Panel header appears: "<project name> — Members"
        await vi.waitFor(() => {
            // queryAllByText because "Alpha" also appears in the project row
            const matches = screen.queryAllByText(/Alpha/);
            // The panel header contains "Alpha — Members" so we look for that h3
            const panelHeader = matches.find((el) => el.textContent?.includes('Members'));
            expect(panelHeader).not.toBeUndefined();
        });
    });
});

// ── MembersPanel — project admin (canAdmin via project role) ─────────────────

describe('MembersPanel — project admin role', () => {
    beforeEach(() => {
        // Workspace non-owner, but project admin
        mockUseWorkspace.mockReturnValue(makeWorkspaceHook(false));
        mockUseProject.mockReturnValue(makeProjectHook(true));
        mockListProjectMembers.mockResolvedValue([fixtureMember]);
    });

    const adminProject: Project = {
        ...fixtureProject,
        current_user_role: 'admin',
    };

    it('renders the Add member button when user is project admin', async () => {
        renderPanel(adminProject);
        await vi.waitFor(() => {
            expect(screen.queryByText('Add')).not.toBeNull();
        });
    });

    it('renders the Remove button when user is project admin', async () => {
        renderPanel(adminProject);
        await vi.waitFor(() => {
            expect(screen.queryByTitle('Remove')).not.toBeNull();
        });
    });
});

// ── MembersPanel — project non-admin, workspace non-owner ───────────────────

describe('MembersPanel — reader role (no project admin, no workspace owner)', () => {
    beforeEach(() => {
        mockUseWorkspace.mockReturnValue(makeWorkspaceHook(false));
        mockUseProject.mockReturnValue(makeProjectHook(false));
        mockListProjectMembers.mockResolvedValue([fixtureMember]);
    });

    const readerProject: Project = {
        ...fixtureProject,
        current_user_role: 'reader',
    };

    it('does NOT render the Add member button', async () => {
        renderPanel(readerProject);
        await vi.waitFor(() => {
            expect(screen.queryByText('Add')).toBeNull();
        });
    });

    it('does NOT render the Remove button', async () => {
        renderPanel(readerProject);
        await vi.waitFor(() => {
            expect(screen.queryByTitle('Remove')).toBeNull();
        });
    });
});

// ── MembersPanel — workspace owner but NOT project admin ────────────────────
// (confirms workspace ownership alone does NOT grant member-management access)

describe('MembersPanel — workspace owner but reader project role', () => {
    beforeEach(() => {
        mockUseWorkspace.mockReturnValue(makeWorkspaceHook(true));
        mockUseProject.mockReturnValue(makeProjectHook(false));
        mockListProjectMembers.mockResolvedValue([fixtureMember]);
    });

    const ownerAsReaderProject: Project = {
        ...fixtureProject,
        current_user_role: 'reader',
    };

    it('does NOT render the Add member button when workspace owner is a project reader', async () => {
        renderPanel(ownerAsReaderProject);
        await vi.waitFor(() => {
            expect(screen.queryByText('Add')).toBeNull();
        });
    });

    it('does NOT render the Remove button when workspace owner is a project reader', async () => {
        renderPanel(ownerAsReaderProject);
        await vi.waitFor(() => {
            expect(screen.queryByTitle('Remove')).toBeNull();
        });
    });
});
