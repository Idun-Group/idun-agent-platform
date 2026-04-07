import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { notify } from '../../components/toast/notify';
import {
    Search, Plus, Bot, ExternalLink, ChevronUp, ChevronDown,
    ChevronsUpDown, Download, Trash2, Square, CheckSquare,
} from 'lucide-react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { BackendAgent } from '../../services/agents';
import { listAgents, deleteAgent, performHealthCheck } from '../../services/agents';
import { AgentAvatar } from '../../components/general/agent-avatar/component';
import { FeatureIcons, detectAgentFeatures } from '../../components/dashboard/agents/agent-card/feature-icons';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';

// ── Animations ────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
`;

const pulse = keyframes`
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.85); }
`;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    active:     '#34d399',
    error:      '#f87171',
    deprecated: '#fbbf24',
    inactive:   '#6b7a8d',
    draft:      '#6b7a8d',
};

const FW_LABELS: Record<string, string> = {
    LANGGRAPH: 'LangGraph', ADK: 'ADK', HAYSTACK: 'Haystack',
    CREWAI: 'CrewAI', CUSTOM: 'Custom',
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

function isNew(iso: string): boolean {
    return Date.now() - new Date(iso).getTime() < SEVEN_DAYS_MS;
}

function exportCSV(agents: BackendAgent[]) {
    const headers = ['Name', 'Status', 'Framework', 'Version', 'Endpoint', 'Port', 'Created', 'Updated'];
    const rows = agents.map(a => [
        a.name,
        a.status,
        FW_LABELS[a.framework] ?? a.framework,
        a.version ?? '',
        a.base_url ?? '',
        String(a.engine_config?.server?.api?.port ?? ''),
        a.created_at,
        a.updated_at,
    ]);
    const csv = [headers, ...rows]
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Highlight component ───────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <Mark>{text.slice(idx, idx + query.length)}</Mark>
            {text.slice(idx + query.length)}
        </>
    );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string | null; sortDir: 'asc' | 'desc' }) {
    if (sortField !== field) return <ChevronsUpDown size={12} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
}

// ── Table row ─────────────────────────────────────────────────────────────────

function AgentTableRow({
    agent, onDelete, onClick, isChecked, onCheck, isChecking, searchTerm,
}: {
    agent: BackendAgent;
    onDelete: () => void;
    onClick: () => void;
    isChecked: boolean;
    onCheck: (e: React.MouseEvent) => void;
    isChecking: boolean;
    searchTerm: string;
}) {
    const color = STATUS_COLORS[agent.status] ?? STATUS_COLORS.draft;
    const port = agent.engine_config?.server?.api?.port;
    const features = detectAgentFeatures(agent);
    const hasAnyFeature = Object.values(features).some(Boolean);
    const agentIsNew = isNew(agent.created_at);

    return (
        <TableRow onClick={onClick} $checked={isChecked}>
            <Td $checkbox onClick={onCheck}>
                {isChecked
                    ? <CheckSquare size={15} color="#4a9ede" />
                    : <Square size={15} color="#4a5568" />
                }
            </Td>
            <Td>
                <RowAgent>
                    <AgentAvatar name={agent.name} size={32} />
                    <div>
                        <RowAgentNameRow>
                            <RowAgentName>
                                <Highlight text={agent.name} query={searchTerm} />
                            </RowAgentName>
                            {agentIsNew && <NewBadge>NEW</NewBadge>}
                        </RowAgentNameRow>
                        {agent.description && (
                            <RowAgentDesc title={agent.description}>
                                <Highlight
                                    text={agent.description.length > 52 ? agent.description.slice(0, 52) + '…' : agent.description}
                                    query={searchTerm}
                                />
                            </RowAgentDesc>
                        )}
                    </div>
                </RowAgent>
            </Td>
            <Td>
                <StatusChip $color={color}>
                    {isChecking
                        ? <PulsingDot $color="#f59e0b" />
                        : <StatusDot $color={color} />
                    }
                    {isChecking ? 'checking' : agent.status}
                </StatusChip>
            </Td>
            <Td>
                <FwChip>{FW_LABELS[agent.framework] ?? agent.framework}</FwChip>
            </Td>
            <Td>
                {agent.version
                    ? <VersionChip>v{agent.version}</VersionChip>
                    : <Muted>—</Muted>
                }
            </Td>
            <Td>
                {hasAnyFeature
                    ? <FeatureIcons agent={agent} compact />
                    : <Muted>None</Muted>
                }
            </Td>
            <Td>
                {agent.base_url ? (
                    <UrlCell onClick={e => e.stopPropagation()}>
                        <a href={agent.base_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                            <ExternalLink size={11} />
                        </a>
                        <span>{agent.base_url.replace(/^https?:\/\//, '').slice(0, 26)}</span>
                        {port && <PortTag>:{port}</PortTag>}
                    </UrlCell>
                ) : (
                    <Muted>{port ? `:${port}` : '—'}</Muted>
                )}
            </Td>
            <Td>
                <UpdatedCell>{relativeTime(agent.updated_at)}</UpdatedCell>
            </Td>
            <Td>
                <RowActions onClick={e => e.stopPropagation()}>
                    <RowActionBtn onClick={onClick}>View</RowActionBtn>
                    <RowActionBtn $danger onClick={onDelete}><Trash2 size={12} /></RowActionBtn>
                </RowActions>
            </Td>
        </TableRow>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SortField = 'name' | 'status' | 'version' | 'updated_at';

const AgentDashboardPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const searchRef = useRef<HTMLInputElement>(null);

    const [agents, setAgents] = useState<BackendAgent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [fwFilter, setFwFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [agentToDelete, setAgentToDelete] = useState<BackendAgent | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    // ── Load agents + health checks ──────────────────────────────────────────
    // TODO: Add server-side pagination here. The backend already supports
    // limit/offset on /api/v1/agents/. We currently fetch up to the backend
    // max (1000) at once and rely on client-side scrolling. Once the agent
    // count grows past a few hundred, switch to paginated fetches with a
    // page-based UI (see git history for the prior implementation).
    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        listAgents({ limit: 1000, offset: 0 })
            .then((rows) => {
                if (cancelled) return;
                // Dedupe by id (defensive)
                const seen = new Set<string>();
                const unique = rows.filter(r => {
                    if (seen.has(r.id)) return false;
                    seen.add(r.id);
                    return true;
                });

                setAgents(unique);
                const ids = new Set(unique.map(a => a.id));
                setCheckingIds(ids);
                for (const agent of unique) {
                    const started = Date.now();
                    performHealthCheck(agent, (updated) => {
                        if (cancelled) return;
                        const elapsed = Date.now() - started;
                        const settle = () => {
                            if (cancelled) return;
                            setAgents(prev => prev.map(a => a.id === updated.id ? updated : a));
                            setCheckingIds(prev => {
                                const next = new Set(prev);
                                next.delete(updated.id);
                                return next;
                            });
                        };
                        const remaining = 1200 - elapsed;
                        if (remaining > 0) setTimeout(settle, remaining);
                        else settle();
                    });
                }
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                notify.error(message);
            })
            .finally(() => setIsLoading(false));
        return () => { cancelled = true; };
    }, []);

    // ── Keyboard shortcut: Cmd/Ctrl+K → focus search ─────────────────────────

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // ── Derived data ──────────────────────────────────────────────────────────

    const frameworks = useMemo(() => [...new Set(agents.map(a => a.framework))], [agents]);
    const statuses   = useMemo(() => [...new Set(agents.map(a => a.status))], [agents]);

    const filteredAgents = useMemo(() => {
        let result = agents;
        if (fwFilter !== 'all')     result = result.filter(a => a.framework === fwFilter);
        if (statusFilter !== 'all') result = result.filter(a => a.status === statusFilter);
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            result = result.filter(a =>
                a.name.toLowerCase().includes(q) ||
                (a.description ?? '').toLowerCase().includes(q) ||
                a.framework.toLowerCase().includes(q) ||
                (a.version ?? '').toLowerCase().includes(q)
            );
        }
        if (sortField) {
            result = [...result].sort((a, b) => {
                const va = (sortField === 'name' ? a.name
                    : sortField === 'status' ? a.status
                    : sortField === 'version' ? (a.version ?? '')
                    : a.updated_at) ?? '';
                const vb = (sortField === 'name' ? b.name
                    : sortField === 'status' ? b.status
                    : sortField === 'version' ? (b.version ?? '')
                    : b.updated_at) ?? '';
                return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            });
        }
        return result;
    }, [agents, fwFilter, statusFilter, searchTerm, sortField, sortDir]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleSort = useCallback((field: SortField) => {
        setSortField(prev => {
            if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return field; }
            setSortDir('asc');
            return field;
        });
    }, []);

    const allSelected = filteredAgents.length > 0 && filteredAgents.every(a => selectedIds.has(a.id));

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAgents.map(a => a.id)));
        }
    };

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleDeleteConfirm = async () => {
        if (!agentToDelete) return;
        try {
            await deleteAgent(agentToDelete.id);
            notify.success('Agent deleted');
            setAgents(prev => prev.filter(a => a.id !== agentToDelete.id));
            setSelectedIds(prev => { const n = new Set(prev); n.delete(agentToDelete.id); return n; });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete agent';
            notify.error(message);
            throw err;
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        setBulkDeleting(true);
        let failed = 0;
        for (const id of selectedIds) {
            try {
                await deleteAgent(id);
                setAgents(prev => prev.filter(a => a.id !== id));
            } catch { failed++; }
        }
        setSelectedIds(new Set());
        setBulkDeleting(false);
        if (failed > 0) notify.error(`${failed} agent(s) failed to delete`);
        else notify.success(`${selectedIds.size} agent(s) deleted`);
    };

    // ── Stats ─────────────────────────────────────────────────────────────────

    const activeCount = agents.filter(a => a.status === 'active').length;
    const draftCount  = agents.filter(a => a.status === 'draft').length;

    // ── Chart data ────────────────────────────────────────────────────────────

    const statusChartData = useMemo(() => [
        { name: 'Active', value: activeCount, color: '#34d399' },
        { name: 'Draft', value: draftCount, color: '#f59e0b' },
    ].filter(d => d.value > 0), [activeCount, draftCount]);

    const fwChartData = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const a of agents) {
            const label = FW_LABELS[a.framework] ?? a.framework;
            counts[label] = (counts[label] ?? 0) + 1;
        }
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [agents]);

    const integrationChartData = useMemo(() => {
        const INTEG = [
            { key: 'hasObservability', label: 'Observability', color: '#22d3ee' },
            { key: 'hasMemory',        label: 'Memory',        color: '#60a5fa' },
            { key: 'hasGuardrails',    label: 'Guardrails',    color: '#34d399' },
            { key: 'hasMcp',           label: 'MCP',           color: '#fbbf24' },
            { key: 'hasSso',           label: 'SSO',           color: '#f472b6' },
            { key: 'hasIntegrations',  label: 'Integrations',  color: '#25d366' },
        ] as const;
        return INTEG.map(i => {
            const count = agents.filter(a => detectAgentFeatures(a)[i.key]).length;
            return { name: i.label, value: count, color: i.color, total: agents.length };
        });
    }, [agents]);

    // ── Empty state ───────────────────────────────────────────────────────────

    if (!isLoading && agents.length === 0) {
        return (
            <PageWrapper>
                <PageHeader>
                    <TitleBlock>
                        <Breadcrumb>Dashboard</Breadcrumb>
                        <PageTitle>{t('dashboard.agent.title')}</PageTitle>
                    </TitleBlock>
                    <CreateButton onClick={() => navigate('/agents/create')}>
                        <Plus size={16} /> {t('dashboard.agent.create')}
                    </CreateButton>
                </PageHeader>
                <EmptyState>
                    <EmptyIcon><Bot size={48} strokeWidth={1.2} /></EmptyIcon>
                    <EmptyTitle>No agents yet</EmptyTitle>
                    <EmptyDescription>Create your first agent to start monitoring and managing your AI workflows.</EmptyDescription>
                    <CreateButton onClick={() => navigate('/agents/create')}>
                        <Plus size={18} /> {t('dashboard.agent.create')}
                    </CreateButton>
                </EmptyState>
            </PageWrapper>
        );
    }

    return (
        <PageWrapper>
            {/* ── Header ── */}
            <PageHeader>
                <TitleBlock>
                    <Breadcrumb>Dashboard</Breadcrumb>
                    <PageTitle>{t('dashboard.agent.title')}</PageTitle>
                </TitleBlock>
                <HeaderActions>
                    <CreateButton onClick={() => navigate('/agents/create')}>
                        <Plus size={15} /> {t('dashboard.agent.create')}
                    </CreateButton>
                </HeaderActions>
            </PageHeader>

            {isLoading ? (
                <CenterBox>
                    <LoadingSpinner />
                    <LoadingText>Loading agents...</LoadingText>
                </CenterBox>
            ) : (
                <>

                    {/* ── Charts ── */}
                    {agents.length > 0 && (
                        <ChartsRow>
                            {/* Status donut */}
                            <ChartCard>
                                <ChartTitle>Agent Status</ChartTitle>
                                <DonutWrap>
                                    <ResponsiveContainer width="100%" height={160}>
                                        <PieChart>
                                            <Pie
                                                data={statusChartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={45}
                                                outerRadius={65}
                                                paddingAngle={3}
                                                dataKey="value"
                                                strokeWidth={0}
                                                animationBegin={0}
                                                animationDuration={800}
                                            >
                                                {statusChartData.map((d, i) => (
                                                    <Cell key={i} fill={d.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ background: '#141a26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                                                itemStyle={{ color: '#e1e4e8' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <DonutCenter>
                                        <DonutTotal>{agents.length}</DonutTotal>
                                        <DonutLabel>total</DonutLabel>
                                    </DonutCenter>
                                </DonutWrap>
                                <ChartLegend>
                                    {statusChartData.map(d => (
                                        <LegendItem key={d.name}>
                                            <LegendDot $color={d.color} />
                                            <LegendLabel>{d.name}</LegendLabel>
                                            <LegendValue>{d.value}</LegendValue>
                                        </LegendItem>
                                    ))}
                                </ChartLegend>
                            </ChartCard>

                            {/* Framework breakdown */}
                            <ChartCard>
                                <ChartTitle>By Framework</ChartTitle>
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart
                                        data={fwChartData}
                                        layout="vertical"
                                        margin={{ top: 4, right: 20, left: 0, bottom: 4 }}
                                        barCategoryGap="28%"
                                    >
                                        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
                                        <XAxis type="number" hide allowDecimals={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={85}
                                            tick={{ fill: '#6b7a8d', fontSize: 12 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: '#141a26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                                            itemStyle={{ color: '#e1e4e8' }}
                                            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={600}>
                                            {fwChartData.map((_, i) => (
                                                <Cell key={i} fill={['#4a9ede', '#22d3ee', '#fbbf24', '#f472b6', '#34d399'][i % 5]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Integration adoption */}
                            <ChartCard>
                                <ChartTitle>Integration Adoption</ChartTitle>
                                <AdoptionList>
                                    {integrationChartData.map(d => (
                                        <AdoptionRow key={d.name}>
                                            <AdoptionLabel>{d.name}</AdoptionLabel>
                                            <AdoptionBarTrack>
                                                <AdoptionBarFill
                                                    $color={d.color}
                                                    $pct={d.total > 0 ? (d.value / d.total) * 100 : 0}
                                                />
                                            </AdoptionBarTrack>
                                            <AdoptionCount $color={d.color}>
                                                {d.value}<span>/{d.total}</span>
                                            </AdoptionCount>
                                        </AdoptionRow>
                                    ))}
                                </AdoptionList>
                            </ChartCard>
                        </ChartsRow>
                    )}

                    {/* ── Table card ── */}
                    <TableCard>
                        {/* Header */}
                        <TableCardHeader>
                            <TableHeaderLeft>
                                <TableTitle>All Agents</TableTitle>
                                <CountBadge>{filteredAgents.length}</CountBadge>
                                <InlineSearch>
                                    <Search size={12} style={{ color: '#6b7a8d', flexShrink: 0 }} />
                                    <InlineSearchInput
                                        ref={searchRef}
                                        placeholder="Search by name…"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </InlineSearch>
                            </TableHeaderLeft>
                            <TableHeaderFilters>
                                {/* Status filters */}
                                <FilterGroup>
                                    <FwFilterBtn $active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FwFilterBtn>
                                    {statuses.map(s => (
                                        <FwFilterBtn key={s} $active={statusFilter === s} $color={STATUS_COLORS[s]} onClick={() => setStatusFilter(s)}>
                                            {s}
                                        </FwFilterBtn>
                                    ))}
                                </FilterGroup>
                                <FilterDivider />
                                {/* Framework filters */}
                                <FilterGroup>
                                    <FwFilterBtn $active={fwFilter === 'all'} onClick={() => setFwFilter('all')}>All</FwFilterBtn>
                                    {frameworks.map(fw => (
                                        <FwFilterBtn key={fw} $active={fwFilter === fw} onClick={() => setFwFilter(fw)}>
                                            {FW_LABELS[fw] ?? fw}
                                        </FwFilterBtn>
                                    ))}
                                </FilterGroup>
                                <FilterDivider />
                                <ExportBtn onClick={() => exportCSV(filteredAgents)} title="Export as CSV">
                                    <Download size={13} /> CSV
                                </ExportBtn>
                            </TableHeaderFilters>
                        </TableCardHeader>

                        {/* Bulk action bar */}
                        {selectedIds.size > 0 && (
                            <BulkBar>
                                <BulkCount>{selectedIds.size} selected</BulkCount>
                                <BulkDeleteBtn onClick={handleBulkDelete} disabled={bulkDeleting}>
                                    <Trash2 size={13} />
                                    {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
                                </BulkDeleteBtn>
                                <BulkClearBtn onClick={() => setSelectedIds(new Set())}>Clear</BulkClearBtn>
                            </BulkBar>
                        )}

                        {/* Table */}
                        <TableScroll>
                            <Table>
                                <thead>
                                    <StickyTr>
                                        <Th $checkbox onClick={e => { e.stopPropagation(); toggleSelectAll(); }}>
                                            {allSelected
                                                ? <CheckSquare size={14} color="#4a9ede" />
                                                : <Square size={14} color="#4a5568" />
                                            }
                                        </Th>
                                        <ThSortable onClick={() => handleSort('name')}>
                                            Name <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                                        </ThSortable>
                                        <ThSortable onClick={() => handleSort('status')}>
                                            Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                                        </ThSortable>
                                        <Th>Framework</Th>
                                        <ThSortable onClick={() => handleSort('version')}>
                                            Version <SortIcon field="version" sortField={sortField} sortDir={sortDir} />
                                        </ThSortable>
                                        <Th>Integrations</Th>
                                        <Th>Endpoint</Th>
                                        <ThSortable onClick={() => handleSort('updated_at')}>
                                            Updated <SortIcon field="updated_at" sortField={sortField} sortDir={sortDir} />
                                        </ThSortable>
                                        <Th></Th>
                                    </StickyTr>
                                </thead>
                                <tbody>
                                    {filteredAgents.map(agent => (
                                        <AgentTableRow
                                            key={agent.id}
                                            agent={agent}
                                            onClick={() => navigate(`/agents/${agent.id}`)}
                                            onDelete={() => setAgentToDelete(agent)}
                                            isChecked={selectedIds.has(agent.id)}
                                            onCheck={(e) => toggleSelect(agent.id, e)}
                                            isChecking={checkingIds.has(agent.id)}
                                            searchTerm={searchTerm}
                                        />
                                    ))}
                                </tbody>
                            </Table>
                        </TableScroll>

                        {filteredAgents.length === 0 && (
                            <NoResults>
                                {searchTerm
                                    ? <>No agents match <em>"{searchTerm}"</em></>
                                    : 'No agents match the current filters'
                                }
                            </NoResults>
                        )}
                    </TableCard>
                </>
            )}

            <DeleteConfirmModal
                isOpen={!!agentToDelete}
                onClose={() => setAgentToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={agentToDelete?.name ?? ''}
            />
        </PageWrapper>
    );
};

export default AgentDashboardPage;

// ── Styled components ─────────────────────────────────────────────────────────

const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 28px 32px;
    gap: 20px;
    animation: ${fadeIn} 0.25s ease;
    background: #0a0e17;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    overflow: hidden;
`;

const PageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
`;

const TitleBlock = styled.div``;

const Breadcrumb = styled.span`
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
`;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: #e8edf5;
    margin: 0;
    letter-spacing: -0.02em;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const CreateButton = styled.button`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 16px;
    height: 36px;
    background: #0C5CAB;
    border: none;
    border-radius: 8px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
    white-space: nowrap;

    &:hover {
        background: #0a4f95;
        box-shadow: 0 4px 12px rgba(12, 92, 171, 0.3);
    }
`;

// ── Table card ────────────────────────────────────────────────────────────────

const TableCard = styled.div`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
`;

const TableCardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.015);
    gap: 12px;
    flex-wrap: wrap;
`;

const TableHeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
`;

const InlineSearch = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    padding: 0 9px;
    height: 28px;
    margin-left: 10px;
    max-width: 240px;
    flex: 1;
    transition: border-color 0.15s;

    &:focus-within {
        border-color: rgba(74, 158, 222, 0.45);
        background: rgba(74, 158, 222, 0.05);
    }
`;

const InlineSearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: #e8edf5;
    font-size: 12px;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    flex: 1;
    min-width: 0;

    &::placeholder { color: #4a5568; }
`;

const TableTitle = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #c9d1d9;
`;

const CountBadge = styled.span`
    font-size: 11px;
    font-weight: 600;
    color: #6b7a8d;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 1px 8px;
`;

const TableHeaderFilters = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
`;

const FilterGroup = styled.div`
    display: flex;
    gap: 4px;
`;

const FilterDivider = styled.div`
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.08);
    margin: 0 2px;
