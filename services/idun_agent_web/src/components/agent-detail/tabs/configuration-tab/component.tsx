import styled from 'styled-components';
import type { BackendAgent } from '../../../../services/agents';

interface ConfigurationTabProps { agent: BackendAgent | null }

const ConfigurationTab = ({ agent }: ConfigurationTabProps) => {
    return (
        <ConfigurationSection>
            <ConfigurationGrid>
                {agent?.engine_config?.server?.api?.port && (
                    <ConfigCard>
                        <ConfigCardHeader>
                            <ConfigCardTitle>Server Configuration</ConfigCardTitle>
                        </ConfigCardHeader>
                        <ConfigCardContent>
                            <ConfigRow>
                                <ConfigLabel>API Port</ConfigLabel>
                                <ConfigValue>{agent.engine_config.server.api.port}</ConfigValue>
                            </ConfigRow>
                        </ConfigCardContent>
                    </ConfigCard>
                )}
                
                {agent?.config ? (
                    <ConfigCard>
                        <ConfigCardHeader>
                            <ConfigCardTitle>Agent Configuration</ConfigCardTitle>
                        </ConfigCardHeader>
                        <ConfigCardContent>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
{JSON.stringify(agent.config, null, 2)}
                            </pre>
                        </ConfigCardContent>
                    </ConfigCard>
                ) : null}

                {agent?.engine_config ? (
                    <ConfigCard>
                        <ConfigCardHeader>
                            <ConfigCardTitle>Engine Configuration</ConfigCardTitle>
                        </ConfigCardHeader>
                        <ConfigCardContent>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
{JSON.stringify(agent.engine_config, null, 2)}
                            </pre>
                        </ConfigCardContent>
                    </ConfigCard>
                ) : null}
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

    pre { color: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
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

// Removed unused badges and mock-only styles
