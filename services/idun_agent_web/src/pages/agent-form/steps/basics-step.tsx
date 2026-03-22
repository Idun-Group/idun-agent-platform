import styled from 'styled-components';
import { Check } from 'lucide-react';
import { AgentAvatar } from '../../../components/general/agent-avatar/component';
import type { Framework } from '../types';
import langGraphLogo from '../../../assets/langgraph-color.png';
import adkLogo from '../../../assets/agent-development-kit.png';

interface BasicsStepProps {
    name: string;
    framework: Framework | '';
    onNameChange: (name: string) => void;
    onFrameworkChange: (fw: Framework) => void;
}

const FRAMEWORKS: { id: Framework; label: string; description: string; logo: string }[] = [
    {
        id: 'LANGGRAPH',
        label: 'LangGraph',
        description: 'Build stateful, multi-actor agents with LangGraph',
        logo: langGraphLogo,
    },
    {
        id: 'ADK',
        label: 'Google ADK',
        description: "Build agents with Google's Agent Development Kit",
        logo: adkLogo,
    },
];

export default function BasicsStep({
    name,
    framework,
    onNameChange,
    onFrameworkChange,
}: BasicsStepProps) {
    return (
        <StepContainer>
            <Header>
                <AvatarWrapper>
                    <AgentAvatar name={name || 'New Agent'} size={64} />
                </AvatarWrapper>
                <div>
                    <Title>Name your agent</Title>
                    <Subtitle>Choose a name and select your agent framework</Subtitle>
                </div>
            </Header>

            <FieldGroup>
                <InputLabel>Agent Name<Required>*</Required></InputLabel>
                <StyledInput
                    placeholder="My first agent"
                    value={name}
                    onChange={e => onNameChange(e.target.value)}
                    autoFocus
                />
            </FieldGroup>

            <FieldGroup>
                <InputLabel>Agent Framework<Required>*</Required></InputLabel>
                <FrameworkGrid>
                    {FRAMEWORKS.map(fw => (
                        <FrameworkCard
                            key={fw.id}
                            $isSelected={framework === fw.id}
                            onClick={() => onFrameworkChange(fw.id)}
                            type="button"
                        >
                            <CardTop>
                                <FrameworkLogo src={fw.logo} alt={fw.label} />
                                {framework === fw.id && (
                                    <CheckCircle>
                                        <Check size={12} color="white" />
                                    </CheckCircle>
                                )}
                            </CardTop>
                            <CardLabel>{fw.label}</CardLabel>
                            <CardDescription>{fw.description}</CardDescription>
                        </FrameworkCard>
                    ))}
                </FrameworkGrid>
            </FieldGroup>
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

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 36px;
`;

const AvatarWrapper = styled.div`
    flex-shrink: 0;
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
    margin: 0;
`;

const FieldGroup = styled.div`
    margin-bottom: 28px;
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

const FrameworkGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
`;

const FrameworkCard = styled.button<{ $isSelected: boolean }>`
    text-align: left;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    gap: 8px;

    ${props => props.$isSelected ? `
        background-color: hsl(var(--primary) / 0.1);
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 1px hsl(var(--primary));
    ` : `
        background-color: hsl(var(--accent));
        border-color: var(--border-light);

        &:hover {
            border-color: var(--overlay-strong);
            background-color: var(--overlay-subtle);
        }
    `}
`;

const CardTop = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

const FrameworkLogo = styled.img`
    height: 28px;
    width: auto;
    object-fit: contain;
`;

const CardLabel = styled.span`
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const CheckCircle = styled.div`
    width: 20px;
    height: 20px;
    background-color: hsl(var(--primary));
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const CardDescription = styled.span`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    line-height: 1.4;
`;
