import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { Search, Bot, Activity, Database, Wrench, ShieldCheck, ArrowLeft } from 'lucide-react';
import { searchAll, type SearchResultGroup, type SearchResultItem } from '../../services/search';

// ---------------------------------------------------------------------------
// Route mapping
// ---------------------------------------------------------------------------

const RESOURCE_ROUTES: Record<string, string> = {
    agent: '/agents',
    observability: '/observability',
    memory: '/memory',
    mcp_server: '/mcp',
    guardrail: '/guardrails',
};

const RESOURCE_ICONS: Record<string, React.ComponentType<{ size: number }>> = {
    agent: Bot,
    observability: Activity,
    memory: Database,
    mcp_server: Wrench,
    guardrail: ShieldCheck,
};

const RESOURCE_LABELS: Record<string, string> = {
    agent: 'Agents',
    observability: 'Observability',
    memory: 'Memory',
    mcp_server: 'MCP Servers',
    guardrail: 'Guardrails',
};

// ---------------------------------------------------------------------------
// Highlight helper
// ---------------------------------------------------------------------------

function HighlightedName({ name, query }: { name: string; query: string }) {
    if (!query) return <>{name}</>;
    const idx = name.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{name}</>;
    return (
        <>
            {name.slice(0, idx)}
            <Hl>{name.slice(idx, idx + query.length)}</Hl>
            {name.slice(idx + query.length)}
        </>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GlobalSearch = () => {
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [groups, setGroups] = useState<SearchResultGroup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    // Expanded category: user drills into one category (back arrow to return)
    const [expandedType, setExpandedType] = useState<string | null>(null);
    const [expandedItems, setExpandedItems] = useState<SearchResultItem[]>([]);
    const [expandedTotal, setExpandedTotal] = useState(0);

    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const abortRef = useRef<AbortController | null>(null);
    const lastQueryRef = useRef('');

    // Core search — cancels any in-flight request
    const doSearch = useCallback(async (q: string, limit: number) => {
        const trimmed = q.trim();
        if (!trimmed) {
            setGroups([]);
            return;
        }

        // Abort previous request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        // Skip if identical to last completed query with same limit
        setIsLoading(true);
        try {
            const res = await searchAll(trimmed, limit);
            if (controller.signal.aborted) return;
            lastQueryRef.current = trimmed;
            setGroups(res.groups);
        } catch {
            if (!controller.signal.aborted) setGroups([]);
        } finally {
            if (!controller.signal.aborted) setIsLoading(false);
        }
    }, []);

    // Debounced input handler
    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            setQuery(val);
            clearTimeout(debounceRef.current);

            if (!val.trim()) {
                abortRef.current?.abort();
                setGroups([]);
                setExpandedItems([]);
                setExpandedTotal(0);
                setIsLoading(false);
                return;
            }

            // Show loading skeleton immediately (before debounce fires)
            setIsLoading(true);

            debounceRef.current = setTimeout(async () => {
                if (expandedType) {
                    // In expanded mode: search with high limit, filter to category
                    abortRef.current?.abort();
                    const controller = new AbortController();
                    abortRef.current = controller;
                    try {
                        const res = await searchAll(val.trim(), 50);
                        if (controller.signal.aborted) return;
                        const group = res.groups.find((g) => g.resource_type === expandedType);
                        setExpandedItems(group?.items ?? []);
                        setExpandedTotal(group?.total ?? 0);
                        // Also update overview groups in background
                        setGroups(res.groups);
                    } catch {
                        if (!controller.signal.aborted) {
                            setExpandedItems([]);
                            setExpandedTotal(0);
                        }
                    } finally {
                        if (!controller.signal.aborted) setIsLoading(false);
                    }
                } else {
                    doSearch(val, 3);
                }
            }, 800);
        },
        [doSearch, expandedType],
    );

    // Expand into a category (from header click or "See all")
    const handleExpand = useCallback(
        async (resourceType: string) => {
            setExpandedType(resourceType);

            // Use what we already have from overview for instant display
            const existing = groups.find((g) => g.resource_type === resourceType);
            setExpandedItems(existing?.items ?? []);
            setExpandedTotal(existing?.total ?? 0);

            // Fetch full list
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const res = await searchAll(query.trim(), 50);
                if (controller.signal.aborted) return;
                const full = res.groups.find((g) => g.resource_type === resourceType);
                setExpandedItems(full?.items ?? existing?.items ?? []);
                setExpandedTotal(full?.total ?? existing?.total ?? 0);
            } catch {
                // Keep existing items on error
            }
        },
        [query, groups],
    );

    // Back from expanded → overview
    const handleBack = useCallback(() => {
        setExpandedType(null);
        setExpandedItems([]);
        setExpandedTotal(0);
    }, []);

    // Navigate to a result
    const handleSelect = useCallback(
        (item: SearchResultItem) => {
            setIsOpen(false);
            setQuery('');
            setGroups([]);
            setExpandedType(null);
            setExpandedItems([]);
            setExpandedTotal(0);
            const base = RESOURCE_ROUTES[item.resource_type] ?? '/agents';
            if (item.resource_type === 'agent') {
                navigate(`${base}/${item.id}`);
            } else {
                navigate(base);
            }
        },
        [navigate],
    );

    // Close helper
    const closeDropdown = useCallback(() => {
        setIsOpen(false);
        setExpandedType(null);
        setExpandedItems([]);
        setExpandedTotal(0);
    }, []);

    // Outside click → close
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                closeDropdown();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [closeDropdown]);

    // Escape → close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeDropdown();
                inputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [closeDropdown]);

    // ⌘K shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                setIsOpen(true);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // Abort on unmount
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            clearTimeout(debounceRef.current);
        };
    }, []);

    const showDropdown = isOpen && query.trim().length > 0;
    const hasResults = groups.length > 0;

    return (
        <Container ref={containerRef}>
            <SearchBar $focused={isOpen}>
                <Search size={14} color="hsl(var(--muted-foreground) / 0.6)" />
                <Input
                    ref={inputRef}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    placeholder={expandedType ? `Search ${RESOURCE_LABELS[expandedType] ?? ''}...` : 'Search...'}
                />
                {!isOpen && <KbdHint>⌘K</KbdHint>}
            </SearchBar>

            {showDropdown && (
                <Dropdown>
                    {isLoading && groups.length === 0 && !expandedType && (
                        <SkeletonWrap>
                            {[0, 1, 2].map((i) => (
                                <SkeletonRow key={i} style={{ animationDelay: `${i * 0.08}s` }}>
                                    <SkeletonIcon />
                                    <SkeletonLines>
                                        <SkeletonBar $width={i === 0 ? '55%' : i === 1 ? '70%' : '45%'} />
                                        <SkeletonBar $width="30%" $short />
                                    </SkeletonLines>
                                </SkeletonRow>
                            ))}
                        </SkeletonWrap>
                    )}

                    {!isLoading && !hasResults && !expandedType && (
                        <EmptyState>
                            <Search size={32} color="hsl(var(--muted-foreground) / 0.3)" />
                            <EmptyText>No results for &ldquo;{query}&rdquo;</EmptyText>
                        </EmptyState>
                    )}

                    {/* Expanded category view */}
                    {expandedType && (
                        <>
                            <ExpandedHeader>
                                <BackBtn onClick={handleBack}>
                                    <ArrowLeft size={14} />
                                </BackBtn>
                                <SectionIcon as={RESOURCE_ICONS[expandedType] ?? Bot} size={14} />
                                <ExpandedTitle>{RESOURCE_LABELS[expandedType] ?? expandedType}</ExpandedTitle>
                                <ExpandedCount>{expandedTotal} results</ExpandedCount>
                            </ExpandedHeader>
                            <ExpandedList>
                                {expandedItems.length === 0 && !isLoading && (
                                    <EmptyState>
                                        <Search size={28} color="hsl(var(--muted-foreground) / 0.3)" />
                                        <EmptyText>No {(RESOURCE_LABELS[expandedType] ?? '').toLowerCase()} for &ldquo;{query}&rdquo;</EmptyText>
                                    </EmptyState>
                                )}
                                {expandedItems.map((item) => {
                                    const Icon = RESOURCE_ICONS[item.resource_type] ?? Bot;
                                    return (
                                        <ResultRow key={item.id} onClick={() => handleSelect(item)}>
                                            <RIcon><Icon size={13} /></RIcon>
                                            <RName><HighlightedName name={item.name} query={query} /></RName>
                                            {item.meta && <RMeta>{item.meta}</RMeta>}
                                        </ResultRow>
                                    );
                                })}
                            </ExpandedList>
                        </>
                    )}

                    {/* Overview: grouped results */}
                    {hasResults && !expandedType && groups.map((group) => {
                        const Icon = RESOURCE_ICONS[group.resource_type] ?? Bot;
                        return (
                            <Section key={group.resource_type}>
                                <SectionHeader onClick={() => handleExpand(group.resource_type)}>
                                    <SectionIcon as={Icon} size={14} />
                                    <SectionLabel>{group.label}</SectionLabel>
                                    <SectionCount>{group.total}</SectionCount>
                                </SectionHeader>
                                {group.items.map((item) => (
                                    <ResultRow key={item.id} onClick={() => handleSelect(item)}>
                                        <RIcon>
                                            <Icon size={13} />
                                        </RIcon>
                                        <RName><HighlightedName name={item.name} query={query} /></RName>
                                        {item.meta && <RMeta>{item.meta}</RMeta>}
                                    </ResultRow>
                                ))}
                                {group.total > group.items.length && (
                                    <SeeAll onClick={(e) => { e.stopPropagation(); handleExpand(group.resource_type); }}>
                                        See all {group.total} {group.label.toLowerCase()} <Arrow>&rarr;</Arrow>
                                    </SeeAll>
                                )}
                            </Section>
                        );
                    })}
                </Dropdown>
            )}
        </Container>
    );
};

