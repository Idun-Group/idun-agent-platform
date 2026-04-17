import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { FileText, ChevronRight, Info } from 'lucide-react';
import { listAgentPrompts } from '../../../../services/prompts';
import type { ManagedPrompt } from '../../../../services/prompts';
import { extractVariables } from '../../../../utils/jinja';
import type { BackendAgent } from '../../../../services/agents';
import { useProject } from '../../../../hooks/use-project';
import ReactMarkdown from 'react-markdown';
import CodeSnippet from '../../../../pages/agent-form/components/code-snippet';

function generateUsageSnippet(promptId: string, variables: string[]): string {
    const lines = [
        'from idun_agent_engine import get_prompt',
        '',
        `prompt = get_prompt("${promptId}")`,
    ];
    if (variables.length > 0) {
        const args = variables.map(v => `${v}="..."`).join(', ');
        lines.push(`rendered = prompt.format(${args})`);
    }
    return lines.join('\n');
}

interface Props {
    agent: BackendAgent | null;
}

const PromptsTab = ({ agent }: Props) => {
    const { selectedProjectId } = useProject();
    const [prompts, setPrompts] = useState<ManagedPrompt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!agent) return;
        setIsLoading(true);
        setPrompts([]);
        try {
            const data = await listAgentPrompts(agent.id);
            setPrompts(data);
        } catch (e) {
            console.error('Failed to load agent prompts', e);
        } finally {
            setIsLoading(false);
        }
    }, [agent]);

    useEffect(() => { load(); }, [load, selectedProjectId]);

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
                        <CardHeader
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            aria-label={`Toggle ${p.prompt_id} details`}
                            aria-expanded={isExpanded}
                        >
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
                            <>
                                <ContentWrap>
                                    <ReactMarkdown>{p.content}</ReactMarkdown>
                                </ContentWrap>
                                <UsageWrap>
                                    <UsageHeader>
                                        <UsageLabel style={{ marginBottom: 0 }}>Usage</UsageLabel>
                                        <TooltipContainer>
                                            <Info size={13} color="hsl(var(--muted-foreground))" />
                                            <TooltipText>
                                                Prompts are not auto-injected. Your agent code must call get_prompt() to load the template, then .format() to render variables before passing it to the LLM.
                                            </TooltipText>
                                        </TooltipContainer>
                                    </UsageHeader>
                                    <CodeSnippet
                                        code={generateUsageSnippet(p.prompt_id, variables)}
                                        language="python"
                                    />
                                </UsageWrap>
                            </>
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
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.2s;
    &:hover { border-color: rgba(140, 82, 255, 0.25); }
`;

const CardHeader = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 18px;
    background: transparent;
    border: none;
    color: hsl(var(--foreground));
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
    color: hsl(var(--text-tertiary));
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
    background: rgba(140, 82, 255, 0.1);
    color: #a78bfa;
    border: 1px solid rgba(140, 82, 255, 0.15);
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
    background: var(--overlay-subtle);
    color: hsl(var(--text-tertiary));
    border: 1px solid var(--border-subtle);
`;

const TagPill = styled.span<{ $latest?: boolean }>`
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    background: ${p => p.$latest ? 'rgba(52, 211, 153, 0.1)' : 'var(--overlay-subtle)'};
    color: ${p => p.$latest ? '#34d399' : 'hsl(var(--text-tertiary))'};
    border: 1px solid ${p => p.$latest ? 'rgba(52, 211, 153, 0.18)' : 'var(--border-subtle)'};
`;

const ContentWrap = styled.div`
    padding: 0 18px 16px;
    font-size: 14px;
    color: hsl(var(--foreground) / 0.85);
    line-height: 1.7;
    background: var(--overlay-subtle);
    border-top: 1px solid var(--border-subtle);
    padding-top: 14px;

    h1, h2, h3, h4 { color: hsl(var(--foreground)); margin: 0.5em 0 0.3em; }
    h1 { font-size: 1.3em; }
    h2 { font-size: 1.15em; }
    p { margin: 0.4em 0; }
    code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 0.9em;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--overlay-light);
    }
    pre {
        background: var(--overlay-light);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        code { padding: 0; background: none; }
    }
    ul, ol { padding-left: 1.4em; margin: 0.4em 0; }
    li { margin: 0.2em 0; }
    blockquote {
        border-left: 3px solid rgba(140, 82, 255, 0.3);
        padding-left: 12px;
        margin: 0.5em 0;
        color: hsl(var(--text-secondary));
    }
`;

const Empty = styled.div`
    padding: 60px;
    text-align: center;
    color: hsl(var(--text-tertiary));
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
    background: rgba(140, 82, 255, 0.08);
    border: 1px solid rgba(140, 82, 255, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(140, 82, 255, 0.5);
`;

const EmptyTitle = styled.p`
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const EmptyDesc = styled.p`
    font-size: 13px;
    color: hsl(var(--text-tertiary));
    margin: 0;
    strong { color: hsl(var(--text-secondary)); }
`;

const UsageWrap = styled.div`
    padding: 14px 18px 16px;
    background: var(--overlay-subtle);
    border-top: 1px solid var(--border-subtle);
`;

const UsageHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
`;

const UsageLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--text-tertiary));
    margin-bottom: 8px;
`;

const TooltipContainer = styled.div`
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: help;
`;

const TooltipText = styled.div`
    visibility: hidden;
    width: max-content;
    max-width: 300px;
    background-color: hsl(var(--popover));
    color: hsl(var(--popover-foreground));
    text-align: left;
    border-radius: 6px;
    padding: 8px 12px;
    position: absolute;
    z-index: 100;
    bottom: 125%;
    left: -10px;
    opacity: 0;
    transition: opacity 0.2s;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border-subtle);
    pointer-events: none;
    white-space: normal;

    &::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 17px;
        border-width: 5px;
        border-style: solid;
        border-color: hsl(var(--popover)) transparent transparent transparent;
    }

    ${TooltipContainer}:hover & {
        visibility: visible;
        opacity: 1;
    }
`;
