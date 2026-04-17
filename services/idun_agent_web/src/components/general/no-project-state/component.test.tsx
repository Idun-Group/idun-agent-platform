// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Stub i18n — return the fallback string (second arg) when present,
// else the key. Matches how the component calls t(key, fallback).
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

import NoProjectState from './component';

function renderAt(variant: Parameters<typeof NoProjectState>[0]['variant']) {
    return render(
        <MemoryRouter>
            <NoProjectState variant={variant} />
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
});

describe('NoProjectState — variant="none-selected"', () => {
    it('renders the "Select a project" CTA', () => {
        renderAt('none-selected');
        expect(screen.queryByRole('button', { name: /select a project/i })).not.toBeNull();
    });

    it('renders the description copy mentioning the top navbar selector', () => {
        renderAt('none-selected');
        // The description should hint that the project selector is in the top navbar.
        const matches = screen.queryAllByText(/navbar|top navbar|project selector/i);
        expect(matches.length).toBeGreaterThan(0);
    });

    it('renders the skeleton grid below the banner', () => {
        const { container } = renderAt('none-selected');
        const grid = container.querySelector('[data-testid="no-project-skeleton-grid"]');
        expect(grid).not.toBeNull();
        // Expect exactly 6 skeleton cards
        const cards = container.querySelectorAll('[data-testid="no-project-skeleton-card"]');
        expect(cards.length).toBe(6);
    });
});

describe('NoProjectState — variant="no-access-owner"', () => {
    it('renders the "Create project" CTA as a link to settings workspace-projects', () => {
        renderAt('no-access-owner');
        const cta = screen.queryByRole('link', { name: /create project/i });
        expect(cta).not.toBeNull();
        expect(cta?.getAttribute('href')).toBe('/settings/workspace-projects');
    });

    it('renders the description referencing "no projects"', () => {
        renderAt('no-access-owner');
        const matches = screen.queryAllByText(/no projects/i);
        expect(matches.length).toBeGreaterThan(0);
    });

    it('renders the skeleton grid below the banner', () => {
        const { container } = renderAt('no-access-owner');
        const grid = container.querySelector('[data-testid="no-project-skeleton-grid"]');
        expect(grid).not.toBeNull();
    });
});

describe('NoProjectState — variant="no-access-member"', () => {
    it('does not render any CTA button or link', () => {
        renderAt('no-access-member');
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('renders copy telling the user to ask a workspace owner', () => {
        renderAt('no-access-member');
        const matches = screen.queryAllByText(/workspace owner/i);
        expect(matches.length).toBeGreaterThan(0);
    });

    it('renders the skeleton grid below the banner', () => {
        const { container } = renderAt('no-access-member');
        const grid = container.querySelector('[data-testid="no-project-skeleton-grid"]');
        expect(grid).not.toBeNull();
    });
});

describe('NoProjectState — optional pageTitle / pageSubtitle', () => {
    it('renders pageTitle and pageSubtitle when provided', () => {
        render(
            <MemoryRouter>
                <NoProjectState
                    variant="none-selected"
                    pageTitle="MCP Servers"
                    pageSubtitle="Connect MCP servers to your agents."
                />
            </MemoryRouter>,
        );
        expect(screen.queryByText('MCP Servers')).not.toBeNull();
        expect(screen.queryByText('Connect MCP servers to your agents.')).not.toBeNull();
    });
});
