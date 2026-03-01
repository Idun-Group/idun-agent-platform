import { Layers } from 'lucide-react';
import { DynamicForm } from '../../../../general/dynamic-form/component';
import { FRAMEWORK_SCHEMA_MAP } from '../../../../../utils/agent-config-utils';
import type { BackendAgent } from '../../../../../services/agents';
import {
    SectionCard,
    SectionHeader,
    SectionTitle,
    SectionIcon,
    DetailRow,
    DetailLabel,
    DetailValue,
    Badge,
} from './styled';

interface FrameworkSectionProps {
    agent: BackendAgent;
    isEditing: boolean;
    agentConfig: Record<string, any>;
    rootSchema: any;
    onConfigChange: (newConfig: Record<string, any>) => void;
}

export default function FrameworkSection({ agent, isEditing, agentConfig, rootSchema, onConfigChange }: FrameworkSectionProps) {
    const framework = agent.framework || 'LANGGRAPH';

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

    const schema = getCurrentSchema();

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

    return (
        <SectionCard>
            <SectionHeader>
                <SectionIcon $color="blue"><Layers size={16} /></SectionIcon>
                <SectionTitle>Framework Configuration</SectionTitle>
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
                            onChange={onConfigChange}
                            excludeFields={['name', 'checkpointer', 'session_service', 'memory_service', 'observability', 'a2a']}
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
        </SectionCard>
    );
}
