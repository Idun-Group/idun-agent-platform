import { useState, useEffect } from 'react';
import { Info, Pencil, Save } from 'lucide-react';
import type { BackendAgent } from '../../../../../services/agents';
import { patchAgent } from '../../../../../services/agents';
import { notify } from '../../../../toast/notify';
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
    SectionEditButton,
    SectionActions,
    SectionSaveButton,
    SectionCancelButton,
} from './styled';

interface AgentDetailsSectionProps {
    agent: BackendAgent;
    onAgentRefresh?: () => void;
}

interface LocalForm {
    name: string;
    version: string;
    description: string;
    baseUrl: string;
    serverPort: string;
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

function buildLocalForm(agent: BackendAgent): LocalForm {
    return {
        name: agent.name || '',
        version: agent.version || '1.0.0',
        description: agent.description || '',
        baseUrl: agent.base_url || '',
        serverPort: String(agent.engine_config?.server?.api?.port ?? 8000),
    };
}

export default function AgentDetailsSection({ agent, onAgentRefresh }: AgentDetailsSectionProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [localForm, setLocalForm] = useState<LocalForm>(buildLocalForm(agent));

    // Sync form from agent prop when not editing
    useEffect(() => {
        if (!isEditing) {
            setLocalForm(buildLocalForm(agent));
        }
    }, [agent, isEditing]);

    const handleSave = async () => {
        if (!localForm.name.trim()) {
            notify.error('Agent name is required');
            return;
        }
        setIsSaving(true);
        try {
            const port = parseInt(localForm.serverPort, 10);
            const existingEngineConfig = agent.engine_config || {};
            await patchAgent(agent.id, {
                name: localForm.name,
                version: localForm.version,
                base_url: localForm.baseUrl,
                engine_config: {
                    ...existingEngineConfig,
                    server: {
                        ...(existingEngineConfig.server || {}),
                        api: {
                            ...((existingEngineConfig.server as Record<string, unknown>)?.api as Record<string, unknown> || {}),
                            port: isNaN(port) ? 8000 : port,
                        },
                    },
                },
            } as any);
            setIsEditing(false);
            notify.success('Agent details updated');
            onAgentRefresh?.();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setLocalForm(buildLocalForm(agent));
        setIsEditing(false);
    };

    return (
        <SectionCard>
            <SectionHeader>
                <SectionIcon $color="purple"><Info size={16} /></SectionIcon>
                <SectionTitle>Agent Details</SectionTitle>
                {!isEditing && (
                    <SectionEditButton onClick={() => setIsEditing(true)} type="button">
                        <Pencil size={12} /> Edit
                    </SectionEditButton>
                )}
            </SectionHeader>

            {/* Always-shown rows (non-editable) */}
            <DetailRow>
                <DetailLabel>Status</DetailLabel>
                <Badge $variant={getStatusVariant(agent.status || 'draft')}>
                    {agent.status || 'DRAFT'}
                </Badge>
            </DetailRow>
            <DetailRow>
                <DetailLabel>ID</DetailLabel>
                <DetailValue style={{ fontFamily: 'monospace', fontSize: '12px' }}>{agent.id}</DetailValue>
            </DetailRow>

            {/* Editable rows */}
            <DetailRow>
                <DetailLabel>Name</DetailLabel>
                {isEditing ? (
                    <EditableInput
                        value={localForm.name}
                        onChange={e => setLocalForm(p => ({ ...p, name: e.target.value }))}
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
                        value={localForm.description}
                        onChange={e => setLocalForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Description"
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
                        value={localForm.version}
                        onChange={e => setLocalForm(p => ({ ...p, version: e.target.value }))}
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
                        value={localForm.baseUrl}
                        onChange={e => setLocalForm(p => ({ ...p, baseUrl: e.target.value }))}
                        placeholder="https://..."
                    />
                ) : (
                    <DetailValue>{agent.base_url || '—'}</DetailValue>
                )}
            </DetailRow>
            <DetailRow>
                <DetailLabel>Server Port</DetailLabel>
                {isEditing ? (
                    <EditableInput
                        value={localForm.serverPort}
                        onChange={e => setLocalForm(p => ({ ...p, serverPort: e.target.value }))}
                        type="number"
                        placeholder="8000"
                    />
                ) : (
                    <DetailValue>{agent.engine_config?.server?.api?.port ?? 8000}</DetailValue>
                )}
            </DetailRow>
            <DetailRow>
                <DetailLabel>Created</DetailLabel>
                <DetailValue>{agent.created_at ? formatDate(agent.created_at) : 'N/A'}</DetailValue>
            </DetailRow>
            <DetailRow>
                <DetailLabel>Last Updated</DetailLabel>
                <DetailValue>{agent.updated_at ? formatDate(agent.updated_at) : 'N/A'}</DetailValue>
            </DetailRow>

            {isEditing && (
                <SectionActions>
                    <SectionCancelButton onClick={handleCancel} type="button">Cancel</SectionCancelButton>
                    <SectionSaveButton onClick={handleSave} disabled={isSaving} type="button">
                        <Save size={13} /> {isSaving ? 'Saving…' : 'Save'}
                    </SectionSaveButton>
                </SectionActions>
            )}
        </SectionCard>
    );
}
