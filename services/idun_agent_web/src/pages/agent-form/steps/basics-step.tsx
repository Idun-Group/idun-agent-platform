import styled from 'styled-components';
import { Check } from 'lucide-react';
import { AgentAvatar } from '../../../components/general/agent-avatar/component';
import type { Framework } from '../types';
<<<<<<< HEAD
import langGraphLogo from '../../../assets/langgraph-color.png';
import adkLogo from '../../../assets/agent-development-kit.png';
=======
>>>>>>> 85795ccd (Refactor agent creation API response and simplify agent form structure)

interface BasicsStepProps {
    name: string;
    framework: Framework | '';
    onNameChange: (name: string) => void;
    onFrameworkChange: (fw: Framework) => void;
}

<<<<<<< HEAD
const FRAMEWORKS: { id: Framework; label: string; description: string; logo: string }[] = [
=======
const FRAMEWORKS: { id: Framework; label: string; description: string }[] = [
>>>>>>> 85795ccd (Refactor agent creation API response and simplify agent form structure)
    {
        id: 'LANGGRAPH',
        label: 'LangGraph',
        description: 'Build stateful, multi-actor agents with LangGraph',
<<<<<<< HEAD
        logo: langGraphLogo,
=======
>>>>>>> 85795ccd (Refactor agent creation API response and simplify agent form structure)
    },
    {
        id: 'ADK',
        label: 'Google ADK',
        description: "Build agents with Google's Agent Development Kit",
<<<<<<< HEAD
        logo: adkLogo,
=======
>>>>>>> 85795ccd (Refactor agent creation API response and simplify agent form structure)
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
<<<<<<< HEAD
                                <FrameworkLogo src={fw.logo} alt={fw.label} />
=======
                                <CardLabel>{fw.label}</CardLabel>
>>>>>>> 85795ccd (Refactor agent creation API response and simplify agent form structure)
                                {framework === fw.id && (
                                    <CheckCircle>
                                        <Check size={12} color="white" />
                                    </CheckCircle>
                                )}
                            </CardTop>
<<<<<<< HEAD
                            <CardLabel>{fw.label}</CardLabel>
=======
>>>>>>> 85795ccd (Refactor agent creation API response and simplify agent form structure)
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
    color: white;
    margin: 0 0 4px;
`;

const Subtitle = styled.p`
    font-size: 14px;
    color: #9ca3af;
    margin: 0;
`;

const FieldGroup = styled.div`
    margin-bottom: 28px;
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
        background-color: rgba(140, 82, 255, 0.1);
        border-color: #8c52ff;
        box-shadow: 0 0 0 1px #8c52ff;
    ` : `
        background-color: #0B0A15;
        border-color: rgba(255, 255, 255, 0.1);

        &:hover {
            border-color: rgba(255, 255, 255, 0.2);
            background-color: rgba(255, 255, 255, 0.03);
        }
    `}
`;

const CardTop = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

<<<<<<< HEAD
const FrameworkLogo = styled.img`
    height: 28px;
    width: auto;
    object-fit: contain;
`;

=======
>>>>>>> 85795ccd (Refactor agent creation API response and simplify agent form structure)
const CardLabel = styled.span`
    font-size: 16px;
    font-weight: 600;
    color: white;
`;

const CheckCircle = styled.div`
    width: 20px;
    height: 20px;
    background-color: #8c52ff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const CardDescription = styled.span`
    font-size: 13px;
    color: #9ca3af;
    line-height: 1.4;
`;
