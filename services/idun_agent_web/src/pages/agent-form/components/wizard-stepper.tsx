import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styled from 'styled-components';

interface Step {
    title: string;
    icon: LucideIcon;
}

interface WizardStepperProps {
    steps: Step[];
    currentStep: number;
}

export default function WizardStepper({ steps, currentStep }: WizardStepperProps) {
    return (
        <Container>
            <Inner>
                {steps.map((step, idx) => (
                    <StepItem key={step.title}>
                        <StepContent>
                            <StepCircle
                                $isActive={idx === currentStep}
                                $isCompleted={idx < currentStep}
                            >
                                {idx < currentStep
                                    ? <Check size={18} />
                                    : <step.icon size={18} />}
                            </StepCircle>
                            <StepInfo>
                                <StepTitle
                                    $isActive={idx === currentStep}
                                    $isCompleted={idx < currentStep}
                                >
                                    {step.title}
                                </StepTitle>
                                {idx === currentStep && (
                                    <InProgress>In Progress</InProgress>
                                )}
                            </StepInfo>
                        </StepContent>
                        {idx < steps.length - 1 && (
                            <SeparatorLine>
                                <Progress $isCompleted={idx < currentStep} />
                            </SeparatorLine>
                        )}
                    </StepItem>
                ))}
            </Inner>
        </Container>
    );
}

const Container = styled.div`
    background-color: #08070f;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding: 16px 32px;
`;

const Inner = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 768px;
    margin: 0 auto;
`;

const StepItem = styled.div`
    display: flex;
    align-items: center;
    flex: 1;
    &:last-child { flex: none; }
`;

const StepContent = styled.div`
    display: flex;
    align-items: center;
    position: relative;
`;

const StepCircle = styled.div<{ $isActive: boolean; $isCompleted: boolean }>`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid;
    transition: all 0.2s;
    z-index: 10;
    flex-shrink: 0;

    ${props => props.$isActive ? `
        background-color: #8c52ff;
        border-color: #8c52ff;
        color: white;
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.5);
    ` : props.$isCompleted ? `
        background-color: rgba(16, 185, 129, 0.2);
        border-color: #10b981;
        color: #34d399;
    ` : `
        background-color: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
        color: #6b7280;
    `}
`;

const StepInfo = styled.div`
    margin-left: 12px;
`;

const StepTitle = styled.p<{ $isActive: boolean; $isCompleted: boolean }>`
    font-size: 14px;
    font-weight: 700;
    color: ${props => (props.$isActive || props.$isCompleted) ? 'white' : '#6b7280'};
    margin: 0;
`;

const InProgress = styled.p`
    font-size: 10px;
    color: #8c52ff;
    margin: 0;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .5; }
    }
`;

const SeparatorLine = styled.div`
    flex: 1;
    height: 2px;
    margin: 0 16px;
    background-color: rgba(255, 255, 255, 0.1);
    position: relative;
`;

const Progress = styled.div<{ $isCompleted: boolean }>`
    position: absolute;
    inset: 0;
    background-color: #10b981;
    width: ${props => props.$isCompleted ? '100%' : '0%'};
    transition: width 0.5s;
`;