export default GlobalSearch;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
    position: relative;
    flex: 0 1 420px;
`;

const SearchBar = styled.div<{ $focused: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: ${({ $focused }) => ($focused ? 'var(--overlay-light)' : 'var(--overlay-subtle)')};
    border: 1px solid ${({ $focused }) => ($focused ? 'hsla(262, 83%, 58%, 0.35)' : 'var(--border-light)')};
    border-radius: 9px;
    transition: all 0.2s ease;
    cursor: text;
    ${({ $focused }) => $focused && 'box-shadow: 0 0 0 3px hsla(262, 83%, 58%, 0.08);'}
`;

const Input = styled.input`
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-size: 13px;
    color: hsl(var(--foreground));
    font-family: inherit;

    &::placeholder {
        color: hsl(var(--muted-foreground) / 0.5);
    }
`;

const KbdHint = styled.span`
    margin-left: auto;
    color: hsl(var(--muted-foreground) / 0.3);
    font-size: 11px;
    border: 1px solid var(--border-light);
    padding: 2px 7px;
    border-radius: 4px;
    font-family: monospace;
`;

const dropIn = keyframes`
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
`;

const Dropdown = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.03);
    overflow: hidden;
    animation: ${dropIn} 0.2s ease;
    z-index: 100;
    max-height: 420px;
    overflow-y: auto;
