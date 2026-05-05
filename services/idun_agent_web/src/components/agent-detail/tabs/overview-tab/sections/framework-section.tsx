import { useState, useEffect } from 'react';
import { Layers, Pencil, Save } from 'lucide-react';
import { DynamicForm } from '../../../../general/dynamic-form/component';
import { FRAMEWORK_SCHEMA_MAP, extractAgentConfig } from '../../../../../utils/agent-config-utils';
import type { BackendAgent } from '../../../../../services/agents';
import { patchAgent } from '../../../../../services/agents';
import { notify } from '../../../../toast/notify';
import { getJson } from '../../../../../utils/api';
import {
    SectionCard,
    SectionHeader,
    SectionTitle,
    SectionIcon,
    DetailRow,
    DetailLabel,
    DetailValue,
    Badge,
    SectionEditButton,
    SectionActions,
    SectionSaveButton,
    SectionCancelButton,
} from './styled';

interface FrameworkSectionProps {
    agent: BackendAgent;
    onAgentRefresh?: () => void;
}

export default function FrameworkSection({ agent, onAgentRefresh }: FrameworkSectionProps) {
    const framework = agent.framework || 'LANGGRAPH';

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [agentConfig, setAgentConfig] = useState<Record<string, any>>({});
    const [rootSchema, setRootSchema] = useState<any>(null);

    // Fetch schema when entering edit mode
    useEffect(() => {
        if (!isEditing || rootSchema) return;
        getJson('/api/openapi.json')
            .then(setRootSchema)
            .catch(console.error);
    }, [isEditing, rootSchema]);

    // Initialize agentConfig from agent when entering edit mode
    useEffect(() => {
        if (isEditing) {
            setAgentConfig(extractAgentConfig(agent.engine_config));
        }
    }, [isEditing, agent]);

    const getCurrentSchema = () => {
        if (!rootSchema) return null;
        const schema = rootSchema.components?.schemas?.[FRAMEWORK_SCHEMA_MAP[framework]];
        if (schema && framework === 'ADK') {
            const patched = JSON.parse(JSON.stringify(schema));
            if (patched.properties?.agent) {
                patched.properties.agent.title = 'Agent Definition Path';
            }
            return patched;
        }
        return schema;
    };

    const getKeyConfigValues = (): Array<{ label: string; value: string }> => {
        const config = agent.engine_config?.agent?.config as Record<string, any> | undefined;
        if (!config) return [];
        const entries: Array<{ label: string; value: string }> = [];

        if (framework === 'LANGGRAPH') {
            if (config.graph_definition) entries.push({ label: 'Graph Definition', value: typeof config.graph_definition === 'string' ? config.graph_definition : JSON.stringify(config.graph_definition) });
            if (config.checkpointer?.type) entries.push({ label: 'Checkpointer', value: config.checkpointer.type });
        } else if (framework === 'ADK') {
            if (config.agent) entries.push({ label: 'Agent', value: String(config.agent) });
            if (config.app_name) entries.push({ label: 'App Name', value: config.app_name });
        } else if (framework === 'HAYSTACK') {
            if (config.component_type) entries.push({ label: 'Component Type', value: config.component_type });
        }

        return entries;
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const existingEngineConfig = agent.engine_config || {};
            await patchAgent(agent.id, {
                name: agent.name,
                engine_config: {
                    ...existingEngineConfig,
                    agent: {
                        ...(existingEngineConfig.agent || {}),
                        config: agentConfig,
                    },
                },
            } as any);
            setIsEditing(false);
            notify.success('Framework configuration updated');
            onAgentRefresh?.();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setAgentConfig(extractAgentConfig(agent.engine_config));
        setIsEditing(false);
    };

    useEffect(() => {
        if (!isEditing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isEditing]);

    const schema = getCurrentSchema();

    return (
        <SectionCard>
            <SectionHeader>
                <SectionIcon $color="blue"><Layers size={16} /></SectionIcon>
                <SectionTitle>Framework Configuration</SectionTitle>
                {!isEditing && (
                    <SectionEditButton onClick={() => setIsEditing(true)} type="button">
                        <Pencil size={12} /> Edit
                    </SectionEditButton>
                )}
            </SectionHeader>

            <DetailRow>
                <DetailLabel>Framework</DetailLabel>
                <Badge $variant="default">{framework}</Badge>
            </DetailRow>

            {isEditing ? (
                schema ? (
                    <div style={{ marginTop: '16px' }}>
                        <DynamicForm
                            schema={schema}
                            rootSchema={rootSchema}
                            data={agentConfig}
                            onChange={setAgentConfig}
                            excludeFields={['name', 'checkpointer', 'session_service', 'memory_service', 'observability', 'a2a', 'store']}
                        />
                    </div>
                ) : (
                    <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '12px' }}>
                        Loading schema...
                    </div>
                )
            ) : (
                getKeyConfigValues().map((entry, i) => (
                    <DetailRow key={i}>
                        <DetailLabel>{entry.label}</DetailLabel>
                        <DetailValue style={{ fontFamily: 'monospace', fontSize: '12px', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.value}
                        </DetailValue>
                    </DetailRow>
                ))
            )}

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
