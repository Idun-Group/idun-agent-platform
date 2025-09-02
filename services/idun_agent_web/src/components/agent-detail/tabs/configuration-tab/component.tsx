import styled from 'styled-components';
import { configurationData } from '../../../../data/agent-mock-data';

interface ConfigurationTabProps {}

const ConfigurationTab = ({}: ConfigurationTabProps) => {
    return (
        <ConfigurationSection>
            <ConfigurationGrid>
                <ConfigCard>
                    <ConfigCardHeader>
                        <ConfigCardTitle>General Configuration</ConfigCardTitle>
                    </ConfigCardHeader>
                    <ConfigCardContent>
                        <ConfigRow>
                            <ConfigLabel>Agent to Agent</ConfigLabel>
                            <ConfigValue>
                                <EnabledBadge
                                    $enabled={
                                        configurationData.general.agentToAgent
                                            .enabled
                                    }
                                >
                                    {
                                        configurationData.general.agentToAgent
                                            .label
                                    }
                                </EnabledBadge>
                            </ConfigValue>
                        </ConfigRow>
                        <ConfigRow>
                            <ConfigLabel>Streaming</ConfigLabel>
                            <ConfigValue>
                                <EnabledBadge
                                    $enabled={
                                        configurationData.general.streaming
                                            .enabled
                                    }
                                >
                                    {configurationData.general.streaming.label}
                                </EnabledBadge>
                            </ConfigValue>
                        </ConfigRow>
                        <ConfigRow>
                            <ConfigLabel>Input Schema</ConfigLabel>
                            <ConfigValue>
                                {configurationData.general.inputSchema}
                            </ConfigValue>
                        </ConfigRow>
                        <ConfigRow>
                            <ConfigLabel>Output Schema</ConfigLabel>
                            <ConfigValue>
                                {configurationData.general.outputSchema}
                            </ConfigValue>
                        </ConfigRow>
                        <ConfigSection>
                            <ConfigSectionTitle>Parameters</ConfigSectionTitle>
                            <ConfigRow>
                                <ConfigLabel>max_retries</ConfigLabel>
                                <ConfigValue>
                                    {
                                        configurationData.general.parameters
                                            .max_retries
                                    }
                                </ConfigValue>
                            </ConfigRow>
                            <ConfigRow>
                                <ConfigLabel>language</ConfigLabel>
                                <ConfigValue>
                                    {
                                        configurationData.general.parameters
                                            .language
                                    }
                                </ConfigValue>
                            </ConfigRow>
                        </ConfigSection>
                    </ConfigCardContent>
                </ConfigCard>

                <ConfigCard>
                    <ConfigCardHeader>
                        <ConfigCardTitle>
                            📄 LangGraph Configuration
                        </ConfigCardTitle>
                    </ConfigCardHeader>
                    <ConfigCardContent>
                        <ConfigRow>
                            <ConfigLabel>Checkpoint Type</ConfigLabel>
                            <ConfigValue>
                                <CheckpointBadge>
                                    {configurationData.langGraph.checkpointType}
                                </CheckpointBadge>
                            </ConfigValue>
                        </ConfigRow>
                        <ConfigRow>
                            <ConfigLabel>Database Path</ConfigLabel>
                            <ConfigValue
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '13px',
                                }}
                            >
                                {configurationData.langGraph.databasePath}
                            </ConfigValue>
                        </ConfigRow>
                    </ConfigCardContent>
                </ConfigCard>

                <ConfigCard>
                    <ConfigCardHeader>
                        <ConfigCardTitle>👁️ Observability</ConfigCardTitle>
                    </ConfigCardHeader>
                    <ConfigCardContent>
                        <ConfigRow>
                            <ConfigLabel>Provider</ConfigLabel>
                            <ConfigValue>
                                <ProviderBadge>
                                    {configurationData.observability.provider}
                                </ProviderBadge>
                            </ConfigValue>
                        </ConfigRow>
                        <ConfigSection>
                            <ConfigSectionTitle>
                                Configuration
                            </ConfigSectionTitle>
                            <ConfigRow>
                                <ConfigLabel>langfuse_api_key</ConfigLabel>
                                <ConfigValue
                                    style={{
                                        fontFamily: 'monospace',
                                        fontSize: '13px',
                                    }}
                                >
                                    {
                                        configurationData.observability
                                            .configuration.langfuse_api_key
                                    }
                                </ConfigValue>
                            </ConfigRow>
                            <ConfigRow>
                                <ConfigLabel>langfuse_host</ConfigLabel>
                                <ConfigValue
                                    style={{
                                        fontFamily: 'monospace',
                                        fontSize: '13px',
                                    }}
                                >
                                    {
                                        configurationData.observability
                                            .configuration.langfuse_host
                                    }
                                </ConfigValue>
                            </ConfigRow>
                        </ConfigSection>
                    </ConfigCardContent>
                </ConfigCard>
            </ConfigurationGrid>
        </ConfigurationSection>
    );
};

export default ConfigurationTab;

const ConfigurationSection = styled.div`
    flex: 1;
    padding: 40px;
`;

const ConfigurationGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;

    @media (max-width: 1024px) {
        grid-template-columns: 1fr;
    }
`;

const ConfigCard = styled.div`
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 12px;
    overflow: hidden;

    &:nth-child(3) {
        grid-column: 1 / -1;
        max-width: 400px;
    }
`;

const ConfigCardHeader = styled.div`
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
`;

const ConfigCardTitle = styled.h3`
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary, #ffffff);
`;

const ConfigCardContent = styled.div`
    padding: 24px;
`;

const ConfigRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);

    &:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }
`;

const ConfigLabel = styled.span`
    font-size: 14px;
    color: var(--color-text-secondary, #8892b0);
    font-weight: 500;
`;

const ConfigValue = styled.span`
    font-size: 14px;
    color: var(--color-text-primary, #ffffff);
    font-weight: 500;
`;

const ConfigSection = styled.div`
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--color-border-primary, #2a3f5f);
`;

const ConfigSectionTitle = styled.h4`
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin: 0 0 16px 0;
`;

const EnabledBadge = styled.span<{ $enabled: boolean }>`
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    ${(props) =>
        props.$enabled
            ? `
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    `
            : `
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    `}
`;

const CheckpointBadge = styled.span`
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
`;

const ProviderBadge = styled.span`
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(140, 82, 255, 0.2);
    color: #a78bfa;
    border: 1px solid rgba(140, 82, 255, 0.3);
`;
