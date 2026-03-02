import { Info } from 'lucide-react';
import type { BackendAgent } from '../../../../../services/agents';
import type { AgentFormState } from '../../../../../utils/agent-config-utils';
import {
    SectionCard,
    SectionHeader,
    SectionTitle,
    SectionIcon,
    DetailRow,
    DetailLabel,
    DetailValue,
    Badge,
    EditableInput,
    EditableTextarea,
} from './styled';

interface AgentDetailsSectionProps {
    agent: BackendAgent;
    isEditing: boolean;
    formState: AgentFormState;
    onFieldChange: (field: keyof AgentFormState, value: string) => void;
}

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

const getStatusVariant = (status: string): 'active' | 'draft' | 'error' | 'default' => {
    const s = status.toLowerCase();
    if (s === 'active') return 'active';
    if (s === 'error') return 'error';
    if (s === 'draft') return 'draft';
    return 'default';
};

export default function AgentDetailsSection({ agent, isEditing, formState, onFieldChange }: AgentDetailsSectionProps) {
    return (
        <SectionCard>
            <SectionHeader>
                <SectionIcon $color="purple"><Info size={16} /></SectionIcon>
                <SectionTitle>Agent Details</SectionTitle>
            </SectionHeader>

            <DetailRow>
                <DetailLabel>Name</DetailLabel>
                {isEditing ? (
                    <EditableInput
                        value={formState.name}
                        onChange={e => onFieldChange('name', e.target.value)}
                        placeholder="Agent name"
                    />
                ) : (
                    <DetailValue>{agent.name || 'N/A'}</DetailValue>
                )}
            </DetailRow>

            <DetailRow>
                <DetailLabel>Description</DetailLabel>
                {isEditing ? (
                    <EditableTextarea
                        value={formState.description}
                        onChange={e => onFieldChange('description', e.target.value)}
                        placeholder="Agent description"
                        rows={2}
                    />
                ) : (
                    <DetailValue>{agent.description || '—'}</DetailValue>
                )}
            </DetailRow>

            <DetailRow>
                <DetailLabel>Version</DetailLabel>
                {isEditing ? (
                    <EditableInput
                        value={formState.version}
                        onChange={e => onFieldChange('version', e.target.value)}
                        placeholder="1.0.0"
                    />
                ) : (
                    <DetailValue>{agent.version || 'N/A'}</DetailValue>
                )}
            </DetailRow>

            <DetailRow>
                <DetailLabel>Base URL</DetailLabel>
                {isEditing ? (
                    <EditableInput
                        value={formState.baseUrl}
                        onChange={e => onFieldChange('baseUrl', e.target.value)}
                        placeholder="https://api.example.com"
                    />
                ) : (
                    <DetailValue>{agent.base_url || '—'}</DetailValue>
                )}
            </DetailRow>

            <DetailRow>
                <DetailLabel>Server Port</DetailLabel>
                {isEditing ? (
                    <EditableInput
                        value={formState.serverPort}
                        onChange={e => onFieldChange('serverPort', e.target.value)}
                        placeholder="8000"
                        type="number"
                    />
                ) : (
                    <DetailValue>{agent.engine_config?.server?.api?.port ?? '8000'}</DetailValue>
                )}
            </DetailRow>

            <DetailRow>
                <DetailLabel>Status</DetailLabel>
                <Badge $variant={getStatusVariant(agent.status || 'draft')}>
                    {agent.status || 'DRAFT'}
                </Badge>
            </DetailRow>

            <DetailRow>
                <DetailLabel>Created</DetailLabel>
                <DetailValue>{agent.created_at ? formatDate(agent.created_at) : 'N/A'}</DetailValue>
            </DetailRow>

            <DetailRow>
                <DetailLabel>Last Updated</DetailLabel>
                <DetailValue>{agent.updated_at ? formatDate(agent.updated_at) : 'N/A'}</DetailValue>
            </DetailRow>
        </SectionCard>
    );
}
