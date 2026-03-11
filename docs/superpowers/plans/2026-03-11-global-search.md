# Global Search Dropdown Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live search dropdown to the header that searches across agents and all config categories (observability, memory, MCP, guardrails), grouped by category with max 3 results each and expandable category views.

**Architecture:** Single `GlobalSearch` component replaces the static search placeholder in the header. On first focus, it fetches all entities client-side via existing `listAgents()` and `fetchApplications()` services. An 800ms debounce triggers filtering. Results render in a dropdown grouped by category. Clicking a category header expands to show all results for that category.

**Tech Stack:** React 19, styled-components, lucide-react icons, existing service layer (`listAgents`, `fetchApplications`)

**Spec:** `docs/superpowers/specs/2026-03-11-global-search-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/global-search/component.tsx` | **New.** GlobalSearch component — search input, dropdown, category sections, expanded view, all styled components |
| `src/layouts/header/layout.tsx` | **Modify.** Replace `SearchPlaceholder` with `<GlobalSearch />`, remove unused styled components |

## Chunk 1: GlobalSearch Component + Header Integration

### Task 1: Create GlobalSearch component with data fetching and filtering

**Files:**
- Create: `services/idun_agent_web/src/components/global-search/component.tsx`

This is the core component. It handles:
- Search input with focus/blur states
- Data fetching (lazy, on first focus)
- Debounced filtering (800ms)
- Grouped results with max 3 per category
- Expanded category view
- Match highlighting
- Navigation on result click
- Outside click and Escape to close

- [ ] **Step 1: Create the component file**

Create `src/components/global-search/component.tsx` with the full implementation:

