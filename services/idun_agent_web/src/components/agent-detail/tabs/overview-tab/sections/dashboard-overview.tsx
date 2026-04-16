import { Fragment, useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import {
    Database, KeyRound, Server, Eye, Shield, Plug,
    ArrowRight, Plus, Activity, Layers, Clock, Cpu, GitBranch,
    Check, X, ChevronDown,
} from 'lucide-react';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import type { Instance as SvgPanZoomInstance } from 'svg-pan-zoom';
import { fetchAgentGraph, patchAgent } from '../../../../../services/agents';
import type { BackendAgent } from '../../../../../services/agents';
import {
    extractAgentConfig,
    extractSelectionsFromAgent,
    buildAgentPatchPayload,
    type AvailableResources,
    type AgentSelections,
} from '../../../../../utils/agent-config-utils';
import { notify } from '../../../../toast/notify';

// Initialize mermaid once with platform theme tokens
mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
        background: 'transparent',
        primaryColor: '#1a2332',
        primaryTextColor: '#e1e4e8',
        primaryBorderColor: '#4a9ede',
        secondaryColor: '#0c1219',
        secondaryTextColor: '#8899a6',
        tertiaryColor: '#0a0e17',
        lineColor: '#4a5568',
        textColor: '#c9d1d9',
        mainBkg: '#1a2332',
        nodeBorder: '#4a9ede',
        clusterBkg: 'rgba(255, 255, 255, 0.02)',
        clusterBorder: 'rgba(255, 255, 255, 0.08)',
        edgeLabelBackground: '#0a0e17',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '12px',
    },
    flowchart: {
        curve: 'basis',
        padding: 12,
        nodeSpacing: 24,
        rankSpacing: 55,
        useMaxWidth: false,
        htmlLabels: true,
    },
});

/**
 * Inject branded classDef styling into a mermaid graph string AND force a
 * horizontal (left-to-right) layout, regardless of what the agent server
 * originally returned.
 */
function styleMermaidString(graph: string): string {
    const horizontalized = graph.replace(
        /^(\s*(?:graph|flowchart))\s+(TD|TB|BT|LR|RL)?/m,
        '$1 LR'
    );

    const styles = `
classDef startNode fill:#0C5CAB,stroke:#7ab8eb,stroke-width:2px,color:#ffffff,font-weight:600,rx:14,ry:14
classDef endNode fill:#0d3826,stroke:#5fe3a8,stroke-width:2px,color:#5fe3a8,font-weight:600,rx:14,ry:14
classDef toolNode fill:#3d2e0f,stroke:#e8b465,stroke-width:1.5px,color:#ffd9a0,rx:10,ry:10
classDef defaultNode fill:#141b28,stroke:#3a4555,stroke-width:1px,color:#c9d1d9,rx:8,ry:8
class __start__ startNode
class __end__ endNode
class start startNode
class END endNode
`;
    return horizontalized.trimEnd() + '\n' + styles;
}

interface DashboardOverviewProps {
    agent: BackendAgent;
    resources: AvailableResources;
    refreshKey?: number;
    onAgentRefresh?: () => void;
}

export default function DashboardOverview({ agent, resources, onAgentRefresh }: DashboardOverviewProps) {
    const [pickerKind, setPickerKind] = useState<BlockKind | null>(null);

    return (
        <Wrap>
            {/* Graph */}
            <GraphCard agent={agent} />

            {/* Capabilities */}
            <CapabilitiesBlocks
                agent={agent}
                resources={resources}
                onPickerOpen={(k) => setPickerKind(k)}
            />

            {/* Server info at the bottom */}
            <ServerInfoCard agent={agent} />

            {pickerKind && (
                <ResourcePicker
                    kind={pickerKind}
                    agent={agent}
                    resources={resources}
                    onClose={() => setPickerKind(null)}
                    onAgentRefresh={onAgentRefresh}
                />
            )}
        </Wrap>
    );
}

// ── Server Info card ────────────────────────────────────────────────────────

function ServerInfoCard({ agent }: { agent: BackendAgent }) {
    const [collapsed, setCollapsed] = useState(false);
    const config = agent.engine_config?.agent?.config as Record<string, any> | undefined;
    const port = agent.engine_config?.server?.api?.port;
    const fw = (agent.framework || '').toLowerCase();

    const entries: Array<{ key: string; value: string; mono: boolean }> = [];
    if (fw === 'langgraph' && config?.graph_definition) {
        entries.push({ key: 'Graph Definition', value: String(config.graph_definition), mono: true });
    } else if (fw === 'adk') {
        if (config?.agent) entries.push({ key: 'Agent Module', value: String(config.agent), mono: true });
        if (config?.app_name) entries.push({ key: 'App Name', value: String(config.app_name), mono: true });
    } else if (fw === 'haystack' && config?.pipeline) {
        entries.push({ key: 'Pipeline', value: String(config.pipeline), mono: true });
    }
    if (agent.base_url) entries.push({ key: 'Base URL', value: agent.base_url, mono: true });
    if (port) entries.push({ key: 'Port', value: `:${port}`, mono: true });
    if (agent.version) entries.push({ key: 'Version', value: `v${agent.version}`, mono: true });

    if (entries.length === 0) return null;

    const handleCopy = (value: string) => {
        navigator.clipboard.writeText(value);
        notify.success('Copied to clipboard');
    };

    return (
        <ServerInfoSection>
            <SectionHeaderBar onClick={() => setCollapsed(c => !c)} type="button">
                <SectionHeaderLeft>
                    <SectionHeaderIcon><Cpu size={13} /></SectionHeaderIcon>
                    <ColumnHeader style={{ margin: 0 }}>Server Info</ColumnHeader>
                </SectionHeaderLeft>
                <CollapseChevron $collapsed={collapsed}>
                    <ChevronDown size={14} />
                </CollapseChevron>
            </SectionHeaderBar>
            <CollapseFrame $collapsed={collapsed}>
                <CollapseInner>
                    <ServerInfoGrid>
                        {entries.map((e, i) => (
                            <ServerInfoItem key={i}>
                                <ServerInfoLabel>{e.key}</ServerInfoLabel>
                                <ServerInfoValueBtn
                                    type="button"
                                    onClick={() => handleCopy(e.value)}
                                    title="Click to copy"
                                    $mono={e.mono}
                                >
                                    {e.value}
                                </ServerInfoValueBtn>
                            </ServerInfoItem>
                        ))}
                    </ServerInfoGrid>
                </CollapseInner>
            </CollapseFrame>
        </ServerInfoSection>
    );
}

// ── Graph card (mermaid with branded styling) ───────────────────────────────

