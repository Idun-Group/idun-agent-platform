import styled from 'styled-components';
import { Monitor, Globe, ChevronUp, ChevronDown } from 'lucide-react';
import { useRef, useCallback } from 'react';
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
                    <PortField
                        port={serverPort}
                        onChange={value => onFieldChange('serverPort', value)}
                    />
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

function PortField({ port, onChange }: { port: string; onChange: (v: string) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);

    const clamp = useCallback((n: number) => Math.max(1, Math.min(65535, n)), []);

    const step = useCallback((delta: number) => {
        const current = parseInt(port, 10) || 8800;
        onChange(String(clamp(current + delta)));
    }, [port, onChange, clamp]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.currentTarget.blur();
        e.preventDefault();
    }, []);

    return (
        <FieldGroup>
            <InputLabel>Server Port</InputLabel>
            <PortInputRow>
                <PortPrefix>http://localhost:</PortPrefix>
                <PortInput
                    ref={inputRef}
                    type="number"
                    placeholder="8800"
                    value={port}
                    onChange={e => onChange(e.target.value)}
                    onWheel={handleWheel}
                    min="1"
                    max="65535"
                />
                <PortSteppers>
                    <PortStepBtn type="button" onClick={() => step(1)} aria-label="Increase port">
                        <ChevronUp size={12} />
                    </PortStepBtn>
                    <PortStepBtn type="button" onClick={() => step(-1)} aria-label="Decrease port">
                        <ChevronDown size={12} />
                    </PortStepBtn>
                </PortSteppers>
            </PortInputRow>
            <Hint>Your agent will be accessible at http://localhost:{port || '8800'}</Hint>
        </FieldGroup>
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
    color: hsl(var(--foreground));
    margin: 0 0 4px;
`;

const Subtitle = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
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
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    margin-bottom: 8px;
`;

const Required = styled.span`
    color: hsl(var(--destructive));
    margin-left: 4px;
`;

const StyledInput = styled.input`
    width: 100%;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 14px;
    color: hsl(var(--foreground));
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;

    &:focus {
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 1px hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--text-tertiary));
    }
`;

const Hint = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 6px 0 0;
`;

const ToggleRow = styled.div`
    display: flex;
    gap: 0;
    border: 1px solid var(--border-light);
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
        background-color: hsl(var(--primary) / 0.15);
        color: hsl(var(--foreground));
        box-shadow: inset 0 0 0 1px hsl(var(--primary));
    ` : `
        background-color: hsl(var(--accent));
        color: hsl(var(--muted-foreground));

        &:hover {
            color: hsl(var(--text-secondary));
            background-color: var(--overlay-subtle);
        }
    `}
`;

const PortInputRow = styled.div`
    display: flex;
    align-items: center;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;

    &:focus-within {
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 1px hsl(var(--primary));
    }
`;

const PortPrefix = styled.span`
    padding: 12px 0 12px 16px;
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    user-select: none;
`;

const PortInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    padding: 12px 16px 12px 0;
    font-size: 14px;
    color: hsl(var(--foreground));
    outline: none;
    width: 80px;

    /* Hide native number spinners */
    -moz-appearance: textfield;
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    &::placeholder {
        color: hsl(var(--text-tertiary));
    }
`;

const PortSteppers = styled.div`
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border-light);
`;

const PortStepBtn = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 20px;
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0;
    transition: all 0.15s;

    &:first-child {
        border-bottom: 1px solid var(--border-light);
    }

    &:hover {
        background: rgba(140, 82, 255, 0.15);
        color: #a78bfa;
    }

    &:active {
        background: rgba(140, 82, 255, 0.25);
    }
`;
