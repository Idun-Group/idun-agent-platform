import { Check, Box, Settings, Rocket, Code2, Shield, ChevronRight, ChevronLeft, Activity, Upload, Server, Layers, X, Database, Info, Eye, Plus, Zap, KeyRound, Plug } from 'lucide-react';
import { type ChangeEvent, useEffect, useState, useRef } from 'react';
import { useCallback } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { AgentAvatar } from '../../components/general/agent-avatar/component';
import { DynamicForm } from '../../components/general/dynamic-form/component';
import { API_BASE_URL } from '../../utils/api';
import { fetchApplications, MARKETPLACE_APPS, mapConfigToApi } from '../../services/applications';
import type { ApplicationConfig, AppType, MarketplaceApp, AppCategory } from '../../types/application.types';
import ApplicationModal from '../../components/applications/application-modal/component';
import { fetchSSOs } from '../../services/sso';
import type { ManagedSSO } from '../../services/sso';
import { fetchIntegrations } from '../../services/integrations';
import type { ManagedIntegration } from '../../services/integrations';
import { notify } from '../../components/toast/notify';
import WizardStepper from './components/wizard-stepper';
import BasicsStep from './steps/basics-step';
import FrameworkConfigStep from './steps/framework-config-step';
import EnrollmentStep from './steps/enrollment-step';
import { INITIAL_WIZARD_STATE } from './types';
import type { Framework, WizardState } from './types';

const STEPS = [
    { title: 'Basics', icon: Box },
    { title: 'Framework Config', icon: Settings },
    { title: 'Enrollment', icon: Rocket },
];

export default function AgentFormPage() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(0);
    const [state, setState] = useState<WizardState>(INITIAL_WIZARD_STATE);

    const toSnakeCase = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const updateField = useCallback((field: string, value: string) => {
        setState(prev => {
            const next = { ...prev, [field]: value };
            // Auto-derive adkAppName from agent name
            if (field === 'name') {
                next.adkAppName = toSnakeCase(value);
            }
            return next;
        });
    }, []);

    const canGoNext = (): boolean => {
        if (currentStep === 0) {
            return state.name.trim() !== '' && state.framework !== '';
        }
        if (currentStep === 1) {
            const frameworkValid = state.framework === 'LANGGRAPH'
                ? state.graphDefinition.trim() !== ''
                : state.adkAgent.trim() !== '' && state.adkAppName.trim() !== '';
            const hostValid = state.hostMode === 'remote'
                ? state.remoteUrl.trim() !== ''
                : true;
            return frameworkValid && hostValid;
        }
        return false;
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1 && canGoNext()) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleCreated = useCallback((agentId: string, apiKey: string) => {
        setState(prev => ({ ...prev, createdAgentId: agentId, apiKey }));
    }, []);

    const handleFinalize = () => {
        if (state.createdAgentId) {
            notify.success('Agent ready! You can now configure additional features.');
            navigate(`/agents/${state.createdAgentId}`);
        }
    };

    return (
        <PageContainer>
            <Backdrop onClick={() => !state.createdAgentId && navigate('/agents')} />
            <ModalWindow>
                <ModalHeader>
                    <div>
                        <ModalTitle>Create a new agent</ModalTitle>
                        <ModalSubtitle>Step {currentStep + 1} of {STEPS.length}</ModalSubtitle>
                    </div>
                    <CloseButton onClick={() => navigate('/agents')} type="button">
                        <X size={24} />
                    </CloseButton>
                </ModalHeader>

                <WizardStepper steps={STEPS} currentStep={currentStep} />

                <ModalBody>
                    {currentStep === 0 && (
                        <BasicsStep
                            name={state.name}
                            framework={state.framework}
                            onNameChange={v => updateField('name', v)}
                            onFrameworkChange={(fw: Framework) => updateField('framework', fw)}
                        />
                    )}
                    {currentStep === 1 && state.framework && (
                        <FrameworkConfigStep
                            framework={state.framework as Framework}
                            graphDefinition={state.graphDefinition}
                            adkAgent={state.adkAgent}
                            adkAppName={state.adkAppName}
                            hostMode={state.hostMode}
                            serverPort={state.serverPort}
                            remoteUrl={state.remoteUrl}
                            onFieldChange={updateField}
                        />
                    )}
                    {currentStep === 2 && (
                        <EnrollmentStep
                            state={state}
                            onCreated={handleCreated}
                        />
                    )}
                </ModalBody>

                <ModalFooter>
                    <div>
                        {currentStep === 0 && (
                            <CancelButton onClick={() => navigate('/agents')} type="button">
                                Cancel
                            </CancelButton>
                        )}
                        {currentStep > 0 && (
                            <BackButton onClick={handleBack} type="button">
                                <ChevronLeft size={16} /> Back
                            </BackButton>
                        )}
                    </div>
                    <div>
                        {currentStep < 2 && (
                            <NextButton onClick={handleNext} disabled={!canGoNext()} type="button">
                                Next <ChevronRight size={16} />
                            </NextButton>
                        )}
                        {currentStep === 2 && state.createdAgentId && (
                            <FinalizeButton onClick={handleFinalize} type="button">
                                Go to Agent <ChevronRight size={16} />
                            </FinalizeButton>
                        )}
                    </div>
                </ModalFooter>
            </ModalWindow>
        </PageContainer>
    );
}

const PageContainer = styled.div`
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
`;

const Backdrop = styled.div`
    position: absolute;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
`;

const ModalWindow = styled.div`
    position: relative;
    width: 100%;
    max-width: 800px;
    background-color: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    overflow: hidden;
`;

const ModalHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 32px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    background-color: rgba(12, 92, 171, 0.1);
`;

const ModalTitle = styled.h2`
    font-size: 24px;
    font-weight: 700;
    color: #e1e4e8;
    margin: 0;
`;

const ModalSubtitle = styled.p`
    font-size: 14px;
    color: #8899a6;
    margin-top: 4px;
`;

const CloseButton = styled.button`
    padding: 8px;
    color: #8899a6;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s;

    &:hover {
        color: #e1e4e8;
        background-color: rgba(255, 255, 255, 0.04);
    }
`;

const ModalBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 32px;
    background-color: #0a0e17;
`;

const ModalFooter = styled.div`
    padding: 20px 32px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    background-color: rgba(12, 92, 171, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const CancelButton = styled.button`
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    color: #8899a6;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
        color: #e1e4e8;
        background-color: rgba(255, 255, 255, 0.04);
    }
`;

const BackButton = styled.button`
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    color: #8899a6;
    background-color: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s;

    &:hover {
        color: #e1e4e8;
        background-color: rgba(255, 255, 255, 0.08);
    }
`;

const NextButton = styled.button`
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    background-color: #0C5CAB;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 10px 15px -3px rgba(12, 92, 171, 0.2);
    transition: all 0.2s;

    &:hover:not(:disabled) {
        background-color: rgba(12, 92, 171, 0.85);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const FinalizeButton = styled.button`
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    background-color: #34d399;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.2);
    transition: all 0.2s;

    &:hover {
        background-color: #059669;
    }
`;