```tsx
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
    Search,
    Bot,
    Activity,
    Database,
    Wrench,
    ShieldCheck,
    ArrowLeft,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/use-project';
import { listAgents, type BackendAgent } from '../../services/agents';
import { fetchApplications } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';

// ── Types ───────────────────────────────────────────────────────────────────

type SearchCategory = 'agents' | 'observability' | 'memory' | 'mcp' | 'guardrails';

type SearchResult = {
    id: string;
    name: string;
    meta: string; // e.g. "LangGraph", "Langfuse", "PromptInjection"
    category: SearchCategory;
    route: string; // where to navigate on click
};

type CategoryConfig = {
    key: SearchCategory;
    label: string;
    icon: typeof Bot;
    route: string;
};

const CATEGORIES: CategoryConfig[] = [
    { key: 'agents', label: 'Agents', icon: Bot, route: '/agents' },
    { key: 'observability', label: 'Observability', icon: Activity, route: '/observability' },
    { key: 'memory', label: 'Memory', icon: Database, route: '/memory' },
    { key: 'mcp', label: 'MCP Servers', icon: Wrench, route: '/mcp' },
    { key: 'guardrails', label: 'Guardrails', icon: ShieldCheck, route: '/guardrails' },
];

const MAX_PER_CATEGORY = 3;
const DEBOUNCE_MS = 800;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map BackendAgent to SearchResult */
const agentToResult = (agent: BackendAgent): SearchResult => ({
    id: agent.id,
    name: agent.name,
    meta: agent.framework,
    category: 'agents',
    route: `/agents/${agent.id}`,
});

/** Map ApplicationConfig to SearchResult */
const appToResult = (app: ApplicationConfig): SearchResult => {
    const categoryMap: Record<string, SearchCategory> = {
        Observability: 'observability',
        Memory: 'memory',
        MCP: 'mcp',
        Guardrails: 'guardrails',
    };
    const cat = categoryMap[app.category] ?? 'observability';
    const catConfig = CATEGORIES.find((c) => c.key === cat);
    return {
        id: app.id,
        name: app.name,
        meta: app.type,
        category: cat,
        route: catConfig?.route ?? '/',
    };
};

/** Highlight matching substring in JSX */
const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <Hl>{text.slice(idx, idx + query.length)}</Hl>
            {text.slice(idx + query.length)}
        </>
    );
};

// ── Component ───────────────────────────────────────────────────────────────

const GlobalSearch = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { selectedProjectId } = useProject();

    // UI state
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [expandedCategory, setExpandedCategory] = useState<SearchCategory | null>(null);

    // Data
    const [allResults, setAllResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const hasFetchedRef = useRef(false);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    // ── Fetch data on first focus ───────────────────────────────────────

    const fetchData = useCallback(async () => {
        if (hasFetchedRef.current) return;
        hasFetchedRef.current = true;
        setIsLoading(true);
        try {
            const [agents, apps] = await Promise.all([
                listAgents(),
                fetchApplications(),
            ]);
            const results: SearchResult[] = [
                ...agents.map(agentToResult),
                ...apps.map(appToResult),
            ];
            setAllResults(results);
        } catch (err) {
            console.error('GlobalSearch: failed to fetch data', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Invalidate cache when project changes
    useEffect(() => {
        hasFetchedRef.current = false;
        setAllResults([]);
        setQuery('');
        setIsOpen(false);
        setExpandedCategory(null);
    }, [selectedProjectId]);

    // ── Filtering ───────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return allResults.filter(
            (r) =>
                r.name.toLowerCase().includes(q) ||
                r.meta.toLowerCase().includes(q),
        );
    }, [allResults, query]);

    const grouped = useMemo(() => {
        const map = new Map<SearchCategory, SearchResult[]>();
        for (const cat of CATEGORIES) {
            const items = filtered.filter((r) => r.category === cat.key);
            if (items.length > 0) map.set(cat.key, items);
        }
        return map;
    }, [filtered]);

    // ── Handlers ────────────────────────────────────────────────────────

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            setQuery(val);
            setExpandedCategory(null);

            if (debounceRef.current) clearTimeout(debounceRef.current);

            if (!val.trim()) {
                setIsOpen(false);
                return;
            }

            debounceRef.current = setTimeout(() => {
                setIsOpen(true);
            }, DEBOUNCE_MS);
        },
        [],
    );

    const handleFocus = useCallback(() => {
        fetchData();
        // If there's already a query with results, re-open
        if (query.trim() && filtered.length > 0) {
            setIsOpen(true);
        }
    }, [fetchData, query, filtered.length]);

    const handleResultClick = useCallback(
        (result: SearchResult) => {
            setIsOpen(false);
            setQuery('');
            setExpandedCategory(null);
            navigate(result.route);
        },
        [navigate],
    );

    const handleCategoryClick = useCallback((cat: SearchCategory) => {
        setExpandedCategory(cat);
    }, []);

    const handleBack = useCallback(() => {
        setExpandedCategory(null);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        setExpandedCategory(null);
    }, []);

    // ── Outside click ───────────────────────────────────────────────────

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                close();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen, close]);

    // Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                close();
                inputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, close]);

    // ── Render ──────────────────────────────────────────────────────────

    const renderOverview = () => (
        <>
            {CATEGORIES.map((cat) => {
                const items = grouped.get(cat.key);
                if (!items) return null;
                const Icon = cat.icon;
                const shown = items.slice(0, MAX_PER_CATEGORY);
                const hasMore = items.length > MAX_PER_CATEGORY;

                return (
                    <Section key={cat.key}>
                        <SectionHeader onClick={() => handleCategoryClick(cat.key)}>
                            <SectionIcon>
                                <Icon size={14} />
                            </SectionIcon>
                            <SectionLabel>{cat.label}</SectionLabel>
                            <SectionCount>{items.length}</SectionCount>
                        </SectionHeader>
                        {shown.map((r) => (
                            <ResultRow key={r.id} onClick={() => handleResultClick(r)}>
                                <ResultIcon>
                                    <Icon size={13} />
                                </ResultIcon>
                                <ResultName>
                                    {highlightMatch(r.name, query)}
                                </ResultName>
                                <ResultMeta>{r.meta}</ResultMeta>
                            </ResultRow>
                        ))}
                        {hasMore && (
                            <SeeAll onClick={() => handleCategoryClick(cat.key)}>
                                {t('search.seeAll', 'See all {{count}} {{category}}', {
                                    count: items.length,
                                    category: cat.label.toLowerCase(),
                                })}
                                <SeeAllArrow>&rarr;</SeeAllArrow>
                            </SeeAll>
                        )}
                    </Section>
                );
            })}
        </>
    );

    const renderExpanded = () => {
        const cat = CATEGORIES.find((c) => c.key === expandedCategory);
        const items = expandedCategory ? grouped.get(expandedCategory) : null;
        if (!cat || !items) return null;
        const Icon = cat.icon;

        return (
            <>
                <ExpandedHeader>
                    <BackBtn onClick={handleBack}>
                        <ArrowLeft size={14} />
                    </BackBtn>
                    <SectionIcon>
                        <Icon size={14} />
                    </SectionIcon>
                    <ExpandedTitle>{cat.label}</ExpandedTitle>
                    <ExpandedCount>
                        {t('search.results', '{{count}} results', {
                            count: items.length,
                        })}
                    </ExpandedCount>
                </ExpandedHeader>
                <ExpandedList>
                    {items.map((r) => (
                        <ResultRow key={r.id} onClick={() => handleResultClick(r)}>
                            <ResultIcon>
                                <Icon size={13} />
                            </ResultIcon>
                            <ResultName>
                                {highlightMatch(r.name, query)}
                            </ResultName>
                            <ResultMeta>{r.meta}</ResultMeta>
                        </ResultRow>
                    ))}
                </ExpandedList>
            </>
        );
    };

    const renderEmpty = () => (
        <EmptyState>
            <EmptyIcon>
                <Search size={28} />
            </EmptyIcon>
            <EmptyText>
                {t('search.noResults', 'No results for "{{query}}"', {
                    query,
                })}
            </EmptyText>
        </EmptyState>
    );

    const showDropdown = isOpen && query.trim().length > 0;
    const hasResults = grouped.size > 0;

    return (
        <Container ref={containerRef}>
            <SearchBar $isOpen={showDropdown}>
                <SearchIcon size={14} />
                <SearchInput
                    ref={inputRef}
                    type="text"
                    placeholder={t('header.search', 'Search...')}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                />
            </SearchBar>

            {showDropdown && (
                <Dropdown>
                    {isLoading ? (
                        <LoadingText>
                            {t('search.loading', 'Loading...')}
                        </LoadingText>
                    ) : hasResults ? (
                        expandedCategory ? renderExpanded() : renderOverview()
                    ) : (
                        renderEmpty()
                    )}
                </Dropdown>
            )}
        </Container>
    );
};

export default GlobalSearch;

// ── Styled components ───────────────────────────────────────────────────────

const dropdownIn = keyframes`
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
    position: relative;
    flex: 0 1 420px;
