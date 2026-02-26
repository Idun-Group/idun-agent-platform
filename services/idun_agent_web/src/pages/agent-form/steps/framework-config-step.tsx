import styled from 'styled-components';
import { Monitor, Globe } from 'lucide-react';
import type { Framework, HostMode } from '../types';
import FrameworkGuide from '../components/framework-guide';

interface FrameworkConfigStepProps {
    framework: Framework;
    graphDefinition: string;
    adkAgent: string;
    adkAppName: string;
    hostMode: HostMode;
    serverPort: string;
    remoteUrl: string;
    onFieldChange: (field: string, value: string) => void;
}

export default function FrameworkConfigStep({
    framework,
    graphDefinition,
    adkAgent,
    adkAppName,
    hostMode,
    serverPort,
    remoteUrl,
    onFieldChange,
}: FrameworkConfigStepProps) {
    return (
        <StepContainer>
            <Title>Configure your {framework === 'LANGGRAPH' ? 'LangGraph' : 'ADK'} agent</Title>
            <Subtitle>Provide the required configuration for your framework</Subtitle>

            <FormSection>
                {framework === 'LANGGRAPH' && (
                    <FieldGroup>
                        <InputLabel>Graph Definition<Required>*</Required></InputLabel>
                        <StyledInput
                            placeholder="./agent/graph.py:graph"
                            value={graphDefinition}
                            onChange={e => onFieldChange('graphDefinition', e.target.value)}
                            autoFocus
                        />
                        <Hint>Path to your graph file and compiled graph attribute (e.g. ./agent/graph.py:graph)</Hint>
                    </FieldGroup>
                )}

                {framework === 'ADK' && (
                    <>
                        <FieldGroup>
                            <InputLabel>Agent Definition Path<Required>*</Required></InputLabel>
                            <StyledInput
                                placeholder="./agent/agent.py:root_agent"
                                value={adkAgent}
                                onChange={e => onFieldChange('adkAgent', e.target.value)}
                                autoFocus
                            />
                            <Hint>Path to your agent file and root agent attribute (e.g. ./agent/agent.py:root_agent)</Hint>
                        </FieldGroup>
                        <FieldGroup>
                            <InputLabel>Application Name<Required>*</Required></InputLabel>
                            <StyledInput
                                placeholder="my_adk_app"
                                value={adkAppName}
                                onChange={e => onFieldChange('adkAppName', e.target.value)}
                            />
                        </FieldGroup>
                    </>
                )}

                <FieldGroup>
                    <InputLabel>Agent Host</InputLabel>
                    <ToggleRow>
                        <ToggleOption
                            $isSelected={hostMode === 'localhost'}
                            onClick={() => onFieldChange('hostMode', 'localhost')}
                            type="button"
                        >
                            <Monitor size={14} />
                            Localhost
                        </ToggleOption>
                        <ToggleOption
                            $isSelected={hostMode === 'remote'}
                            onClick={() => onFieldChange('hostMode', 'remote')}
                            type="button"
                        >
                            <Globe size={14} />
                            Remote
                        </ToggleOption>
                    </ToggleRow>
                </FieldGroup>

                {hostMode === 'localhost' && (
                    <FieldGroup>
                        <InputLabel>Server Port</InputLabel>
                        <PortInputRow>
                            <PortPrefix>http://localhost:</PortPrefix>
                            <PortInput
                                type="number"
                                placeholder="8800"
                                value={serverPort}
                                onChange={e => onFieldChange('serverPort', e.target.value)}
                                min="1"
                                max="65535"
                            />
                        </PortInputRow>
                        <Hint>Your agent will be accessible at http://localhost:{serverPort || '8800'}</Hint>
                    </FieldGroup>
                )}

                {hostMode === 'remote' && (
                    <FieldGroup>
                        <InputLabel>Remote URL<Required>*</Required></InputLabel>
                        <StyledInput
                            placeholder="https://my-agent.example.com"
                            value={remoteUrl}
                            onChange={e => onFieldChange('remoteUrl', e.target.value)}
                        />
                        <Hint>The public URL where your agent is deployed (e.g. https://my-agent.example.com)</Hint>
                    </FieldGroup>
                )}
            </FormSection>

            <FrameworkGuide framework={framework} />
        </StepContainer>
    );
}

const StepContainer = styled.div`
    animation: fadeIn 0.3s ease-in-out;
    max-width: 560px;
    margin: 0 auto;

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;

const Title = styled.h2`
    font-size: 22px;
    font-weight: 700;
    color: white;
    margin: 0 0 4px;
`;

const Subtitle = styled.p`
    font-size: 14px;
    color: #9ca3af;
    margin: 0 0 32px;
`;

const FormSection = styled.div`
    margin-bottom: 24px;
`;

const FieldGroup = styled.div`
    margin-bottom: 24px;
`;

const InputLabel = styled.label`
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #9ca3af;
    text-transform: uppercase;
    margin-bottom: 8px;
`;

const Required = styled.span`
    color: #ef4444;
    margin-left: 4px;
`;

const StyledInput = styled.input`
    width: 100%;
    background-color: #0B0A15;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 14px;
    color: white;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;

    &:focus {
        border-color: #8c52ff;
        box-shadow: 0 0 0 1px #8c52ff;
    }

    &::placeholder {
        color: #374151;
    }
`;

const Hint = styled.p`
    font-size: 12px;
    color: #6b7280;
    margin: 6px 0 0;
`;

const ToggleRow = styled.div`
    display: flex;
    gap: 0;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    overflow: hidden;
    width: fit-content;
`;

const ToggleOption = styled.button<{ $isSelected: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all 0.2s;

    ${props => props.$isSelected ? `
        background-color: rgba(140, 82, 255, 0.15);
        color: white;
        box-shadow: inset 0 0 0 1px #8c52ff;
    ` : `
        background-color: #0B0A15;
        color: #6b7280;

        &:hover {
            color: #9ca3af;
            background-color: rgba(255, 255, 255, 0.03);
        }
    `}
`;

const PortInputRow = styled.div`
    display: flex;
    align-items: center;
    background-color: #0B0A15;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;

    &:focus-within {
        border-color: #8c52ff;
        box-shadow: 0 0 0 1px #8c52ff;
    }
`;

const PortPrefix = styled.span`
    padding: 12px 0 12px 16px;
    font-size: 14px;
    color: #6b7280;
    white-space: nowrap;
    user-select: none;
`;

const PortInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    padding: 12px 16px 12px 0;
    font-size: 14px;
    color: white;
    outline: none;
    width: 80px;

    /* Hide number spinners */
    -moz-appearance: textfield;
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    &::placeholder {
        color: #374151;
    }
`;
