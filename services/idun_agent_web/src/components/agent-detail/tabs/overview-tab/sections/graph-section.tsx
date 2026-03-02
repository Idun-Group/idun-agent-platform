import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { GitBranch } from 'lucide-react';
import mermaid from 'mermaid';
import { fetchAgentGraph } from '../../../../../services/agents';
import type { BackendAgent } from '../../../../../services/agents';
import { SectionCard, SectionHeader, SectionIcon, SectionTitle } from './styled';

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        primaryColor: '#8c52ff',
        primaryTextColor: '#e5e7eb',
        primaryBorderColor: '#6d3bce',
        lineColor: '#6b7280',
        secondaryColor: 'rgba(140, 82, 255, 0.1)',
        tertiaryColor: 'rgba(255, 255, 255, 0.02)',
    },
});

interface GraphSectionProps {
    agent: BackendAgent;
}

const GraphSection = ({ agent }: GraphSectionProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!agent.base_url || agent.framework !== 'LANGGRAPH') return;

        let cancelled = false;
        setLoading(true);
        setError(null);

        fetchAgentGraph(agent.base_url).then(async (graphStr) => {
            if (cancelled || !containerRef.current) return;

            if (!graphStr) {
                setError('Could not load graph');
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
                setError('Failed to render graph');
            } finally {
                if (!cancelled) setLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [agent.base_url, agent.id, agent.framework]);

    if (agent.framework !== 'LANGGRAPH') return null;

    return (
        <SectionCard>
            <SectionHeader>
                <SectionIcon $color="blue">
                    <GitBranch size={16} />
                </SectionIcon>
                <SectionTitle>Agent Graph</SectionTitle>
            </SectionHeader>

            <GraphContainer>
                {loading && <Placeholder>Loading graph...</Placeholder>}
                {error && <Placeholder>{error}</Placeholder>}
                <MermaidContainer ref={containerRef} />
            </GraphContainer>
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