`;

const SearchBar = styled.div<{ $isOpen: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: ${({ $isOpen }) =>
        $isOpen ? 'var(--overlay-light)' : 'var(--overlay-subtle)'};
    border: 1px solid ${({ $isOpen }) =>
        $isOpen ? 'hsla(var(--primary) / 0.35)' : 'var(--border-light)'};
    border-radius: 9px;
    transition: all 0.2s ease;
    box-shadow: ${({ $isOpen }) =>
        $isOpen ? '0 0 0 3px hsla(var(--primary) / 0.08)' : 'none'};

    &:focus-within {
        border-color: hsla(var(--primary) / 0.35);
        background: var(--overlay-light);
        box-shadow: 0 0 0 3px hsla(var(--primary) / 0.08);
    }
`;

const SearchIcon = styled(Search)`
    color: hsl(var(--muted-foreground));
    opacity: 0.6;
    flex-shrink: 0;
`;

const SearchInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: inherit;

    &::placeholder {
        color: hsl(var(--muted-foreground) / 0.5);
    }
`;

// ── Dropdown ────────────────────────────────────────────────────────────────

const Dropdown = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.03);
    overflow: hidden;
    animation: ${dropdownIn} 0.2s ease;
    z-index: 100;
    max-height: 420px;
    overflow-y: auto;
`;

// ── Sections ────────────────────────────────────────────────────────────────

const Section = styled.div`
    padding: 4px 0;

    & + & {
        border-top: 1px solid var(--border-subtle);
    }
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px 4px;
    cursor: pointer;
    transition: background 0.1s ease;

    &:hover {
        background: var(--overlay-subtle);
    }

    &:hover span {
        color: hsl(var(--primary));
        opacity: 1;
    }
`;

const SectionIcon = styled.span`
    color: hsl(var(--muted-foreground));
    opacity: 0.65;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    transition: all 0.1s ease;
`;

const SectionLabel = styled.span`
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
    opacity: 0.7;
    transition: all 0.1s ease;
`;

const SectionCount = styled.span`
    margin-left: auto;
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: hsl(var(--muted-foreground));
    opacity: 0.45;
    background: var(--overlay-subtle);
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
`;

// ── Result rows ─────────────────────────────────────────────────────────────

const ResultRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.12s ease;

    &:hover {
        background: var(--overlay-light);
    }
`;

const ResultIcon = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--overlay-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: hsl(var(--muted-foreground));
    transition: all 0.12s ease;

    ${ResultRow}:hover & {
        background: hsla(var(--primary) / 0.15);
        color: hsl(var(--primary));
    }
`;

const ResultName = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const Hl = styled.span`
    color: hsl(var(--primary));
    font-weight: 600;
`;

const ResultMeta = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    opacity: 0.55;
    flex-shrink: 0;
`;

// ── See all ─────────────────────────────────────────────────────────────────

const SeeAll = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px 8px;
    cursor: pointer;
    font-size: 11px;
    color: hsl(var(--primary));
    opacity: 0.7;
    transition: opacity 0.12s ease;

    &:hover {
        opacity: 1;
    }
`;

const SeeAllArrow = styled.span`
    font-size: 13px;
    transition: transform 0.15s ease;

    ${SeeAll}:hover & {
        transform: translateX(3px);
    }
`;

// ── Expanded view ───────────────────────────────────────────────────────────

const ExpandedHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-subtle);
`;

const BackBtn = styled.button`
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid var(--border-light);
    background: var(--overlay-subtle);
    color: hsl(var(--muted-foreground));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.12s ease;
    flex-shrink: 0;
    font-family: inherit;

    &:hover {
        background: var(--overlay-light);
        color: hsl(var(--foreground));
        border-color: rgba(255, 255, 255, 0.15);
    }
`;

const ExpandedTitle = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const ExpandedCount = styled.span`
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: hsl(var(--muted-foreground));
    opacity: 0.5;
    margin-left: auto;
`;

const ExpandedList = styled.div`
    max-height: 340px;
    overflow-y: auto;
    padding: 4px 0;
`;

// ── Empty / Loading ─────────────────────────────────────────────────────────

const EmptyState = styled.div`
    padding: 28px 14px;
    text-align: center;
`;

const EmptyIcon = styled.div`
    color: hsl(var(--muted-foreground));
    opacity: 0.3;
    margin-bottom: 8px;
`;

const EmptyText = styled.div`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    opacity: 0.6;
`;

const LoadingText = styled.div`
    padding: 20px 14px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    opacity: 0.6;
`;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `global-search/component.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/global-search/component.tsx
git commit -m "feat: add GlobalSearch component with grouped dropdown"
```

### Task 2: Integrate GlobalSearch into the header

**Files:**
- Modify: `services/idun_agent_web/src/layouts/header/layout.tsx`

Replace the static `SearchPlaceholder` with the new `GlobalSearch` component and remove the unused styled components.

- [ ] **Step 1: Update header layout**

In `src/layouts/header/layout.tsx`:

1. Add import at top:
```tsx
import GlobalSearch from '../../components/global-search/component';
```

2. Remove import of `Search` from lucide-react (no longer needed in header).

3. Replace the `CenterZone` contents:
```tsx
{/* Center: Global search */}
<CenterZone>
    <GlobalSearch />
</CenterZone>
```

4. Remove these unused styled components:
- `SearchPlaceholder`
- `SearchText`
- `KbdHint`

5. Remove the `margin: 0 32px` from `CenterZone` (the GlobalSearch component manages its own width via `flex: 0 1 420px`).

The final `CenterZone` styled component should be:
```tsx
const CenterZone = styled.div`
    flex: 1;
    display: flex;
    justify-content: center;
`;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean pass, no errors

- [ ] **Step 3: Verify in browser**

Run: `npm run dev` (if not already running)
1. Navigate to app, see search bar in header center
2. Click it, type "a", wait ~1 second — dropdown should appear with grouped results
3. Click a category header — expanded view shows all results
4. Click back button — returns to overview
5. Click a result row — navigates to the entity page
6. Press Escape — dropdown closes
7. Switch projects in the picker — search cache resets

- [ ] **Step 4: Commit**

```bash
git add src/layouts/header/layout.tsx
git commit -m "feat: integrate GlobalSearch into header, replace static placeholder"
```

### Task 3: Cleanup

**Files:**
- Delete: `services/idun_agent_web/public/design-preview-global-search.html`

- [ ] **Step 1: Remove design preview file**

```bash
rm services/idun_agent_web/public/design-preview-global-search.html
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove global search design preview"
```
