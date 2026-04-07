import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { GitBranch, ChevronDown } from 'lucide-react';
import mermaid from 'mermaid';
import { fetchAgentGraph } from '../../../../../services/agents';
import type { BackendAgent } from '../../../../../services/agents';
import { SectionCard, SectionIcon, SectionTitle, CollapsibleHeader, CollapseChevron } from './styled';

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        primaryColor: '#0C5CAB',
        primaryTextColor: '#e1e4e8',
        primaryBorderColor: '#0a4e94',
        lineColor: '#6b7280',
        secondaryColor: 'rgba(12, 92, 171, 0.1)',
        tertiaryColor: 'rgba(255, 255, 255, 0.02)',
    },
});

interface GraphSectionProps {
    agent: BackendAgent;
    refreshKey?: number;
}

const GraphSection = ({ agent, refreshKey }: GraphSectionProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (agent.framework !== 'LANGGRAPH') return;
        if (!agent.base_url) {
            setError('Agent has no base URL configured');
            setLoading(false);
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
                    const id = `mermaid-${agent.id.replace(/[^a-zA-Z0-9]/g, '')}`;
                    const { svg } = await mermaid.render(id, graphStr);
                    if (!cancelled && containerRef.current) {
                        containerRef.current.innerHTML = svg;
                    }
                } catch {
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

        return () => { cancelled = true; };
    }, [agent.base_url, agent.id, agent.framework, refreshKey]);

    return (
        <SectionCard>
            <CollapsibleHeader $collapsed={collapsed} onClick={() => setCollapsed(c => !c)} type="button">
                <SectionIcon $color="blue">
                    <GitBranch size={16} />
                </SectionIcon>
                <SectionTitle>Agent Graph</SectionTitle>
                <CollapseChevron $collapsed={collapsed}>
                    <ChevronDown size={16} />
                </CollapseChevron>
            </CollapsibleHeader>

            {!collapsed && (
                <GraphContainer>
                    {agent.framework !== 'LANGGRAPH' && (
                        <Placeholder>Graph visualization is only available for LangGraph agents</Placeholder>
                    )}
                    {agent.framework === 'LANGGRAPH' && loading && <Placeholder>Loading graph…</Placeholder>}
                    {agent.framework === 'LANGGRAPH' && error && <Placeholder>{error}</Placeholder>}
                    {agent.framework === 'LANGGRAPH' && <MermaidContainer ref={containerRef} />}
                </GraphContainer>
            )}
        </SectionCard>
    );
};

export default GraphSection;

const GraphContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100px;
`;

const MermaidContainer = styled.div`
    width: 100%;
    display: flex;
    justify-content: center;

    svg {
        max-width: 100%;
        height: auto;
    }
`;

const Placeholder = styled.div`
    font-size: 13px;
    color: #6b7280;
    padding: 24px 0;
`;
