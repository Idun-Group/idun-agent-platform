import { Github, Clock, Wrench } from 'lucide-react';
import styled from 'styled-components';

export interface AgentInfoProps {
    framework: string;
    source: {
        type: 'github' | 'upload' | 'remote' | 'project';
        url?: string;
        name?: string;
    };
    tools: string[];
    lastRun: string;
    observability: string[];
}

export default function AgentInfo({
    framework,
    source,
    tools,
    lastRun,
    observability,
}: AgentInfoProps) {
    return (
        <InfoContainer>
            <InfoHeader>
                <InfoTitle>Informations de l'agent</InfoTitle>
            </InfoHeader>

            <InfoContent>
                <InfoSection>
                    <SectionLabel>Framework</SectionLabel>
                    <Badge $color="blue">{framework}</Badge>
                </InfoSection>

                <InfoSection>
                    <SectionLabel>Source</SectionLabel>
                    <SourceInfo>
                        {source.type === 'github' && <Github size={16} />}
                        <span>{source.type}</span>
                    </SourceInfo>
                    {source.url && (
                        <SourceUrl
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {source.url}
                        </SourceUrl>
                    )}
                </InfoSection>

                <InfoSection>
                    <SectionLabel>Tools</SectionLabel>
                    <ToolsList>
                        {tools.map((tool, index) => (
                            <ToolItem key={index}>
                                <Wrench size={14} />
                                {tool}
                            </ToolItem>
                        ))}
                    </ToolsList>
                </InfoSection>

                <InfoSection>
                    <SectionLabel>Last Run</SectionLabel>
                    <LastRunInfo>
                        <Clock size={16} />
                        <span>{lastRun}</span>
                    </LastRunInfo>
                </InfoSection>

                <InfoSection>
                    <SectionLabel>Observability</SectionLabel>
                    <ObservabilityList>
                        {observability.map((item, index) => (
                            <Badge key={index} $color="purple">
                                {item}
                            </Badge>
                        ))}
                    </ObservabilityList>
                </InfoSection>
            </InfoContent>
        </InfoContainer>
    );
}

const InfoContainer = styled.div`
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 12px;
    padding: 24px;
`;

const InfoHeader = styled.div`
    margin-bottom: 24px;
`;

const InfoTitle = styled.h3`
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin: 0;
`;

const InfoContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const InfoSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const SectionLabel = styled.div`
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary, #8892b0);
`;

const Badge = styled.span<{ $color: 'blue' | 'purple' | 'green' }>`
    display: inline-flex;
    align-items: center;
    align-self: flex-start; /* prevent stretching to full width in column layout */
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    ${(props) => {
        switch (props.$color) {
            case 'blue':
                return `
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        `;
            case 'purple':
                return `
          background: rgba(140, 82, 255, 0.2);
          color: #a78bfa;
          border: 1px solid rgba(140, 82, 255, 0.3);
        `;
            case 'green':
                return `
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        `;
            default:
                return `
          background: rgba(107, 114, 128, 0.2);
          color: #9ca3af;
          border: 1px solid rgba(107, 114, 128, 0.3);
        `;
        }
    }}
`;

const SourceInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-primary, #ffffff);
    font-weight: 500;

    svg {
        color: var(--color-text-secondary, #8892b0);
    }
`;

const SourceUrl = styled.a`
    color: var(--color-primary, #8c52ff);
    font-size: 14px;
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }
`;

const ToolsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ToolItem = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-primary, #ffffff);
    font-size: 14px;

    svg {
        color: var(--color-text-secondary, #8892b0);
    }
`;

const LastRunInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-primary, #ffffff);
    font-weight: 500;

    svg {
        color: var(--color-text-secondary, #8892b0);
    }
`;

const ObservabilityList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;
