import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import AgentInfo from '../agent-info/component';
import type { BackendAgent } from '../../../../services/agents';

interface OverviewTabProps { agent: BackendAgent | null }

const OverviewTab = ({ agent }: OverviewTabProps) => {
    const { t } = useTranslation();
    
    // Extract observability provider from agent config
    const getObservabilityProviders = (): string[] => {
        if (!agent?.engine_config?.agent?.config) return [];
        const config = agent.engine_config.agent.config as any;
        
        const providers: string[] = [];
        if (config.observability?.enabled && config.observability?.provider) {
            providers.push(config.observability.provider);
        }
        return providers;
    };
    
    
    return (
        <Container>
            
            
            <MainContent>
                <DetailsCard>
                    <CardHeader>
                        <CardTitle>Agent Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <DetailRow>
                            <DetailLabel>Name</DetailLabel>
                            <DetailValue>{agent?.name ?? 'N/A'}</DetailValue>
                        </DetailRow>
                        
                        {agent?.description && (
                            <DetailRow>
                                <DetailLabel>Description</DetailLabel>
                                <DetailValue>{agent.description}</DetailValue>
                            </DetailRow>
                        )}
                        
                        <DetailRow>
                            <DetailLabel>Status</DetailLabel>
                            <StatusBadge status={agent?.status ?? 'draft'}>
                                {agent?.status ?? 'draft'}
                            </StatusBadge>
                        </DetailRow>
                        
                        <DetailRow>
                            <DetailLabel>Version</DetailLabel>
                            <DetailValue>{agent?.version ?? 'N/A'}</DetailValue>
                        </DetailRow>
                        
                        <DetailRow>
                            <DetailLabel>Created</DetailLabel>
                            <DetailValue>
                                {agent?.created_at 
                                    ? new Date(agent.created_at).toLocaleString('en-US', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short'
                                    })
                                    : 'N/A'}
                            </DetailValue>
                        </DetailRow>
                        
                        <DetailRow>
                            <DetailLabel>Last Updated</DetailLabel>
                            <DetailValue>
                                {agent?.updated_at 
                                    ? new Date(agent.updated_at).toLocaleString('en-US', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short'
                                    })
                                    : 'N/A'}
                            </DetailValue>
                        </DetailRow>
                    </CardContent>
                </DetailsCard>
                
                {/* {agent?.engine_config?.server?.api?.port && (
                    <DetailsCard>
                        <CardHeader>
                            <CardTitle>Server Configuration</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DetailRow>
                                <DetailLabel>API Port</DetailLabel>
                                <DetailValue>{agent.engine_config.server.api.port}</DetailValue>
                            </DetailRow>
                        </CardContent>
                    </DetailsCard>
                )} */}
            </MainContent>

            <Sidebar>
                <AgentInfo
                    framework={agent?.framework ?? 'UNKNOWN'}
                    observability={getObservabilityProviders()}
                />
            </Sidebar>
        </Container>
    );
};

export default OverviewTab;

const Container = styled.div`
    display: flex;
    width: 98%;
    gap: 24px;
    height: 100%;
    overflow-y: auto;
    padding: 24px 0;
`;

const Sidebar = styled.div`
    width: 300px;
    flex-shrink: 0;

    @media (max-width: 1024px) {
        width: 250px;
    }
`;

const MainContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
`;

const DetailsCard = styled.div`
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 12px;
    padding: 24px;
`;

const CardHeader = styled.div`
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
`;

const CardTitle = styled.h3`
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin: 0;
`;

const CardContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const DetailRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid rgba(42, 63, 95, 0.3);
    
    &:last-child {
        border-bottom: none;
    }
`;

const DetailLabel = styled.div`
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary, #8892b0);
`;

const DetailValue = styled.div`
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-primary, #ffffff);
    text-align: right;
`;

const StatusBadge = styled.span<{ status: string }>`
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    
    ${(props) => {
        switch (props.status.toLowerCase()) {
            case 'active':
                return `
                    background: rgba(16, 185, 129, 0.2);
                    color: #34d399;
                    border: 1px solid rgba(16, 185, 129, 0.3);
                `;
            case 'draft':
                return `
                    background: rgba(107, 114, 128, 0.2);
                    color: #9ca3af;
                    border: 1px solid rgba(107, 114, 128, 0.3);
                `;
            case 'inactive':
            case 'deprecated':
                return `
                    background: rgba(251, 191, 36, 0.2);
                    color: #fbbf24;
                    border: 1px solid rgba(251, 191, 36, 0.3);
                `;
            case 'error':
                return `
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.3);
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
