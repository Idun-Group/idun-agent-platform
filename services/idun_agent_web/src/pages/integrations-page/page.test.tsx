// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../hooks/use-project');
vi.mock('../../hooks/use-workspace');
vi.mock('../../services/integrations');

// Stub modals so they don't need their own heavy deps
vi.mock('../../components/applications/create-integration-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="create-modal" /> : null,
}));

vi.mock('../../components/applications/delete-confirm-modal/component', () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="delete-modal-open" /> : <div data-testid="delete-modal-closed" />,
}));

// Stub i18n — returns the fallback (or key) and supports {{var}} interpolation
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
import { fetchIntegrations, deleteIntegration } from '../../services/integrations';
import type { ManagedIntegration } from '../../services/integrations';
import IntegrationsPage from './page';

const mockUseProject = vi.mocked(useProject);
const mockUseWorkspace = vi.mocked(useWorkspace);
const mockFetchIntegrations = vi.mocked(fetchIntegrations);

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

// ── Fixture integration ────────────────────────────────────────────────────

const fixtureIntegration: ManagedIntegration = {
    id: 'int-1',
    name: 'My Slack',
    integration: {
        provider: 'SLACK',
        enabled: true,
        config: {
            bot_token: 'xoxb-1234567890',
            signing_secret: 'abcdefghijklmnop',
        },
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
            <IntegrationsPage />
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('IntegrationsPage — Reader (canWrite=false, canAdmin=false)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(defaultWorkspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
        mockFetchIntegrations.mockResolvedValue([fixtureIntegration]);
        vi.mocked(deleteIntegration).mockResolvedValue(undefined);
    });

    it('does not render any provider "connect" button in the left sidebar', async () => {
        renderPage();
        // Active providers: WHATSAPP, DISCORD, SLACK, GOOGLE_CHAT — should not appear as clickable buttons
        // Their labels appear in the sidebar for adding integrations
        // We test that the provider picker buttons (WhatsApp, Discord, Slack, Google Chat) are not rendered
        const whatsapp = screen.queryByText('WhatsApp');
        const slack = screen.queryByText('Slack');
        const discord = screen.queryByText('Discord');
        const googleChat = screen.queryByText('Google Chat');

        expect(whatsapp).toBeNull();
        expect(slack).toBeNull();
        expect(discord).toBeNull();
        expect(googleChat).toBeNull();
    });

    it('does not render the Edit button on integration cards', async () => {
        renderPage();
        // Wait for async load to settle
        await vi.waitFor(() => {
            expect(screen.queryByText('Edit')).toBeNull();
        });
    });

    it('does not render the Remove button on integration cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Remove')).toBeNull();
        });
    });
});

describe('IntegrationsPage — Contributor (canWrite=true, canAdmin=false)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(defaultWorkspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(true, false));
        mockFetchIntegrations.mockResolvedValue([fixtureIntegration]);
        vi.mocked(deleteIntegration).mockResolvedValue(undefined);
    });

    it('renders provider buttons in the left sidebar', async () => {
        renderPage();
        // Active provider buttons should be present
        expect(screen.queryAllByText('WhatsApp').length).toBeGreaterThan(0);
        expect(screen.queryAllByText('Slack').length).toBeGreaterThan(0);
    });

    it('renders the Edit button on integration cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            const editBtns = screen.queryAllByText('Edit');
            expect(editBtns.length).toBeGreaterThan(0);
        });
    });

    it('does not render the Remove button on integration cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText('Remove')).toBeNull();
        });
    });
});

describe('IntegrationsPage — Admin (canWrite=true, canAdmin=true)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(defaultWorkspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(true, true));
        mockFetchIntegrations.mockResolvedValue([fixtureIntegration]);
        vi.mocked(deleteIntegration).mockResolvedValue(undefined);
    });

    it('renders provider buttons in the left sidebar', async () => {
        renderPage();
        expect(screen.getAllByText('WhatsApp').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Slack').length).toBeGreaterThan(0);
    });

    it('renders both Edit and Remove buttons on integration cards', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryAllByText('Edit').length).toBeGreaterThan(0);
            expect(screen.queryAllByText('Remove').length).toBeGreaterThan(0);
        });
    });
});

describe('IntegrationsPage — Reader with no integrations (empty state)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseWorkspace.mockReturnValue(defaultWorkspaceHook() as ReturnType<typeof useWorkspace>);
        mockUseProject.mockReturnValue(makeProjectHook(false, false));
        mockFetchIntegrations.mockResolvedValue([]);
        vi.mocked(deleteIntegration).mockResolvedValue(undefined);
    });

    it('renders reader-aware empty-state copy (passive title, ask-admin description)', async () => {
        renderPage();
        await vi.waitFor(() => {
            expect(screen.queryByText(/No integrations configured in Test Project/i)).not.toBeNull();
            expect(screen.queryByText(/Ask a contributor or admin to connect one/i)).not.toBeNull();
        });
        // The writer-flavored invitation to act must not appear for readers.
        expect(screen.queryByText(/Connect a messaging platform to get started/i)).toBeNull();
    });
});