function GraphCard({ agent }: { agent: BackendAgent }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const panZoomRef = useRef<SvgPanZoomInstance | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    // Collapse by default for non-LangGraph agents (no graph to show)
    const [collapsed, setCollapsed] = useState(agent.framework !== 'LANGGRAPH');

    useEffect(() => {
        if (agent.framework !== 'LANGGRAPH') {
            setError('Graph visualization is only available for LangGraph agents');
            return;
        }
        if (!agent.base_url) {
            setError('Agent has no base URL configured');
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        fetchAgentGraph(agent.base_url)
            .then(async (graphStr) => {
                if (cancelled) return;
                if (!graphStr) {
                    setError('Could not load graph — agent may be offline');
                    setLoading(false);
                    return;
                }
                try {
                    const styled = styleMermaidString(graphStr);
                    const id = `mermaid-${agent.id.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
                    const { svg } = await mermaid.render(id, styled);
                    if (!cancelled && containerRef.current) {
                        // Tear down any existing pan-zoom instance before swapping the SVG
                        if (panZoomRef.current) {
                            try { panZoomRef.current.destroy(); } catch { /* noop */ }
                            panZoomRef.current = null;
                        }
                        containerRef.current.innerHTML = svg;

                        // Mermaid sets explicit width/height — strip them so pan-zoom can fill
                        const svgEl = containerRef.current.querySelector('svg') as SVGSVGElement | null;
                        if (svgEl) {
                            svgEl.removeAttribute('width');
                            svgEl.removeAttribute('height');
                            svgEl.style.width = '100%';
                            svgEl.style.height = '100%';
                            svgEl.style.maxWidth = 'none';
                            svgEl.style.maxHeight = 'none';

                            // Initialise pan-zoom on the rendered SVG
                            panZoomRef.current = svgPanZoom(svgEl, {
                                zoomEnabled: true,
                                panEnabled: true,
                                controlIconsEnabled: false,
                                fit: true,
                                center: true,
                                minZoom: 0.3,
                                maxZoom: 8,
                                zoomScaleSensitivity: 0.35,
                                dblClickZoomEnabled: true,
                                mouseWheelZoomEnabled: true,
                            });
                        }
                    }
                } catch (e) {
                    if (!cancelled) setError('Failed to render graph');
                } finally {
                    if (!cancelled) setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setError('Could not reach agent — check it is running');
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
            if (panZoomRef.current) {
                try { panZoomRef.current.destroy(); } catch { /* noop */ }
                panZoomRef.current = null;
            }
        };
    }, [agent.base_url, agent.id, agent.framework]);

    // Re-fit when expanding from collapsed state (container becomes visible again)
    useEffect(() => {
        if (!collapsed && panZoomRef.current) {
            // Wait for layout to settle after display: none → display: flex
            requestAnimationFrame(() => {
                panZoomRef.current?.resize();
                panZoomRef.current?.fit();
                panZoomRef.current?.center();
            });
        }
    }, [collapsed]);

    // Zoom control handlers
    const zoomIn = () => panZoomRef.current?.zoomIn();
    const zoomOut = () => panZoomRef.current?.zoomOut();
    const resetView = () => {
        panZoomRef.current?.resetZoom();
        panZoomRef.current?.center();
        panZoomRef.current?.fit();
    };

    return (
        <GraphSection>
            <GraphHeader as="button" type="button" onClick={() => setCollapsed(c => !c)}>
                <GraphHeaderLeft>
                    <GraphHeaderIcon>
                        <GitBranch size={13} />
                    </GraphHeaderIcon>
                    <GraphHeaderText>
                        <ColumnHeader style={{ margin: 0 }}>Execution Graph</ColumnHeader>
                        <GraphHeaderSub>The agent's request path through nodes &amp; edges</GraphHeaderSub>
                    </GraphHeaderText>
                </GraphHeaderLeft>
                <GraphHeaderRight>
                    {agent.framework && <GraphFrameworkPill>{agent.framework}</GraphFrameworkPill>}
                    <CollapseChevron $collapsed={collapsed}>
                        <ChevronDown size={14} />
                    </CollapseChevron>
                </GraphHeaderRight>
            </GraphHeader>

            <CollapseFrame $collapsed={collapsed}>
                <CollapseInner>
                    <GraphCanvas>
                        {loading && <GraphSkeleton />}
                        {error && <GraphPlaceholder>{error}</GraphPlaceholder>}
                        <MermaidWrap ref={containerRef} />
                        {!loading && !error && (
                            <ZoomControls>
                                <ZoomBtn onClick={zoomIn} type="button" title="Zoom in">+</ZoomBtn>
                                <ZoomBtn onClick={zoomOut} type="button" title="Zoom out">−</ZoomBtn>
                                <ZoomBtn onClick={resetView} type="button" title="Reset view">⊙</ZoomBtn>
                            </ZoomControls>
                        )}
                        {!loading && !error && (
                            <ZoomHint>Drag to pan · Scroll to zoom</ZoomHint>
                        )}
                    </GraphCanvas>
                </CollapseInner>
            </CollapseFrame>
        </GraphSection>
    );
}

// ── Graph skeleton (loading state) ──────────────────────────────────────────

function GraphSkeleton() {
    return (
        <SkeletonRoot>
            <SkeletonNode style={{ left: '8%', top: '40%', width: 64, height: 32 }} />
            <SkeletonLine style={{ left: '20%', top: '52%', width: 70 }} />
            <SkeletonNode style={{ left: '32%', top: '36%', width: 80, height: 40 }} />
            <SkeletonLine style={{ left: '46%', top: '52%', width: 70 }} />
            <SkeletonNode style={{ left: '58%', top: '24%', width: 70, height: 32 }} />
            <SkeletonNode style={{ left: '58%', top: '60%', width: 70, height: 32 }} />
            <SkeletonLine style={{ left: '72%', top: '38%', width: 70, transform: 'rotate(20deg)' }} />
            <SkeletonLine style={{ left: '72%', top: '70%', width: 70, transform: 'rotate(-20deg)' }} />
            <SkeletonNode style={{ left: '85%', top: '40%', width: 64, height: 32 }} />
        </SkeletonRoot>
    );
}

// ── Stats strip (agent vital signs) ──────────────────────────────────────────

function relativeTime(iso: string | undefined): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// ── Resource picker modal ────────────────────────────────────────────────────

interface PickerItem {
    id: string;
    name: string;
    type: string;
    sub?: string;
    attached: boolean;
}

function ResourcePicker({
    kind,
    agent,
    resources,
    onClose,
    onAgentRefresh,
}: {
    kind: BlockKind;
    agent: BackendAgent;
    resources: AvailableResources;
    onClose: () => void;
    onAgentRefresh?: () => void;
}) {
    const navigate = useNavigate();
    const [busyId, setBusyId] = useState<string | null>(null);
    const meta = KIND_META[kind];
    const Icon = meta.icon;

    const items = buildItems(kind, agent, resources);

    async function toggle(item: PickerItem) {
        if (busyId) return;
        setBusyId(item.id);
        try {
            await toggleResourceFor(kind, item, agent, resources);
            notify.success(item.attached ? `Detached ${item.name}` : `Attached ${item.name}`);
            onAgentRefresh?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update agent';
            notify.error(message);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <PickerBackdrop onClick={onClose}>
            <PickerPanel onClick={e => e.stopPropagation()}>
                <PickerHeader>
                    <PickerTitleRow>
                        <PickerHeaderIcon $color={meta.color}>
                            <Icon size={14} />
                        </PickerHeaderIcon>
                        <div>
                            <PickerTitle>{meta.tabLabel}</PickerTitle>
                            <PickerSub>{items.filter(i => i.attached).length} of {items.length} attached</PickerSub>
                        </div>
                    </PickerTitleRow>
                    <PickerCloseBtn onClick={onClose}>
                        <X size={16} />
                    </PickerCloseBtn>
                </PickerHeader>

                <PickerBody>
                    {items.length === 0 ? (
                        <PickerEmpty>
                            No {meta.tabLabel.toLowerCase()} created yet.
                            <PickerEmptyHint>Create one in the resource library to attach it here.</PickerEmptyHint>
                        </PickerEmpty>
                    ) : (
                        <PickerList>
                            {items.map(item => (
                                <PickerRow
                                    key={item.id}
                                    type="button"
                                    onClick={() => toggle(item)}
                                    disabled={!!busyId}
                                    $attached={item.attached}
                                    $color={meta.color}
                                >
                                    <PickerCheck $checked={item.attached} $color={meta.color}>
                                        {item.attached && <Check size={11} />}
                                    </PickerCheck>
                                    <PickerRowText>
                                        <PickerRowName>{item.name}</PickerRowName>
                                        <PickerRowMeta>
                                            {item.type}
                                            {item.sub && <> · {item.sub}</>}
                                        </PickerRowMeta>
                                    </PickerRowText>
                                    {item.attached && (
                                        <PickerRowBadge $color={meta.color}>Attached</PickerRowBadge>
                                    )}
                                </PickerRow>
                            ))}
                        </PickerList>
                    )}
                </PickerBody>

                <PickerFooter>
                    <PickerCreateBtn type="button" onClick={() => navigate(meta.route)}>
                        <Plus size={13} /> Create new {meta.tabLabel}
                    </PickerCreateBtn>
                </PickerFooter>
            </PickerPanel>
        </PickerBackdrop>
    );
}

// ── Capabilities blocks (center grid) ────────────────────────────────────────

type BlockKind = 'mcp' | 'integration' | 'sso' | 'observability' | 'memory' | 'guardrail';

interface BlockItem {
    id: string;
    label: string;
    sublabel: string;
    kind: BlockKind;
    icon: typeof Server;
    color: string;
    route: string;
}

// Restrained palette: muted, sophisticated tones — not Tailwind defaults
const KIND_META: Record<BlockKind, { route: string; color: string; icon: typeof Server; tabLabel: string }> = {
    mcp:           { route: '/mcp',           color: '#e8b465', icon: Server,   tabLabel: 'MCP' },
    integration:   { route: '/integrations',  color: '#e07a8a', icon: Plug,     tabLabel: 'Integrations' },
    sso:           { route: '/sso',           color: '#9b87d4', icon: KeyRound, tabLabel: 'SSO' },
    observability: { route: '/observability', color: '#5fb8c4', icon: Eye,      tabLabel: 'Observability' },
    memory:        { route: '/memory',        color: '#6e8cd6', icon: Database, tabLabel: 'Memory' },
    guardrail:     { route: '/guardrails',    color: '#6cc196', icon: Shield,   tabLabel: 'Guardrails' },
};

function CapabilitiesBlocks({ agent, resources, onPickerOpen }: {
    agent: BackendAgent;
    resources: AvailableResources;
    onPickerOpen: (kind: BlockKind) => void;
}) {
    const [collapsed, setCollapsed] = useState(false);

    // Use buildItems for accurate attached/total counts using canonical selections
    const allKinds: BlockKind[] = ['memory', 'observability', 'mcp', 'guardrail', 'sso', 'integration'];
    const categoriesWithItems = allKinds.map(k => {
        const items = buildItems(k, agent, resources);
        const attachedItems = items.filter(i => i.attached);
        return {
            kind: k,
            total: items.length,
            attached: attachedItems.length,
            attachedItems,
        };
    });
    const totalAttached = categoriesWithItems.reduce((s, c) => s + c.attached, 0);

    return (
        <BlocksWrap>
            <SectionHeaderBar onClick={() => setCollapsed(c => !c)} type="button">
                <SectionHeaderLeft>
                    <SectionHeaderIcon><Layers size={13} /></SectionHeaderIcon>
                    <ColumnHeader style={{ margin: 0 }}>Capabilities</ColumnHeader>
                    <SectionHeaderCount>{totalAttached} attached</SectionHeaderCount>
                </SectionHeaderLeft>
                <CollapseChevron $collapsed={collapsed}>
                    <ChevronDown size={14} />
                </CollapseChevron>
            </SectionHeaderBar>

            <CollapseFrame $collapsed={collapsed}>
                <CollapseInner>
                    <BlocksGrid>
                        {categoriesWithItems.map(cat => {
                            const meta = KIND_META[cat.kind];
                            const Icon = meta.icon;
                            const hasAny = cat.attached > 0;
                            return (
                                <Block
                                    key={cat.kind}
                                    type="button"
                                    onClick={() => onPickerOpen(cat.kind)}
                                    $color={meta.color}
                                    $attached={hasAny}
                                    title={`Click to manage ${meta.tabLabel}`}
                                >
                                    <BlockIcon $color={meta.color} $attached={hasAny}>
                                        <Icon size={22} />
                                    </BlockIcon>
                                    <BlockText>
                                        <BlockName>{meta.tabLabel}</BlockName>
                                        <BlockKind>{cat.attached} / {cat.total} attached</BlockKind>
                                    </BlockText>
                                    {hasAny && (
                                        <AttachedBadge $color={meta.color}>
                                            <Check size={9} />
                                        </AttachedBadge>
                                    )}
                                    {hasAny && (
                                        <HoverPopover $color={meta.color}>
                                            <HoverPopoverHeader>
                                                <Icon size={11} />
                                                Attached {meta.tabLabel}
                                            </HoverPopoverHeader>
                                            <HoverPopoverList>
                                                {cat.attachedItems.slice(0, 6).map(item => (
                                                    <HoverPopoverItem key={item.id}>
                                                        <HoverDot $color={meta.color} />
                                                        {item.name}
                                                    </HoverPopoverItem>
                                                ))}
                                                {cat.attachedItems.length > 6 && (
                                                    <HoverPopoverMore>
                                                        +{cat.attachedItems.length - 6} more
                                                    </HoverPopoverMore>
                                                )}
                                            </HoverPopoverList>
                                        </HoverPopover>
                                    )}
                                </Block>
                            );
                        })}
                    </BlocksGrid>
                </CollapseInner>
            </CollapseFrame>
        </BlocksWrap>
    );
}

// ── Unified inline resource card ─────────────────────────────────────────────

/**
 * Build the picker items for a given category. Returns the list with each
 * item flagged as attached or available, using the agent's engine_config as
 * the source of truth.
 */
function buildItems(kind: BlockKind, agent: BackendAgent, resources: AvailableResources): PickerItem[] {
    const items: PickerItem[] = [];
    // Use the canonical selections from the agent's resource refs
    const framework = agent.framework || 'LANGGRAPH';
    const selections = extractSelectionsFromAgent(agent, framework, resources);

    if (kind === 'memory') {
        const attachedAppId = selections.selectedMemoryAppId;
        for (const app of resources.memoryApps) {
            items.push({
                id: app.id,
                name: app.name,
                type: app.type,
                attached: !!attachedAppId && attachedAppId === app.id,
            });
        }
    } else if (kind === 'observability') {
        const attachedIds = new Set<string>(selections.selectedObservabilityIds || []);
        for (const app of resources.observabilityApps) {
            items.push({
                id: app.id,
                name: app.name,
                type: app.type,
                attached: attachedIds.has(app.id),
            });
        }
    } else if (kind === 'mcp') {
        const attachedIds = new Set<string>(selections.selectedMCPIds || []);
        for (const app of resources.mcpApps) {
            items.push({
                id: app.id,
                name: app.name,
                type: 'MCP',
                attached: attachedIds.has(app.id),
            });
        }
    } else if (kind === 'guardrail') {
        const attachedIds = new Set<string>(selections.selectedGuardIds || []);
        for (const app of resources.guardApps) {
            items.push({
                id: app.id,
                name: app.name,
                type: app.type || 'Rule',
                attached: attachedIds.has(app.id),
            });
        }
    } else if (kind === 'sso') {
        const attachedSsoId = selections.selectedSSOId;
        for (const sso of resources.ssoConfigs) {
            const issuer = String((sso as any).sso?.issuer || '');
            items.push({
                id: sso.id,
                name: sso.name,
                type: 'OAuth',
                sub: issuer,
                attached: !!attachedSsoId && attachedSsoId === sso.id,
            });
        }
    } else if (kind === 'integration') {
        const attachedIds = new Set<string>(selections.selectedIntegrationIds || []);
        for (const it of resources.integrationConfigs) {
            const provider = String((it as any).integration?.provider || '').toLowerCase();
            items.push({
                id: it.id,
                name: it.name,
                type: provider.toUpperCase() || 'Integration',
                attached: attachedIds.has(it.id),
            });
        }
    }

    // Attached first
    items.sort((a, b) => Number(b.attached) - Number(a.attached));
    return items;
}

/**
 * Apply a single resource toggle and persist via patchAgent.
 */
async function toggleResourceFor(
    kind: BlockKind,
    item: PickerItem,
    agent: BackendAgent,
    resources: AvailableResources,
): Promise<void> {
    const framework = agent.framework || 'LANGGRAPH';
    const ec = agent.engine_config as Record<string, any> | undefined;
    const currentSelections: AgentSelections = extractSelectionsFromAgent(agent, framework, resources);
    const newSelections: AgentSelections = { ...currentSelections };
    const toggleArr = (arr: string[], id: string) =>
        arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

    switch (kind) {
        case 'mcp':
            newSelections.selectedMCPIds = toggleArr(newSelections.selectedMCPIds || [], item.id);
            break;
        case 'observability':
            newSelections.selectedObservabilityIds = toggleArr(newSelections.selectedObservabilityIds || [], item.id);
            break;
        case 'guardrail':
            newSelections.selectedGuardIds = toggleArr(newSelections.selectedGuardIds || [], item.id);
            break;
        case 'integration':
            newSelections.selectedIntegrationIds = toggleArr(newSelections.selectedIntegrationIds || [], item.id);
            break;
        case 'sso':
            newSelections.selectedSSOId = item.attached ? '' : item.id;
            break;
        case 'memory':
            if (item.attached) {
                newSelections.selectedMemoryType = framework === 'ADK' ? 'AdkInMemory' : 'InMemoryCheckpointConfig';
                newSelections.selectedMemoryAppId = '';
            } else {
                newSelections.selectedMemoryType = item.type;
                newSelections.selectedMemoryAppId = item.id;
            }
            break;
    }

    const formState = {
        name: agent.name,
        version: agent.version || '1.0.0',
        baseUrl: agent.base_url || '',
        serverPort: String(ec?.server?.api?.port ?? 8000),
        agentType: framework,
        agentConfig: extractAgentConfig(agent.engine_config),
    };

    const payload = buildAgentPatchPayload(formState, newSelections);
    await patchAgent(agent.id, payload);
}

/**
 * Inline card showing all available items of a category with click-to-toggle.
 * Replaces the per-category MemoryCard / ObservabilityCard / etc.
 */
function ResourceCardInline({
    kind,
    agent,
    resources,
    onAgentRefresh,
    onOpenPicker,
}: {
    kind: BlockKind;
    agent: BackendAgent;
    resources: AvailableResources;
    onAgentRefresh?: () => void;
    onOpenPicker: () => void;
}) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const meta = KIND_META[kind];
    const HeaderIcon = meta.icon;
    const items = buildItems(kind, agent, resources);
    const attachedCount = items.filter(i => i.attached).length;

    async function handleToggle(item: PickerItem, e: React.MouseEvent) {
        e.stopPropagation();
        if (busyId) return;
        setBusyId(item.id);
        try {
            await toggleResourceFor(kind, item, agent, resources);
            notify.success(item.attached ? `Detached ${item.name}` : `Attached ${item.name}`);
            onAgentRefresh?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update agent';
            notify.error(message);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <Card>
            <CardLabel>
                <HeaderIcon size={12} /> {meta.tabLabel}
                <CardCount>{attachedCount}/{items.length}</CardCount>
            </CardLabel>

            {items.length === 0 ? (
                <EmptyHint>No {meta.tabLabel.toLowerCase()} created yet</EmptyHint>
            ) : (
                <InlineList>
                    {items.slice(0, 5).map(item => (
                        <InlineRow
                            key={item.id}
                            type="button"
                            onClick={(e) => handleToggle(item, e)}
                            disabled={!!busyId}
                            $attached={item.attached}
                            $color={meta.color}
                        >
                            <InlineCheck $checked={item.attached} $color={meta.color}>
                                {item.attached && <Check size={10} />}
                            </InlineCheck>
                            <InlineName title={item.name}>{item.name}</InlineName>
                        </InlineRow>
                    ))}
                    {items.length > 5 && (
                        <InlineMore type="button" onClick={onOpenPicker}>
                            +{items.length - 5} more · Manage all
                        </InlineMore>
                    )}
                </InlineList>
            )}

            <CardFooter>
                <FooterAction $primary onClick={(e) => { e.stopPropagation(); onOpenPicker(); }}>
                    <Plus size={11} /> Manage all
                </FooterAction>
            </CardFooter>
        </Card>
    );
}

// ── Memory card (real data) ──────────────────────────────────────────────────

function getMemoryInfo(agent: BackendAgent): { name: string; type: string; persistent: boolean; details: { key: string; value: string }[] } {
    const config = agent.engine_config?.agent?.config as Record<string, any> | undefined;
    const framework = agent.framework;

    if (!config) {
        return { name: 'In-Memory', type: 'default', persistent: false, details: [] };
    }

    if (framework === 'ADK') {
        const ss = config.session_service;
        if (!ss || ss.type === 'in_memory') return { name: 'In-Memory', type: 'in_memory', persistent: false, details: [] };
        if (ss.type === 'vertex_ai') {
            const details: { key: string; value: string }[] = [];
            if (ss.project_id) details.push({ key: 'Project', value: ss.project_id });
            if (ss.location) details.push({ key: 'Location', value: ss.location });
            return { name: 'Vertex AI', type: 'vertex_ai', persistent: true, details };
        }
        if (ss.type === 'database') {
            const details: { key: string; value: string }[] = [];
            const conn = ss.connection_string || ss.db_url;
            if (conn) details.push({ key: 'Connection', value: maskConn(conn) });
            return { name: 'Database', type: 'database', persistent: true, details };
        }
        return { name: ss.type, type: ss.type, persistent: true, details: [] };
    }

    // LangGraph
    const cp = config.checkpointer;
    if (!cp || cp.type === 'memory') return { name: 'In-Memory', type: 'memory', persistent: false, details: [] };
    if (cp.type === 'sqlite') {
        const details: { key: string; value: string }[] = [];
        const conn = cp.db_url || cp.connection_string;
        if (conn) details.push({ key: 'Path', value: conn });
        return { name: 'SQLite', type: 'sqlite', persistent: true, details };
    }
    if (cp.type === 'postgres') {
        const details: { key: string; value: string }[] = [];
        const conn = cp.db_url || cp.connection_string;
        if (conn) details.push({ key: 'Connection', value: maskConn(conn) });
        return { name: 'PostgreSQL', type: 'postgres', persistent: true, details };
    }
    return { name: cp.type, type: cp.type, persistent: true, details: [] };
}

function maskConn(s: string): string {
    if (s.length > 60) s = s.slice(0, 57) + '…';
    // hide password between :// and @
    return s.replace(/(\/\/[^:]+:)([^@]+)(@)/, '$1••••$3');
}

function MemoryCard({ agent, onClick }: { agent: BackendAgent; onClick: () => void }) {
    const mem = getMemoryInfo(agent);
    const isConfigured = mem.persistent;

    return (
        <Card as="button" type="button" onClick={onClick}>
            <CardLabel>
                <Database size={12} /> Memory
                <CardCount>{isConfigured ? '1' : '0'}</CardCount>
            </CardLabel>
            <MemoryHero>
                <MemoryName>{mem.name}</MemoryName>
                <PersistencePill $persistent={mem.persistent}>
                    <Dot $active={mem.persistent} />
                    {mem.persistent ? 'Persistent' : 'Ephemeral'}
                </PersistencePill>
            </MemoryHero>
            {mem.details.length > 0 && (
                <DetailList>
                    {mem.details.map((d, i) => (
                        <DetailRow key={i}>
                            <DetailKey>{d.key}</DetailKey>
                            <DetailValue title={d.value}>{d.value}</DetailValue>
                        </DetailRow>
                    ))}
                </DetailList>
            )}
            <CardFooter>
                {isConfigured
                    ? <FooterAction>Manage <ArrowRight size={11} /></FooterAction>
                    : <FooterAction $primary><Plus size={11} /> Configure backend</FooterAction>
                }
            </CardFooter>
        </Card>
    );
}

// ── Observability card (real data) ───────────────────────────────────────────

const OBS_PROVIDER_LABELS: Record<string, string> = {
    langfuse: 'Langfuse',
    phoenix: 'Phoenix',
    langsmith: 'LangSmith',
    opentelemetry: 'OpenTelemetry',
    google_cloud_logging: 'GCP Logging',
    google_cloud_trace: 'GCP Trace',
};

function ObservabilityCard({ agent, onClick }: { agent: BackendAgent; onClick: () => void }) {
    const obs = (agent.engine_config as Record<string, unknown>)?.observability;
    const providers = Array.isArray(obs)
        ? (obs as Array<Record<string, unknown>>).filter(o => o.provider && o.enabled !== false)
        : [];

    return (
        <Card as="button" type="button" onClick={onClick}>
            <CardLabel>
                <Eye size={12} /> Observability
                <CardCount>{providers.length}</CardCount>
            </CardLabel>
            {providers.length === 0 ? (
                <EmptyHint>No tracing providers connected</EmptyHint>
            ) : (
                <ProviderList>
                    {providers.map((p, i) => {
                        const key = String(p.provider).toLowerCase();
                        const name = OBS_PROVIDER_LABELS[key] || String(p.provider);
                        const cfg = (p.config || {}) as Record<string, any>;
                        const host = cfg.host || cfg.endpoint || cfg.collector_endpoint;
                        return (
                            <ProviderRow key={i}>
                                <ProviderTop>
                                    <ProviderName>{name}</ProviderName>
                                    <Dot $active={true} />
                                </ProviderTop>
                                {host && <ProviderMeta title={String(host)}>{String(host)}</ProviderMeta>}
                            </ProviderRow>
                        );
                    })}
                </ProviderList>
            )}
            <CardFooter>
                {providers.length > 0
                    ? <FooterAction>Manage <ArrowRight size={11} /></FooterAction>
                    : <FooterAction $primary><Plus size={11} /> Add provider</FooterAction>
                }
            </CardFooter>
        </Card>
    );
}

// ── SSO card ─────────────────────────────────────────────────────────────────

function SSOCard({ agent, onClick }: { agent: BackendAgent; onClick: () => void }) {
    const ec = agent.engine_config as Record<string, any> | undefined;
    const sso = ec?.sso as Record<string, any> | undefined;
    const enabled = !!sso && sso.enabled !== false;

    return (
        <Card as="button" type="button" onClick={onClick}>
            <CardLabel>
                <KeyRound size={12} /> SSO
                <CardCount>{enabled ? '1' : '0'}</CardCount>
            </CardLabel>
            {!enabled ? (
                <EmptyHint>Single sign-on not configured</EmptyHint>
            ) : (
                <DetailList style={{ borderTop: 'none', paddingTop: 4 }}>
                    {sso?.issuer && (
                        <DetailRow>
                            <DetailKey>Issuer</DetailKey>
                            <DetailValue title={String(sso.issuer)}>{String(sso.issuer)}</DetailValue>
                        </DetailRow>
                    )}
                    {sso?.client_id && (
                        <DetailRow>
                            <DetailKey>Client ID</DetailKey>
                            <DetailValue title={String(sso.client_id)}>{String(sso.client_id)}</DetailValue>
                        </DetailRow>
                    )}
                    {sso?.audience && (
                        <DetailRow>
                            <DetailKey>Audience</DetailKey>
                            <DetailValue>{String(sso.audience)}</DetailValue>
                        </DetailRow>
                    )}
                </DetailList>
            )}
            <CardFooter>
                {enabled
                    ? <FooterAction>Manage <ArrowRight size={11} /></FooterAction>
                    : <FooterAction $primary><Plus size={11} /> Set up SSO</FooterAction>
                }
            </CardFooter>
        </Card>
    );
}

// ── Guardrails checklist ─────────────────────────────────────────────────────

function GuardrailsCard({ agent, onClick }: { agent: BackendAgent; onClick: () => void }) {
    const guardrails = (agent.engine_config as Record<string, unknown>)?.guardrails as Record<string, unknown> | null | undefined;
    const inputArr = Array.isArray(guardrails?.input) ? (guardrails!.input as any[]) : [];
    const outputArr = Array.isArray(guardrails?.output) ? (guardrails!.output as any[]) : [];
    const all = [
        ...inputArr.map(g => ({ ...g, position: 'input' })),
        ...outputArr.map(g => ({ ...g, position: 'output' })),
    ];

    const formatLabel = (g: any) => {
        const raw = String(g.name || g.type || g.config_id || 'Rule');
        // turn snake/kebab into Title Case
        return raw
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    };

    return (
        <Card as="button" type="button" onClick={onClick}>
            <CardLabel>
                <Shield size={12} /> Guardrails
                <CardCount>{all.length}</CardCount>
            </CardLabel>
            {all.length === 0 ? (
                <EmptyHint>No safety rules attached</EmptyHint>
            ) : (
                <Checklist>
                    {all.map((g, i) => (
                        <CheckRow key={i}>
                            <CheckBox $checked={true}>
                                <CheckMarkSvg viewBox="0 0 12 12">
                                    <polyline points="2,6 5,9 10,3" fill="none" stroke="white" strokeWidth="2" />
                                </CheckMarkSvg>
                            </CheckBox>
                            <CheckLabel $active={true}>
                                {formatLabel(g)}
                                <PositionTag $position={g.position}>{g.position}</PositionTag>
                            </CheckLabel>
                        </CheckRow>
                    ))}
                </Checklist>
            )}
            <CardFooter>
                {all.length > 0
                    ? <FooterAction>Manage rules <ArrowRight size={11} /></FooterAction>
                    : <FooterAction $primary><Plus size={11} /> Add a rule</FooterAction>
                }
            </CardFooter>
        </Card>
    );
}

// ── Animations ───────────────────────────────────────────────────────────────

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
`;

// ── Layout ───────────────────────────────────────────────────────────────────

const Wrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 18px;
    font-family: 'IBM Plex Sans', sans-serif;
    animation: ${fadeIn} 0.3s ease;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: minmax(220px, 0.7fr) minmax(0, 2.1fr) minmax(220px, 0.7fr);
    gap: 14px;
    align-items: start;

    @media (max-width: 1100px) {
        grid-template-columns: 1fr;
    }
`;

// ── New 2-panel main split ──────────────────────────────────────────────────

const MainSplit = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
    gap: 14px;
    align-items: start;

    @media (max-width: 1100px) {
        grid-template-columns: 1fr;
    }
`;

const InventoryPanel = styled.section`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 18px 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const IntegrationsPanel = styled.section`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 18px 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const PanelTitle = styled.h3`
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: #c9d1d9;
    text-transform: uppercase;
    letter-spacing: 0.08em;

    svg { color: #6b7a8d; }
`;

const InventoryGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;

    @media (max-width: 800px) {
        grid-template-columns: 1fr;
    }
`;

const SubColumn = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
`;

const SubHeader = styled.span`
    font-size: 10px;
    font-weight: 700;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 0 2px;
`;

// ── Integrations vertical list ──────────────────────────────────────────────

const IntList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const IntEmpty = styled.span`
    font-size: 11px;
    color: #4a5568;
    font-style: italic;
    padding: 8px 4px;
`;

const IntItem = styled.button`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 9px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s ease;
    width: 100%;

    &:hover {
        background: rgba(255, 255, 255, 0.045);
        border-color: rgba(255, 255, 255, 0.12);
        transform: translateX(2px);
    }
`;

const IntIcon = styled.div`
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    color: #c9d1d9;
    border: 1px solid rgba(255, 255, 255, 0.08);
`;

const IntText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
`;

const IntName = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: #e8edf5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const IntStatusLine = styled.div`
    display: flex;
    gap: 4px;
`;

const IntDot = styled.span`
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #5fe3a8;
`;

const IntAction = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #6b7a8d;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 9px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
    transition: all 0.15s;

    ${IntItem}:hover & {
        background: rgba(74, 158, 222, 0.12);
        border-color: rgba(74, 158, 222, 0.3);
        color: #4a9ede;
    }
`;

const IntAddBtn = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    margin-top: 4px;
    background: transparent;
    border: 1.5px dashed rgba(255, 255, 255, 0.08);
    border-radius: 9px;
    color: #6b7a8d;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    transition: all 0.15s;

    &:hover {
        background: rgba(255, 255, 255, 0.025);
        border-color: rgba(255, 255, 255, 0.18);
        border-style: solid;
        color: #c9d1d9;
    }
`;

// ── Stats info bar ──────────────────────────────────────────────────────────

const pulseRing = keyframes`
    0%   { transform: scale(1);   opacity: 0.55; }
    100% { transform: scale(2.6); opacity: 0;    }
`;

const StatsRoot = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 24px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);

    @media (max-width: 1100px) {
        flex-wrap: wrap;
        gap: 12px;
        justify-content: flex-start;
        padding: 12px 16px;
    }
`;

const StatItem = styled.div`
    display: flex;
    align-items: center;
    gap: 11px;
    flex: 1;
    min-width: 0;
    justify-content: flex-start;

    @media (max-width: 1100px) {
        flex: 0 0 auto;
    }
`;

const StatDivider = styled.div`
    flex-shrink: 0;
    width: 1px;
    height: 32px;
    background: rgba(255, 255, 255, 0.07);
    margin: 0 8px;

    @media (max-width: 1100px) { display: none; }
`;

const StatIconInline = styled.div<{ $accent: string }>`
    position: relative;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${p => `${p.$accent}14`};
    color: ${p => p.$accent};
    border: 1px solid ${p => `${p.$accent}26`};
`;

const PulseRing = styled.span<{ $accent: string }>`
    position: absolute;
    inset: -2px;
    border-radius: 8px;
    border: 1.5px solid ${p => p.$accent};
    animation: ${pulseRing} 2.4s ease-out infinite;
    pointer-events: none;
`;

const StatTextWrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
`;

const StatLabel = styled.span`
    font-size: 9px;
    font-weight: 700;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    line-height: 1;
`;

const StatValueRow = styled.div`
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
`;

const StatValue = styled.span<{ $accent: string }>`
    font-size: 14px;
    font-weight: 700;
    color: #f0f3f8;
    line-height: 1.2;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-feature-settings: 'tnum' 1;
`;

const StatSubInline = styled.span`
    font-size: 10px;
    color: #4a5568;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
`;

const Column = styled.div`
    display: grid;
    grid-template-rows: auto 1fr 1fr;
    gap: 14px;
    min-width: 0;
`;

const CenterColumn = styled.div`
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 14px;
    min-width: 0;
`;

// ── Capabilities blocks grid ────────────────────────────────────────────────

const BlocksWrap = styled.div`
    background: #0f1722;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 18px 20px 20px;
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.04) inset,
        0 8px 24px -12px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const BlocksHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const BlocksTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 700;
    color: #c9d1d9;
    text-transform: uppercase;
    letter-spacing: 0.07em;

    span:first-child { color: #6b7a8d; font-weight: 500; text-transform: none; letter-spacing: 0; font-size: 12px; }
`;

const BlocksTabs = styled.div`
    display: flex;
    gap: 4px;
`;

const BlockTab = styled.button<{ $active?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: ${p => p.$active ? 'rgba(74, 158, 222, 0.18)' : 'rgba(255, 255, 255, 0.025)'};
    border: 1px solid ${p => p.$active ? 'rgba(74, 158, 222, 0.4)' : 'rgba(255, 255, 255, 0.06)'};
    color: ${p => p.$active ? '#7ab8eb' : '#8899a6'};
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 9px;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
        background: ${p => p.$active ? 'rgba(74, 158, 222, 0.22)' : 'rgba(74, 158, 222, 0.08)'};
        border-color: rgba(74, 158, 222, 0.35);
        color: #c9d1d9;
    }
`;

const BlocksGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
    width: 100%;

    @media (max-width: 1100px) { grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 700px)  { grid-template-columns: repeat(2, 1fr); }
`;

const Block = styled.button<{ $color: string; $attached: boolean; $busy?: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 14px 14px;
    min-height: 124px;
    background: ${p => p.$attached ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.018)'};
    border: 1px solid ${p => p.$attached ? `${p.$color}40` : 'rgba(255, 255, 255, 0.06)'};
    border-radius: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.18s ease;
    text-align: left;
    opacity: ${p => p.$busy ? 0.5 : (p.$attached ? 1 : 0.7)};

    &:hover:not(:disabled) {
        opacity: 1;
        background: ${p => p.$attached ? 'rgba(255, 255, 255, 0.06)' : `${p.$color}0a`};
        border-color: ${p => `${p.$color}66`};
        transform: translateY(-1px);
        box-shadow: 0 6px 20px ${p => p.$color}18;
    }

    &:disabled {
        cursor: wait;
    }
`;

const BlockIcon = styled.div<{ $color: string; $attached: boolean }>`
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${p => p.$attached ? `${p.$color}1c` : 'rgba(255, 255, 255, 0.03)'};
    color: ${p => p.$attached ? p.$color : '#5a6578'};
    border: 1px solid ${p => p.$attached ? `${p.$color}30` : 'rgba(255, 255, 255, 0.06)'};
    box-shadow: ${p => p.$attached ? `inset 0 1px 0 ${p.$color}1a` : 'none'};
    transition: all 0.18s ease;

    ${Block}:hover:not(:disabled) & {
        background: ${p => `${p.$color}26`};
        color: ${p => p.$color};
        border-color: ${p => `${p.$color}40`};
    }
`;

const AttachedBadge = styled.span<{ $color: string }>`
    position: absolute;
    top: 10px;
    right: 10px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: ${p => p.$color};
    color: #0a0e17;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 3px rgba(10, 14, 23, 1);
`;

const BlockHoverPlus = styled.span<{ $color: string }>`
    position: absolute;
    top: 10px;
    right: 10px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    color: #6b7a8d;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: all 0.18s ease;

    ${Block}:hover:not(:disabled) & {
        background: ${p => p.$color};
        color: #0a0e17;
        border-color: ${p => p.$color};
    }
`;

// ── Hover popover for capability tiles ─────────────────────────────────────

const HoverPopover = styled.div<{ $color: string }>`
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%) translateY(-4px);
    z-index: 20;
    min-width: 200px;
    max-width: 280px;
    padding: 10px 12px 12px;
    background: linear-gradient(180deg, #141b28 0%, #0e1420 100%);
    border: 1px solid ${p => `${p.$color}55`};
    border-radius: 9px;
    box-shadow:
        0 10px 30px rgba(0, 0, 0, 0.45),
        0 0 0 1px ${p => `${p.$color}1a`},
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
    text-align: left;

    /* Triangle pointer at the top, centered */
    &::before {
        content: '';
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-bottom-color: ${p => `${p.$color}55`};
    }
    &::after {
        content: '';
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%) translateY(1px);
        border: 4px solid transparent;
        border-bottom-color: #141b28;
    }

    ${Block}:hover & {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(0);
    }
`;

const HoverPopoverHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    font-weight: 700;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding-bottom: 7px;
    margin-bottom: 7px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

const HoverPopoverList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 5px;
`;

const HoverPopoverItem = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
    color: #c9d1d9;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const HoverDot = styled.span<{ $color: string }>`
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${p => p.$color};
    flex-shrink: 0;
`;

const HoverPopoverMore = styled.span`
    font-size: 11px;
    color: #6b7a8d;
    font-style: italic;
    margin-top: 2px;
`;

// ── Graph skeleton (loading state) ──────────────────────────────────────────

const skeletonShimmer = keyframes`
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.85; }
`;

const SkeletonRoot = styled.div`
    position: absolute;
    inset: 0;
    pointer-events: none;
`;

const SkeletonNode = styled.div`
    position: absolute;
    background: linear-gradient(180deg, rgba(74, 158, 222, 0.18), rgba(74, 158, 222, 0.06));
    border: 1px solid rgba(74, 158, 222, 0.25);
    border-radius: 8px;
    animation: ${skeletonShimmer} 1.6s ease-in-out infinite;
`;

const SkeletonLine = styled.div`
    position: absolute;
    height: 2px;
    background: linear-gradient(90deg, rgba(74, 158, 222, 0.05), rgba(74, 158, 222, 0.4), rgba(74, 158, 222, 0.05));
    transform-origin: left center;
    animation: ${skeletonShimmer} 1.6s ease-in-out infinite;
`;

const TabCount = styled.span`
    margin-left: 4px;
    font-size: 9px;
    font-weight: 700;
    color: inherit;
    opacity: 0.6;
    font-family: 'IBM Plex Mono', monospace;
`;

const BlockText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-width: 0;
`;

const BlockName = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #e8edf5;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.005em;
`;

const BlockKind = styled.span`
    font-size: 9px;
    font-weight: 700;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.08em;
`;

const BlockDot = styled.span<{ $color: string }>`
    position: absolute;
    top: 14px;
    right: 14px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${p => p.$color};
`;

const AddBlock = styled.button`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 14px 14px;
    min-height: 124px;
    background: transparent;
    border: 1.5px dashed rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.18s ease;
    text-align: left;

    &:hover {
        background: rgba(255, 255, 255, 0.025);
        border-color: rgba(255, 255, 255, 0.18);
        border-style: solid;
        transform: translateY(-1px);
    }
`;

const AddBlockIcon = styled.div`
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.025);
    color: #6b7a8d;
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: all 0.18s ease;

    ${AddBlock}:hover & {
        background: rgba(255, 255, 255, 0.05);
        color: #c9d1d9;
        border-color: rgba(255, 255, 255, 0.14);
    }
`;

const AddBlockLabel = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #6b7a8d;
    transition: color 0.18s;
    letter-spacing: -0.005em;

    ${AddBlock}:hover & {
        color: #c9d1d9;
    }
`;

const BlocksEmpty = styled.div`
    grid-column: 1 / -1;
    padding: 18px 12px 4px;
    text-align: center;
    font-size: 11px;
    color: #4a5568;
    line-height: 1.5;

    strong { color: #6b7a8d; }
`;

const ColumnHeader = styled.h3`
    font-size: 11px;
    font-weight: 700;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 2px 4px;
`;

// ── Card primitive (clickable) ───────────────────────────────────────────────

const Card = styled.div<{ $tall?: boolean }>`
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 11px 13px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    font-family: inherit;
    color: inherit;
    cursor: pointer;
    transition: all 0.18s ease;
    width: 100%;
    ${p => p.$tall && css`min-height: 280px;`}

    &:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(74, 158, 222, 0.25);
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
    }
`;

const CardLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 700;
    color: #c9d1d9;
    text-transform: uppercase;
    letter-spacing: 0.07em;

    svg { color: #6b7a8d; }
`;

const CardCount = styled.span`
    margin-left: auto;
    font-size: 10px;
    font-weight: 700;
    color: #4a9ede;
    background: rgba(12, 92, 171, 0.14);
    border: 1px solid rgba(12, 92, 171, 0.22);
    padding: 1px 7px;
    border-radius: 10px;
    font-family: 'IBM Plex Mono', monospace;
    min-width: 18px;
    text-align: center;
`;

const CardFooter = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
`;

const FooterAction = styled.button<{ $primary?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${p => p.$primary ? '#4a9ede' : '#6b7a8d'};
    transition: color 0.15s;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;

    &:hover {
        color: ${p => p.$primary ? '#7ab8eb' : '#c9d1d9'};
    }
`;

const PositionTag = styled.span<{ $position: 'input' | 'output' | string }>`
    margin-left: auto;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 6px;
    border-radius: 3px;
    color: ${p => p.$position === 'input' ? '#60a5fa' : '#34d399'};
    background: ${p => p.$position === 'input' ? 'rgba(96, 165, 250, 0.1)' : 'rgba(52, 211, 153, 0.1)'};
    border: 1px solid ${p => p.$position === 'input' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(52, 211, 153, 0.2)'};
`;

const SubLabel = styled.span`
    font-size: 10px;
    font-weight: 500;
    color: #6b7a8d;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 2px;
`;

const Pct = styled.span`
    color: #6b7a8d;
    font-weight: 500;
    font-size: 11px;
    text-transform: none;
    margin-left: 2px;
`;

// ── Memory hero ──────────────────────────────────────────────────────────────

const MemoryHero = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0;
`;

const MemoryName = styled.span`
    font-size: 14px;
    font-weight: 700;
    color: #e8edf5;
    letter-spacing: -0.01em;
`;

const PersistencePill = styled.span<{ $persistent: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 600;
    color: ${p => p.$persistent ? '#34d399' : '#6b7a8d'};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: ${p => p.$persistent ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255, 255, 255, 0.025)'};
    border: 1px solid ${p => p.$persistent ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.05)'};
    padding: 3px 8px;
    border-radius: 4px;
`;

const DetailList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
`;

const DetailRow = styled.div`
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    font-size: 11px;
`;

const DetailKey = styled.span`
    color: #6b7a8d;
    font-weight: 500;
    flex-shrink: 0;
`;

const DetailValue = styled.span`
    color: #c9d1d9;
    font-family: 'IBM Plex Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
    min-width: 0;
`;

const EmptyHint = styled.span`
    font-size: 11px;
    color: #4a5568;
    font-style: italic;
    padding: 4px 0;
`;

// ── Observability provider list ──────────────────────────────────────────────

const ProviderList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ProviderRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.018);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 7px;
`;

const ProviderTop = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const ProviderName = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: #c9d1d9;
`;

const ProviderMeta = styled.span`
    font-size: 10px;
    color: #6b7a8d;
    font-family: 'IBM Plex Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

// ── Table ────────────────────────────────────────────────────────────────────

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
`;

const Th = styled.th<{ $right?: boolean }>`
    text-align: ${p => p.$right ? 'right' : 'left'};
    font-size: 10px;
    font-weight: 700;
    color: #4a5568;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

const Td = styled.td<{ $right?: boolean }>`
    text-align: ${p => p.$right ? 'right' : 'left'};
    font-size: 12px;
    color: #c9d1d9;
    padding: 9px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);

    tr:last-child & { border-bottom: none; }
`;

const StatusPill = styled.span<{ $active: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 500;
    color: ${p => p.$active ? '#34d399' : '#4a5568'};
`;

const Dot = styled.span<{ $active: boolean }>`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${p => p.$active ? '#34d399' : '#3a4555'};
    box-shadow: ${p => p.$active ? '0 0 0 2px rgba(52, 211, 153, 0.18)' : 'none'};
`;

// ── Guardrails checklist ───────────────────────────────────────────────────

const Checklist = styled.div`
    display: flex;
    flex-direction: column;
    gap: 9px;
`;

const CheckRow = styled.div`
    display: flex;
    align-items: center;
    gap: 9px;
`;

const CheckBox = styled.div<{ $checked: boolean }>`
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: ${p => p.$checked ? '#0C5CAB' : 'transparent'};
    border: 1.5px solid ${p => p.$checked ? '#0C5CAB' : 'rgba(255, 255, 255, 0.18)'};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const CheckMarkSvg = styled.svg`
    width: 11px;
    height: 11px;
`;

const CheckLabel = styled.span<{ $active: boolean }>`
    font-size: 12px;
    font-weight: 500;
    color: ${p => p.$active ? '#c9d1d9' : '#6b7a8d'};
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ActiveCount = styled.span`
    font-size: 10px;
    color: #4a9ede;
    background: rgba(12, 92, 171, 0.12);
    border: 1px solid rgba(12, 92, 171, 0.2);
    padding: 1px 6px;
    border-radius: 3px;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
`;

// ── Connectors grid ─────────────────────────────────────────────────────────

const ConnectorGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
`;

const ConnectorTile = styled.div<{ $active: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 6px 10px;
    background: ${p => p.$active ? 'rgba(74, 158, 222, 0.06)' : 'rgba(255, 255, 255, 0.018)'};
    border: 1px solid ${p => p.$active ? 'rgba(74, 158, 222, 0.25)' : 'rgba(255, 255, 255, 0.05)'};
    border-radius: 9px;
    transition: all 0.15s;
    cursor: default;

    &:hover {
        background: ${p => p.$active ? 'rgba(74, 158, 222, 0.1)' : 'rgba(255, 255, 255, 0.035)'};
        border-color: ${p => p.$active ? 'rgba(74, 158, 222, 0.4)' : 'rgba(255, 255, 255, 0.1)'};
    }
`;

const ConnectorIcon = styled.div<{ $active: boolean }>`
    width: 30px;
    height: 30px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${p => p.$active ? 'rgba(74, 158, 222, 0.15)' : 'rgba(255, 255, 255, 0.025)'};
    color: ${p => p.$active ? '#4a9ede' : '#4a5568'};
`;

const ConnectorLabel = styled.span`
    font-size: 10px;
    font-weight: 600;
    color: #8899a6;
    text-transform: uppercase;
    letter-spacing: 0.04em;
`;

const ConnectorDot = styled.span<{ $active: boolean }>`
    position: absolute;
    top: 6px;
    right: 6px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${p => p.$active ? '#34d399' : '#3a4555'};
`;

// ── Inline resource list (in card) ──────────────────────────────────────────

const InlineList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const InlineRow = styled.button<{ $attached: boolean; $color: string }>`
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px;
    background: ${p => p.$attached ? `${p.$color}10` : 'transparent'};
    border: 1px solid ${p => p.$attached ? `${p.$color}28` : 'transparent'};
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: all 0.12s;
    width: 100%;

    &:hover:not(:disabled) {
        background: ${p => p.$attached ? `${p.$color}1a` : 'rgba(255, 255, 255, 0.035)'};
    }

    &:disabled { opacity: 0.5; cursor: wait; }
`;

const InlineCheck = styled.div<{ $checked: boolean; $color: string }>`
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border-radius: 4px;
    background: ${p => p.$checked ? p.$color : 'transparent'};
    border: 1.5px solid ${p => p.$checked ? p.$color : 'rgba(255, 255, 255, 0.18)'};
    color: #0a0e17;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
`;

const InlineName = styled.span`
    font-size: 12px;
    color: #c9d1d9;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
`;

const InlineMore = styled.button`
    background: none;
    border: none;
    color: #6b7a8d;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    padding: 4px 8px;
    text-align: left;
    transition: color 0.12s;

    &:hover { color: #c9d1d9; }
`;

// ── Resource picker modal ───────────────────────────────────────────────────

const fadeInPicker = keyframes`
    from { opacity: 0; }
    to   { opacity: 1; }
`;

const slideInPicker = keyframes`
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1);    }
`;

const PickerBackdrop = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: ${fadeInPicker} 0.18s ease;
    padding: 24px;
`;

const PickerPanel = styled.div`
    width: 100%;
    max-width: 540px;
    max-height: 80vh;
    background: linear-gradient(180deg, #0f1622 0%, #0a0e17 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: ${slideInPicker} 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    font-family: 'IBM Plex Sans', sans-serif;
`;

const PickerHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

const PickerTitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const PickerHeaderIcon = styled.div<{ $color: string }>`
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${p => `${p.$color}1c`};
    color: ${p => p.$color};
    border: 1px solid ${p => `${p.$color}30`};
`;

const PickerTitle = styled.h3`
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #e8edf5;
    letter-spacing: -0.01em;
`;

const PickerSub = styled.p`
    margin: 1px 0 0;
    font-size: 11px;
    color: #6b7a8d;
    font-weight: 500;
`;

const PickerCloseBtn = styled.button`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    color: #6b7a8d;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;

    &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #e1e4e8;
        border-color: rgba(255, 255, 255, 0.14);
    }
`;

const PickerBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 14px 18px;

    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
`;

const PickerList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 7px;
`;

const PickerRow = styled.button<{ $attached: boolean; $color: string }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: ${p => p.$attached ? `${p.$color}0e` : 'rgba(255, 255, 255, 0.025)'};
    border: 1px solid ${p => p.$attached ? `${p.$color}38` : 'rgba(255, 255, 255, 0.06)'};
    border-radius: 10px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s;
    width: 100%;

    &:hover:not(:disabled) {
        background: ${p => p.$attached ? `${p.$color}1a` : 'rgba(255, 255, 255, 0.045)'};
        border-color: ${p => `${p.$color}50`};
        transform: translateX(2px);
    }

    &:disabled {
        opacity: 0.5;
        cursor: wait;
    }
`;

const PickerCheck = styled.div<{ $checked: boolean; $color: string }>`
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border-radius: 5px;
    background: ${p => p.$checked ? p.$color : 'transparent'};
    border: 1.5px solid ${p => p.$checked ? p.$color : 'rgba(255, 255, 255, 0.18)'};
    color: #0a0e17;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
`;

const PickerRowText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
`;

const PickerRowName = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #e8edf5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const PickerRowMeta = styled.span`
    font-size: 11px;
    color: #6b7a8d;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const PickerRowBadge = styled.span<{ $color: string }>`
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: ${p => p.$color};
    background: ${p => `${p.$color}18`};
    border: 1px solid ${p => `${p.$color}30`};
    padding: 3px 8px;
    border-radius: 5px;
    flex-shrink: 0;
`;

const PickerEmpty = styled.div`
    padding: 32px 16px;
    text-align: center;
    color: #6b7a8d;
    font-size: 13px;
`;

const PickerEmptyHint = styled.div`
    margin-top: 6px;
    font-size: 11px;
    color: #4a5568;
`;

const PickerFooter = styled.div`
    padding: 14px 18px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

const PickerCreateBtn = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 11px 14px;
    width: 100%;
    background: rgba(74, 158, 222, 0.08);
    border: 1px dashed rgba(74, 158, 222, 0.3);
    color: #4a9ede;
    border-radius: 9px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    transition: all 0.15s;

    &:hover {
        background: rgba(74, 158, 222, 0.14);
        border-color: rgba(74, 158, 222, 0.5);
        border-style: solid;
    }
`;

// ── Graph card ──────────────────────────────────────────────────────────────

const GraphSection = styled.div`
    background: #0f1722;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 16px 20px 18px;
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.04) inset,
        0 8px 24px -12px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const GraphHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 0 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: none;
    color: inherit;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    width: 100%;
    border-left: none;
    border-right: none;
    border-top: none;

    &:hover { opacity: 0.9; }
`;

const GraphHeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const GraphHeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 11px;
`;

const GraphHeaderIcon = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(74, 158, 222, 0.1);
    color: #4a9ede;
    border: 1px solid rgba(74, 158, 222, 0.22);
`;

const GraphHeaderText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const GraphHeaderSub = styled.span`
    font-size: 11px;
    color: #6b7a8d;
    font-weight: 500;
`;

// ── Server info card (separate section) ────────────────────────────────────

const ServerInfoSection = styled.div`
    background: #0f1722;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 18px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.04) inset,
        0 8px 24px -12px rgba(0, 0, 0, 0.5);
`;

// ── Shared collapsible section primitives ──────────────────────────────────

const CollapsibleSection = styled.div`
    background: #0f1722;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.04) inset,
        0 8px 24px -12px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

/**
 * Smoothly animates between collapsed and expanded states using the
 * grid-template-rows 0fr → 1fr trick (no max-height hack).
 */
const CollapseFrame = styled.div<{ $collapsed: boolean }>`
    display: grid;
    grid-template-rows: ${p => p.$collapsed ? '0fr' : '1fr'};
    transition: grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1);
`;

const CollapseInner = styled.div`
    overflow: hidden;
    min-height: 0;
`;

const SectionHeaderBar = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    color: inherit;
    text-align: left;
    width: 100%;

    &:hover {
        opacity: 0.85;
    }
`;

const SectionHeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 11px;
`;

const SectionHeaderIcon = styled.div`
    width: 26px;
    height: 26px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(74, 158, 222, 0.1);
    color: #4a9ede;
    border: 1px solid rgba(74, 158, 222, 0.22);
`;

const SectionHeaderCount = styled.span`
    font-size: 10px;
    font-weight: 600;
    color: #6b7a8d;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 2px 8px;
    border-radius: 10px;
`;

const CollapseChevron = styled.div<{ $collapsed: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7a8d;
    transition: transform 0.2s ease;
    transform: rotate(${p => p.$collapsed ? '-90deg' : '0deg'});
`;

const CollapsibleBody = styled.div`
    padding-top: 4px;
`;

const ServerInfoGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0;
`;

const ServerInfoItem = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 0;
    min-width: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);

    &:last-child { border-bottom: none; }
`;

const ServerInfoLabel = styled.span`
    font-size: 11px;
    font-weight: 600;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
`;

const ServerInfoValueBtn = styled.button<{ $mono?: boolean }>`
    background: none;
    border: none;
    outline: none;
    padding: 0;
    color: #c9d1d9;
    font-family: ${p => p.$mono ? "'IBM Plex Mono', monospace" : 'inherit'};
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    transition: color 0.12s;

    &:hover { color: #4a9ede; }
    &:focus { outline: none; }
    &:focus-visible { color: #4a9ede; }
`;

const GraphFrameworkPill = styled.span`
    font-size: 10px;
    font-weight: 700;
    color: #4a9ede;
    background: rgba(12, 92, 171, 0.14);
    border: 1px solid rgba(12, 92, 171, 0.25);
    padding: 4px 10px;
    border-radius: 5px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-family: 'IBM Plex Mono', monospace;
`;

const GraphCanvas = styled.div<{ $hidden?: boolean }>`
    position: relative;
    width: 100%;
    display: ${p => p.$hidden ? 'none' : 'flex'};
    align-items: center;
    justify-content: center;
    height: 240px;
    padding: 0;
    background:
        radial-gradient(ellipse at center, rgba(74, 158, 222, 0.04) 0%, transparent 70%),
        linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.05));
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 10px;
    overflow: hidden;
    cursor: grab;

    &:active { cursor: grabbing; }
`;

const ZoomControls = styled.div`
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 5;
`;

const ZoomBtn = styled.button`
    width: 30px;
    height: 30px;
    border-radius: 7px;
    background: rgba(10, 14, 23, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #c9d1d9;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    transition: all 0.15s;

    &:hover {
        background: rgba(74, 158, 222, 0.18);
        border-color: rgba(74, 158, 222, 0.4);
        color: #4a9ede;
    }

    &:active { transform: scale(0.94); }
`;

const ZoomHint = styled.div`
    position: absolute;
    bottom: 10px;
    left: 12px;
    font-size: 10px;
    font-weight: 500;
    color: #4a5568;
    background: rgba(10, 14, 23, 0.7);
    padding: 4px 8px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
    backdrop-filter: blur(6px);
`;

const GraphPlaceholder = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px 16px;
    font-size: 12px;
    color: #4a5568;
    font-style: italic;
    pointer-events: none;
`;

const MermaidWrap = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    align-items: stretch;
    justify-content: stretch;

    svg {
        display: block;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        font-family: 'IBM Plex Sans', sans-serif !important;
    }

    /* ── Nodes: rounded, gradient-shadowed, polished ── */
    .node rect,
    .node polygon,
    .node circle,
    .node ellipse,
    .node path {
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5))
                drop-shadow(0 0 0.5px rgba(255, 255, 255, 0.08));
        transition: all 0.2s ease;
    }

    .node:hover rect,
    .node:hover polygon,
    .node:hover circle,
    .node:hover ellipse,
    .node:hover path {
        filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.6))
                drop-shadow(0 0 8px rgba(74, 158, 222, 0.25));
    }

    /* ── Node text: refined typography ── */
    .node .label,
    .node text,
    .node foreignObject div {
        font-family: 'IBM Plex Sans', sans-serif !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        letter-spacing: -0.005em !important;
    }

    /* ── Edges: softer, refined ── */
    .edgePath path,
    .flowchart-link {
        stroke-width: 1.25px !important;
        stroke: rgba(122, 184, 235, 0.4) !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
        filter: drop-shadow(0 0 3px rgba(74, 158, 222, 0.15));
    }

    /* Arrow heads */
    marker path,
    .marker {
        fill: rgba(122, 184, 235, 0.55) !important;
        stroke: rgba(122, 184, 235, 0.55) !important;
    }

    /* ── Edge labels: subtle pill ── */
    .edgeLabel {
        background-color: rgba(10, 14, 23, 0.85) !important;
        color: #8899a6 !important;
        font-size: 10px !important;
        font-weight: 500 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        border: 1px solid rgba(255, 255, 255, 0.04);
    }
    .edgeLabel rect {
        fill: rgba(10, 14, 23, 0.9) !important;
        stroke: rgba(255, 255, 255, 0.05) !important;
    }

    /* ── Cluster (subgraph) refinement ── */
    .cluster rect {
        fill: rgba(255, 255, 255, 0.018) !important;
        stroke: rgba(255, 255, 255, 0.08) !important;
        stroke-dasharray: 4 4 !important;
        rx: 12 !important;
        ry: 12 !important;
    }
    .cluster .nodeLabel,
    .cluster .label {
        color: #6b7a8d !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
`;