`;

const FwFilterBtn = styled.button<{ $active?: boolean; $color?: string }>`
    padding: 4px 11px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    transition: all 0.12s;
    text-transform: capitalize;
    border: 1px solid ${p => p.$active ? 'rgba(12, 92, 171, 0.5)' : 'rgba(255,255,255,0.07)'};
    background: ${p => p.$active ? 'rgba(12, 92, 171, 0.15)' : 'transparent'};
    color: ${p => p.$active ? (p.$color ?? '#4a9ede') : '#6b7a8d'};

    &:hover {
        border-color: rgba(12, 92, 171, 0.4);
        color: #8ab8de;
        background: rgba(12, 92, 171, 0.08);
    }
`;

const ExportBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.07);
    color: #6b7a8d;
    transition: all 0.12s;

    &:hover {
        color: #e1e4e8;
        border-color: rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.04);
    }
`;

// ── Bulk action bar ───────────────────────────────────────────────────────────

const BulkBar = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    background: rgba(12, 92, 171, 0.08);
    border-bottom: 1px solid rgba(12, 92, 171, 0.2);
`;

const BulkCount = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #4a9ede;
    flex: 1;
`;

const BulkDeleteBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.25);
    color: #f87171;
    transition: all 0.12s;

    &:hover:not(:disabled) { background: rgba(248, 113, 113, 0.18); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const BulkClearBtn = styled.button`
    padding: 5px 12px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: #6b7a8d;
    transition: all 0.12s;

    &:hover { color: #e1e4e8; }
`;

// ── Table ─────────────────────────────────────────────────────────────────────

const TableScroll = styled.div`
    flex: 1;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;

    /* Hide scrollbar — keep scroll functionality */
    scrollbar-width: none;          /* Firefox */
    -ms-overflow-style: none;       /* IE / old Edge */
    &::-webkit-scrollbar { display: none; }  /* Chrome, Safari, new Edge */

    /* Sticky table header inside the scrollable area */
    thead tr { position: sticky; top: 0; z-index: 2; background: #0d1421; }
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    min-width: 800px;
`;

const StickyTr = styled.tr`
    position: sticky;
    top: 0;
    z-index: 2;
    background: #0d1220;
`;

const Th = styled.th<{ $checkbox?: boolean }>`
    padding: 12px ${p => p.$checkbox ? '12px 12px 20px' : '20px'};
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    white-space: nowrap;
    width: ${p => p.$checkbox ? '40px' : 'auto'};
    cursor: ${p => p.$checkbox ? 'pointer' : 'default'};
`;

const ThSortable = styled(Th)`
    cursor: pointer;
    user-select: none;
    display: table-cell;

    svg { vertical-align: middle; margin-left: 4px; }

    &:hover { color: #e1e4e8; }
`;

const TableRow = styled.tr<{ $checked?: boolean }>`
    cursor: pointer;
    transition: background 0.1s;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    background: ${p => p.$checked ? 'rgba(12, 92, 171, 0.06)' : 'transparent'};

    &:hover { background: ${p => p.$checked ? 'rgba(12, 92, 171, 0.09)' : 'rgba(255, 255, 255, 0.025)'}; }
`;

const Td = styled.td<{ $checkbox?: boolean }>`
    padding: ${p => p.$checkbox ? '12px 12px 12px 20px' : '12px 20px'};
    vertical-align: middle;
    width: ${p => p.$checkbox ? '40px' : 'auto'};
    cursor: ${p => p.$checkbox ? 'pointer' : 'inherit'};
`;

const RowAgent = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const RowAgentNameRow = styled.div`
    display: flex;
    align-items: center;
    gap: 7px;
`;

const RowAgentName = styled.span`
    font-weight: 600;
    color: #e1e4e8;
    white-space: nowrap;
`;

const RowAgentDesc = styled.span`
    font-size: 12px;
    color: #4a5568;
    display: block;
    margin-top: 2px;
`;

const NewBadge = styled.span`
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #34d399;
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.25);
    border-radius: 4px;
    padding: 1px 5px;
    flex-shrink: 0;
`;

const Mark = styled.mark`
    background: rgba(251, 191, 36, 0.25);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
`;

const StatusDot = styled.span<{ $color: string }>`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${p => p.$color};
    flex-shrink: 0;
    display: inline-block;
`;

const PulsingDot = styled.span<{ $color: string }>`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${p => p.$color};
    flex-shrink: 0;
    display: inline-block;
    animation: ${pulse} 1s ease-in-out infinite;
`;

const StatusChip = styled.span<{ $color: string }>`
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 500;
    color: ${p => p.$color};
    text-transform: capitalize;
`;

const FwChip = styled.span`
    font-size: 12px;
    font-weight: 500;
    color: #4a9ede;
    background: rgba(12, 92, 171, 0.08);
    padding: 3px 9px;
    border-radius: 5px;
    white-space: nowrap;
`;

const VersionChip = styled.span`
    font-size: 11px;
    font-weight: 500;
    color: #8899a6;
    font-family: 'IBM Plex Mono', monospace;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    padding: 2px 7px;
`;

const Muted = styled.span`
    font-size: 12px;
    color: #3a4555;
    font-style: italic;
`;

const UrlCell = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #4a5568;
    font-family: 'IBM Plex Mono', monospace;

    a { color: #4a9ede; display: flex; align-items: center; flex-shrink: 0; }
    a:hover { color: #7ab8eb; }
`;

const PortTag = styled.span`
    font-size: 11px;
    color: #4a5568;
    background: rgba(255,255,255,0.04);
    border-radius: 3px;
    padding: 1px 4px;
`;

const UpdatedCell = styled.span`
    font-size: 12px;
    color: #4a5568;
    white-space: nowrap;
`;

const RowActions = styled.div`
    display: flex;
    gap: 6px;
    justify-content: flex-end;
`;

const RowActionBtn = styled.button<{ $danger?: boolean }>`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    transition: all 0.12s;
    color: ${p => p.$danger ? '#f87171' : '#8899a6'};
    background: transparent;
    border: 1px solid ${p => p.$danger ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)'};

    &:hover { background: ${p => p.$danger ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.05)'}; }
`;

const NoResults = styled.div`
    padding: 40px;
    text-align: center;
    font-size: 13px;
    color: #4a5568;

    em { color: #6b7a8d; font-style: normal; }
`;

// ── Loading / empty ───────────────────────────────────────────────────────────

const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 80px;
    flex: 1;
`;

const LoadingSpinner = styled.div`
    width: 32px;
    height: 32px;
    border: 2px solid rgba(255, 255, 255, 0.06);
    border-top-color: #0C5CAB;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const LoadingText = styled.p`
    font-size: 13px;
    color: #6b7a8d;
    margin: 0;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 14px;
    text-align: center;
    padding: 60px 24px;
`;

const EmptyIcon = styled.div`
    color: #3a4a5e;
    margin-bottom: 8px;
`;

const EmptyTitle = styled.h2`
    font-size: 18px;
    font-weight: 600;
    color: #e8edf5;
    margin: 0;
`;

const EmptyDescription = styled.p`
    font-size: 13px;
    color: #6b7a8d;
    margin: 0;
    max-width: 360px;
    line-height: 1.6;
`;

// ── Charts ────────────────────────────────────────────────────────────────────

const ChartsRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;

    @media (max-width: 1000px) { grid-template-columns: 1fr; }
`;

const ChartCard = styled.div`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
`;

const ChartTitle = styled.span`
    font-size: 11px;
    font-weight: 700;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 12px;
`;

const DonutWrap = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const DonutCenter = styled.div`
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
`;

const DonutTotal = styled.span`
    font-size: 28px;
    font-weight: 700;
    color: #e8edf5;
    font-family: 'IBM Plex Mono', monospace;
    line-height: 1;
`;

const DonutLabel = styled.span`
    font-size: 11px;
    color: #4a5568;
    margin-top: 2px;
`;

const ChartLegend = styled.div`
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-top: 10px;
`;

const LegendItem = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const LegendDot = styled.span<{ $color: string }>`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${p => p.$color};
`;

const LegendLabel = styled.span`
    font-size: 12px;
    color: #6b7a8d;
`;

const LegendValue = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: #c9d1d9;
    font-family: 'IBM Plex Mono', monospace;
`;

const AdoptionList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 11px;
    margin-top: 4px;
`;

const AdoptionRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const AdoptionLabel = styled.span`
    font-size: 12px;
    color: #8899a6;
    min-width: 90px;
    flex-shrink: 0;
`;

const AdoptionBarTrack = styled.div`
    flex: 1;
    height: 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    overflow: hidden;
`;

const barFillAnimation = keyframes`
    from { width: 0; }
`;

const AdoptionBarFill = styled.div<{ $color: string; $pct: number }>`
    height: 100%;
    width: ${p => p.$pct}%;
    background: ${p => p.$color};
    border-radius: 4px;
    transition: width 0.6s ease;
    animation: ${barFillAnimation} 0.8s ease;
`;

const AdoptionCount = styled.span<{ $color: string }>`
    font-size: 12px;
    font-weight: 600;
    color: ${p => p.$color};
    font-family: 'IBM Plex Mono', monospace;
    min-width: 32px;
    text-align: right;

    span { color: #4a5568; font-weight: 400; }
`;

