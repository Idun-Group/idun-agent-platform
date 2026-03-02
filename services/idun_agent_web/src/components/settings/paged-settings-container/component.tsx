import { type ReactNode, useMemo } from 'react';
import styled from 'styled-components';

export type SettingsPage = {
    title: string;
    slug: string;
    group: string;
    content: ReactNode;
};

type Props = {
    pages: SettingsPage[];
    activeSlug: string;
    onPageChange: (slug: string) => void;
};

type GroupedPages = { group: string; pages: SettingsPage[] }[];

function groupPages(pages: SettingsPage[]): GroupedPages {
    const groups: GroupedPages = [];
    for (const page of pages) {
        const last = groups[groups.length - 1];
        if (last && last.group === page.group) {
            last.pages.push(page);
        } else {
            groups.push({ group: page.group, pages: [page] });
        }
    }
    return groups;
}

const PagedSettingsContainer = ({ pages, activeSlug, onPageChange }: Props) => {
    const grouped = useMemo(() => groupPages(pages), [pages]);
    const currentPage = pages.find((p) => p.slug === activeSlug) ?? pages[0];

    return (
        <Container>
            {/* Mobile: dropdown select */}
            <MobileNav>
                <MobileSelect
                    value={currentPage?.slug ?? ''}
                    onChange={(e) => onPageChange(e.target.value)}
                >
                    {grouped.map(({ group, pages: groupPages }) => (
                        <optgroup key={group} label={group}>
                            {groupPages.map((page) => (
                                <option key={page.slug} value={page.slug}>
                                    {page.title}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </MobileSelect>
            </MobileNav>

            {/* Desktop: sidebar + content grid */}
            <Grid>
                <Sidebar>
                    {grouped.map(({ group, pages: groupPages }) => (
                        <SidebarGroup key={group}>
                            <GroupLabel>{group}</GroupLabel>
                            {groupPages.map((page) => (
                                <TabItem
                                    key={page.slug}
                                    $isActive={page.slug === currentPage?.slug}
                                    onClick={() => onPageChange(page.slug)}
                                >
                                    {page.title}
                                </TabItem>
                            ))}
                        </SidebarGroup>
                    ))}
                </Sidebar>

                <Content>
                    {currentPage && 'content' in currentPage
                        ? currentPage.content
                        : null}
                </Content>
            </Grid>
        </Container>
    );
};

export default PagedSettingsContainer;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: 24px 32px;
    gap: 24px;
`;

const MobileNav = styled.nav`
    display: block;

    @media (min-width: 768px) {
        display: none;
    }
`;

const MobileSelect = styled.select`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #ffffff;
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23826F95' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;

    &:focus {
        outline: none;
        border-color: #8c52ff;
    }

    option,
    optgroup {
        background: #0a0a1a;
        color: #ffffff;
    }
`;

const Grid = styled.div`
    display: none;

    @media (min-width: 768px) {
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 32px;
        align-items: start;
    }
`;

const Sidebar = styled.nav`
    position: sticky;
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    padding-right: 16px;
`;

const SidebarGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;

    & + & {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
`;

const GroupLabel = styled.span`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #826f95;
    padding: 0 12px;
    margin-bottom: 4px;
`;

const TabItem = styled.button<{ $isActive?: boolean }>`
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: ${({ $isActive }) =>
        $isActive ? 'rgba(140, 82, 255, 0.12)' : 'transparent'};
    color: ${({ $isActive }) => ($isActive ? '#ffffff' : '#9ca3af')};
    font-size: 14px;
    font-weight: ${({ $isActive }) => ($isActive ? '600' : '400')};
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms ease;
    text-align: left;
    width: 100%;
    position: relative;

    ${({ $isActive }) =>
        $isActive &&
        `
        &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 16px;
            border-radius: 0 2px 2px 0;
            background: #8C52FF;
        }
    `}

    &:hover {
        background: ${({ $isActive }) =>
            $isActive ? 'rgba(140, 82, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)'};
        color: #ffffff;
    }
`;

const Content = styled.div`
    min-width: 0;
    overflow: hidden;
`;