`;

const Section = styled.div`
    padding: 4px 0;

    & + & {
        border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
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

    &:hover span:first-of-type {
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
`;

const SectionLabel = styled.span`
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
    opacity: 0.7;
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
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
`;

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

const RIcon = styled.div`
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

const RName = styled.span`
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

const RMeta = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    opacity: 0.55;
    flex-shrink: 0;
`;

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

const Arrow = styled.span`
    font-size: 13px;
    transition: transform 0.15s ease;

    ${SeeAll}:hover & {
        transform: translateX(3px);
    }
`;

const EmptyState = styled.div`
    padding: 28px 14px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
`;

const EmptyText = styled.div`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    opacity: 0.6;
`;

const ExpandedHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
`;

const BackBtn = styled.div`
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

// ---------------------------------------------------------------------------
// Skeleton loading
// ---------------------------------------------------------------------------

const shimmer = keyframes`
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
`;

const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
`;

const SkeletonWrap = styled.div`
    padding: 8px 0;
`;

const SkeletonRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    animation: ${fadeUp} 0.3s ease both;
`;

const SkeletonIcon = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    flex-shrink: 0;
    background: linear-gradient(
        90deg,
        var(--overlay-subtle) 25%,
        var(--overlay-light) 50%,
        var(--overlay-subtle) 75%
    );
    background-size: 200% 100%;
    animation: ${shimmer} 1.5s ease infinite;
`;

const SkeletonLines = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const SkeletonBar = styled.div<{ $width: string; $short?: boolean }>`
    height: ${({ $short }) => ($short ? '8px' : '10px')};
    width: ${({ $width }) => $width};
    border-radius: 4px;
    background: linear-gradient(
        90deg,
        var(--overlay-subtle) 25%,
        var(--overlay-light) 50%,
        var(--overlay-subtle) 75%
    );
    background-size: 200% 100%;
    animation: ${shimmer} 1.5s ease infinite;
`;
