import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { FileText, ChevronRight } from 'lucide-react';
import { listAgentPrompts } from '../../../../services/prompts';
import type { ManagedPrompt } from '../../../../services/prompts';
import { extractVariables } from '../../../../utils/jinja';
import type { BackendAgent } from '../../../../services/agents';
import ReactMarkdown from 'react-markdown';

interface Props {
    agent: BackendAgent | null;
}

const PromptsTab = ({ agent }: Props) => {
    const [prompts, setPrompts] = useState<ManagedPrompt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!agent) return;
        setIsLoading(true);
        try {
            const data = await listAgentPrompts(agent.id);
            setPrompts(data);
        } catch (e) {
            console.error('Failed to load agent prompts', e);
        } finally {
            setIsLoading(false);
        }
    }, [agent]);

    useEffect(() => { load(); }, [load]);

    if (isLoading) {
        return <Empty>Loading prompts…</Empty>;
    }

    if (prompts.length === 0) {
        return (
            <EmptyState>
                <IconWrap><FileText size={24} strokeWidth={1.5} /></IconWrap>
                <EmptyTitle>No prompts assigned</EmptyTitle>
                <EmptyDesc>
                    Assign prompts to this agent from the <strong>Prompts</strong> page.
                </EmptyDesc>
            </EmptyState>
        );
    }

    return (
        <Container>
            {prompts.map(p => {
                const isExpanded = expandedId === p.id;
                const variables = extractVariables(p.content);
                return (
                    <PromptCard key={p.id}>
                        <CardHeader onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                            <Left>
                                <Chevron $expanded={isExpanded}><ChevronRight size={14} /></Chevron>
                                <PromptId>{p.prompt_id}</PromptId>
                                <Badge>v{p.version}</Badge>
                            </Left>
                            <Right>
                                {variables.length > 0 && (
                                    <VarGroup>
                                        {variables.slice(0, 3).map(v => (
                                            <VarPill key={v}>{'{{ ' + v + ' }}'}</VarPill>
                                        ))}
                                        {variables.length > 3 && <VarPill>+{variables.length - 3}</VarPill>}
                                    </VarGroup>
                                )}
                                {p.tags.map(tag => (
                                    <TagPill key={tag} $latest={tag === 'latest'}>{tag}</TagPill>
                                ))}
                            </Right>
                        </CardHeader>
                        {isExpanded && (
                            <ContentWrap>
                                <ReactMarkdown>{p.content}</ReactMarkdown>
                            </ContentWrap>
                        )}
                    </PromptCard>
                );
            })}
        </Container>
    );
};

export default PromptsTab;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const PromptCard = styled.div`
    background: var(--color-surface, rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.2s;
    &:hover { border-color: rgba(140,82,255,0.25); }
`;

const CardHeader = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 18px;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
`;

const Left = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const Right = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const Chevron = styled.span<{ $expanded: boolean }>`
    color: rgba(255,255,255,0.35);
    display: flex;
    transition: transform 0.2s;
    transform: rotate(${p => p.$expanded ? '90deg' : '0deg'});
`;

const PromptId = styled.span`
    font-size: 14px;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
`;

const Badge = styled.span`
    font-size: 11px;
    font-weight: 500;
    font-family: 'SF Mono', 'Fira Code', monospace;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(140,82,255,0.1);
    color: #a78bfa;
    border: 1px solid rgba(140,82,255,0.15);
`;

const VarGroup = styled.div`
    display: flex;
    gap: 4px;
`;

const VarPill = styled.span`
    font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.4);
    border: 1px solid rgba(255,255,255,0.06);
`;

const TagPill = styled.span<{ $latest?: boolean }>`
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    background: ${p => p.$latest ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)'};
    color: ${p => p.$latest ? '#34d399' : 'rgba(255,255,255,0.4)'};
    border: 1px solid ${p => p.$latest ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)'};
`;

const ContentWrap = styled.div`
    padding: 0 18px 16px;
    font-size: 14px;
    color: rgba(255,255,255,0.8);
    line-height: 1.7;
    background: rgba(0,0,0,0.15);
    border-top: 1px solid rgba(255,255,255,0.04);
    padding-top: 14px;

    h1, h2, h3, h4 { color: white; margin: 0.5em 0 0.3em; }
    h1 { font-size: 1.3em; }
    h2 { font-size: 1.15em; }
    p { margin: 0.4em 0; }
    code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 0.9em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255,255,255,0.06);
    }
    pre {
        background: rgba(0,0,0,0.3);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        code { padding: 0; background: none; }
    }
    ul, ol { padding-left: 1.4em; margin: 0.4em 0; }
    li { margin: 0.2em 0; }
    blockquote {
        border-left: 3px solid rgba(140,82,255,0.3);
        padding-left: 12px;
        margin: 0.5em 0;
        color: rgba(255,255,255,0.6);
    }
`;

const Empty = styled.div`
    padding: 60px;
    text-align: center;
    color: rgba(255,255,255,0.35);
    font-size: 14px;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 60px 40px;
    text-align: center;
`;

const IconWrap = styled.div`
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(140,82,255,0.08);
    border: 1px solid rgba(140,82,255,0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(140,82,255,0.5);
`;

const EmptyTitle = styled.p`
    font-size: 15px;
    font-weight: 600;
    color: white;
    margin: 0;
`;

const EmptyDesc = styled.p`
    font-size: 13px;
    color: rgba(255,255,255,0.35);
    margin: 0;
    strong { color: rgba(255,255,255,0.5); }
`;
