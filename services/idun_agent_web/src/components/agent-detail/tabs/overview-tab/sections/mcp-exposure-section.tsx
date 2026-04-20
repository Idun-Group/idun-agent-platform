import { Share2 } from 'lucide-react';
import styled from 'styled-components';
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
    EditableInput,
} from './styled';

interface McpExposureSectionProps {
    agent: BackendAgent;
    isEditing: boolean;
    formState: AgentFormState;
    onFieldChange: (field: keyof AgentFormState, value: string | boolean) => void;
}

export default function McpExposureSection({
    agent,
    isEditing,
    formState,
    onFieldChange,
}: McpExposureSectionProps) {
    const asMcp = isEditing
        ? formState.asMcp
        : (agent.engine_config?.server?.as_mcp ?? true);
    const description = isEditing
        ? formState.mcpDescription
        : (agent.engine_config?.server?.mcp_description || '');

    return (
        <SectionCard>
            <SectionHeader>
                <SectionIcon $color="green"><Share2 size={16} /></SectionIcon>
                <SectionTitle>Expose as MCP Server</SectionTitle>
            </SectionHeader>

            <DetailRow>
                <DetailLabel>Enabled</DetailLabel>
                {isEditing ? (
                    <Toggle
                        $on={formState.asMcp}
                        onClick={() => onFieldChange('asMcp', !formState.asMcp)}
                        type="button"
                        aria-pressed={formState.asMcp}
                    >
                        <ToggleKnob $on={formState.asMcp} />
                    </Toggle>
                ) : (
                    <DetailValue>{asMcp ? 'Yes' : 'No'}</DetailValue>
                )}
            </DetailRow>

            <DetailRow>
                <DetailLabel>Tool Description</DetailLabel>
                {isEditing ? (
                    <EditableInput
                        value={formState.mcpDescription}
                        onChange={e => onFieldChange('mcpDescription', e.target.value)}
                        placeholder={`Invoke the ${formState.name || 'agent'} agent`}
                        disabled={!formState.asMcp}
                    />
                ) : (
                    <DetailValue>{description || `Invoke the ${agent.name} agent`}</DetailValue>
                )}
            </DetailRow>

            {asMcp && agent.base_url && (
                <DetailRow>
                    <DetailLabel>MCP Endpoint</DetailLabel>
                    <DetailValue>{`${agent.base_url.replace(/\/$/, '')}/mcp/`}</DetailValue>
                </DetailRow>
            )}
        </SectionCard>
    );
}

const Toggle = styled.button<{ $on: boolean }>`
    width: 42px;
    height: 24px;
    border-radius: 999px;
    border: none;
    background: ${p => p.$on ? 'hsl(var(--primary))' : 'var(--overlay-medium)'};
    position: relative;
    cursor: pointer;
    transition: background 0.15s;
    padding: 0;
`;

const ToggleKnob = styled.span<{ $on: boolean }>`
    position: absolute;
    top: 2px;
    left: ${p => p.$on ? '20px' : '2px'};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    transition: left 0.15s;
`;
