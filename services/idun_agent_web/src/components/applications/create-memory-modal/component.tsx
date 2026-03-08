import React, { useState, useEffect, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import {
    X,
    Database,
    Layers,
    Search,
    Globe,
    Cpu,
    ArrowRight,
    Loader2
} from 'lucide-react';
import { Button } from '../../general/button/component';
import type { ApplicationConfig, AppType } from '../../../types/application.types';
import { createApplication, updateApplication } from '../../../services/applications';
import { useProject } from '../../../hooks/use-project';

// Types for the internal form state
interface MemoryFormData {
    name: string;
    provider: string;
    connectionUrl: string;
    description: string;
    projectId?: string; // For Vertex
    location?: string; // For Vertex
    reasoningEngineAppName?: string; // For Vertex
}

interface CreateMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  appToEdit?: ApplicationConfig | null;
  initialFramework?: string;
}

const FRAMEWORKS_LIST = [
    {
        id: 'LANGGRAPH',
        name: 'LangGraph',
        icon: Layers,
        color: 'indigo',
        description: 'Graph-based agent orchestration framework.'
    },
    {
        id: 'ADK',
        name: 'ADK',
        icon: Cpu,
        color: 'blue',
        description: 'Agent Development Kit for enterprise solutions.'
    }
    // HayStack is not currently supported in types
];

const DB_PROVIDERS = [
    { id: 'AdkInMemory', name: 'In Memory', frameworks: ['ADK'] },
    { id: 'SQLite', name: 'SQLite', frameworks: ['LANGGRAPH'] },
    { id: 'PostgreSQL', name: 'PostgreSQL', frameworks: ['LANGGRAPH'] },
    { id: 'AdkVertexAi', name: 'Vertex AI', frameworks: ['ADK'] },
    { id: 'AdkDatabase', name: 'Database', frameworks: ['ADK'] }
];

export const CreateMemoryModal: React.FC<CreateMemoryModalProps> = ({ isOpen, onClose, onSaved, appToEdit, initialFramework }) => {
  const { selectedProjectId } = useProject();
  const isEditMode = !!appToEdit;
  const [selectedFramework, setSelectedFramework] = useState<string>('LANGGRAPH');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState<MemoryFormData>({
      name: '',
      provider: '', // Will be set based on framework
      connectionUrl: '',
      description: '',
      projectId: '',
      location: '',
      reasoningEngineAppName: ''
  });

  // Reset / pre-fill form when opening
  useEffect(() => {
    if (isOpen) {
        setIsSubmitting(false);
        setProgress(0);
        setErrorMessage(null);

        if (appToEdit) {
            const fw = appToEdit.framework || 'LANGGRAPH';
            setSelectedFramework(fw);
            const cfg = (appToEdit.config ?? {}) as Record<string, any>;
            setFormData({
                name: appToEdit.name ?? '',
                provider: appToEdit.type ?? '',
                connectionUrl: cfg.connectionString ?? cfg.db_url ?? '',
                description: '',
                projectId: cfg.project_id ?? cfg.projectId ?? '',
                location: cfg.location ?? '',
                reasoningEngineAppName: cfg.reasoning_engine_app_name ?? cfg.reasoningEngineAppName ?? '',
            });
        } else {
            const initialFw = initialFramework || 'LANGGRAPH';
            const defaultProvider = DB_PROVIDERS.find(p => p.frameworks.includes(initialFw))?.id || '';
            setFormData({
                name: '',
                provider: defaultProvider,
                connectionUrl: '',
                description: '',
                projectId: '',
                location: '',
                reasoningEngineAppName: ''
            });
            setSelectedFramework(initialFw);
        }
    }
    return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, appToEdit, initialFramework]);

  // Update provider when framework changes if current provider is not valid
  useEffect(() => {
      const validProviders = DB_PROVIDERS.filter(p => p.frameworks.includes(selectedFramework));
      if (!validProviders.find(p => p.id === formData.provider)) {
          setFormData(prev => ({ ...prev, provider: validProviders[0]?.id || '' }));
      }
  }, [selectedFramework]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    // Simulate high-tech loading sequence
    let currentProgress = 0;
    setLoadingText('Provisioning storage container...');

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
        currentProgress += Math.random() * 15;
        if (currentProgress > 90) currentProgress = 90; // Hold at 90 until complete
        setProgress(currentProgress);

        if (currentProgress > 30 && currentProgress < 60) setLoadingText('Allocating vector indices...');
        if (currentProgress > 60 && currentProgress < 90) setLoadingText('Establishing connection...');
    }, 250);

    try {
        let config: any = {};
        if (formData.provider === 'PostgreSQL' || formData.provider === 'SQLite' || formData.provider === 'AdkDatabase') {
            config.connectionString = formData.connectionUrl;
        } else if (formData.provider === 'AdkVertexAi') {
            config.project_id = formData.projectId;
            config.location = formData.location;
            config.reasoning_engine_app_name = formData.reasoningEngineAppName;
        }

        setLoadingText('Verifying schema integrity...');
        setProgress(95);

        if (isEditMode && appToEdit?.id && selectedProjectId) {
            await updateApplication(selectedProjectId, appToEdit.id, {
                name: formData.name,
                type: formData.provider as any,
                category: 'Memory',
                config,
                framework: selectedFramework,
            });
        } else if (selectedProjectId) {
            await createApplication(selectedProjectId, {
                name: formData.name,
                type: formData.provider as any,
                category: 'Memory',
                config,
                framework: selectedFramework,
            });
        }

        if (intervalRef.current) clearInterval(intervalRef.current);
        setProgress(100);
        onSaved();
        onClose();
    } catch (error: any) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsSubmitting(false);
        setProgress(0);

        let msg = error.message || 'An unknown error occurred';
        try {
            const errObj = JSON.parse(msg);
            if (errObj.detail && Array.isArray(errObj.detail)) {
                 msg = errObj.detail.map((e: any) => e.msg).join('\n');
            } else if (errObj.detail) {
                 msg = String(errObj.detail);
            }
        } catch (e) {
            // use original message
        }
        setErrorMessage(msg);
    }
  };

  const currentFramework = FRAMEWORKS_LIST.find(p => p.id === selectedFramework);
  const availableProviders = DB_PROVIDERS.filter(p => p.frameworks.includes(selectedFramework));

  const isValid = () => {
      if (!formData.name) return false;
      if (formData.provider === 'PostgreSQL' || formData.provider === 'SQLite' || formData.provider === 'AdkDatabase') {
          return !!formData.connectionUrl;
      }
      if (formData.provider === 'AdkVertexAi') {
          return !!(formData.projectId && formData.location && formData.reasoningEngineAppName);
      }
      return true;
  };

  return (
    <Overlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>

        {/* Loading Overlay */}
        {isSubmitting && (
            <LoadingOverlay>
                <LoadingContent>
                    <LoaderWrapper>
                        <PingCircle />
                        <SpinCircle />
                        <DatabaseIcon size={24} />
                    </LoaderWrapper>
                    <div>
                        <LoadingTitle>DEPLOYING STORE</LoadingTitle>
                        <LoadingText>{loadingText}</LoadingText>
                    </div>
                    <ProgressBarContainer>
                        <ProgressBar width={progress} />
                    </ProgressBarContainer>
                </LoadingContent>
            </LoadingOverlay>
        )}

        {/* Header */}
        <Header>
          <div>
            <Title>{isEditMode ? 'Edit Memory Store' : 'Create Memory Store'}</Title>
            <Subtitle>{isEditMode ? 'Update the configuration for this store.' : 'Configure a new state persistence layer.'}</Subtitle>
          </div>
          <CloseButton onClick={onClose}>
            <X size={20} />
          </CloseButton>
        </Header>

        <ContentWrapper>
            {/* Sidebar: Framework Selection */}
            <Sidebar>
                <SidebarTitle>Select Framework</SidebarTitle>
                <FrameworkList>
                    {FRAMEWORKS_LIST.map(fw => {
                        const Icon = fw.icon;
                        const isSelected = selectedFramework === fw.id;
                        return (
                            <FrameworkButton
                                key={fw.id}
                                onClick={() => setSelectedFramework(fw.id)}
                                isSelected={isSelected}
                                color={fw.color}
                            >
                                <IconWrapper isSelected={isSelected} color={fw.color}>
                                    <Icon size={18} />
                                </IconWrapper>
                                <div>
                                    <FrameworkName>{fw.name}</FrameworkName>
                                    <FrameworkDesc>{fw.description}</FrameworkDesc>
                                </div>
                                {isSelected && <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'hsl(var(--primary))' }} />}
                            </FrameworkButton>
                        );
                    })}
                </FrameworkList>
            </Sidebar>

            {/* Main Content: Form */}
            <FormSection>
                <FormBackground />
                <Form onSubmit={handleSubmit}>

                    {/* Selected Framework Banner */}
                    <FrameworkBanner color={currentFramework?.color}>
                        <BannerIcon color={currentFramework?.color}>
                            {currentFramework && <currentFramework.icon size={28} />}
                        </BannerIcon>
                        <div>
                            <BannerTitle>{currentFramework?.name} Store</BannerTitle>
                            <BannerSubtitle>Configure storage for {currentFramework?.name} agents.</BannerSubtitle>
                        </div>
                    </FrameworkBanner>

                    <Grid2Cols>
                        <div>
                            <Label>Store Name</Label>
                            <Input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                placeholder="e.g. Production State"
                            />
                        </div>

                        <div>
                            <Label>Database Provider</Label>
                            <SelectWrapper>
                                <Database className="icon" size={16} />
                                <Select
                                    value={formData.provider}
                                    onChange={e => setFormData({...formData, provider: e.target.value})}
                                >
                                    {availableProviders.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </Select>
                            </SelectWrapper>
                        </div>
                    </Grid2Cols>

                    <div>
                        <Label>Description (Optional)</Label>
                        <TextArea
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            placeholder="Briefly describe the contents of this store..."
                            rows={2}
                        />
                    </div>

                    <SectionDivider>
                        <span className="marker"></span> Connection Details
                    </SectionDivider>

                    {(formData.provider === 'PostgreSQL' || formData.provider === 'SQLite' || formData.provider === 'AdkDatabase') && (
                        <div>
                            <Label>Connection URL / Host</Label>
                            <InputWrapper>
                                <Globe className="icon" size={16} />
                                <Input
                                    type="text"
                                    required
                                    value={formData.connectionUrl}
                                    onChange={e => setFormData({...formData, connectionUrl: e.target.value})}
                                    placeholder={formData.provider === 'SQLite' ? 'sqlite:///./data.db' : 'postgres://user:pass@localhost:5432/...'}
                                    className="has-icon"
                                />
                            </InputWrapper>
                        </div>
                    )}

                    {formData.provider === 'AdkVertexAi' && (
                        <>
                             <div>
                                <Label>Project ID</Label>
                                <Input
                                    type="text"
                                    required
                                    value={formData.projectId}
                                    onChange={e => setFormData({...formData, projectId: e.target.value})}
                                />
                            </div>
                             <Grid2Cols>
                                <div>
                                    <Label>Location</Label>
                                    <Input
                                        type="text"
                                        required
                                        value={formData.location}
                                        onChange={e => setFormData({...formData, location: e.target.value})}
                                        placeholder="us-central1"
                                    />
                                </div>
                                <div>
                                    <Label>Reasoning Engine App Name</Label>
                                    <Input
                                        type="text"
                                        required
                                        value={formData.reasoningEngineAppName}
                                        onChange={e => setFormData({...formData, reasoningEngineAppName: e.target.value})}
                                    />
                                </div>
                             </Grid2Cols>
                        </>
                    )}

                    {formData.provider === 'AdkInMemory' && (
                        <InfoText>No additional configuration required for In-Memory storage.</InfoText>
                    )}

                    <Footer>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <CancelButton
                                    type="button"
                                    onClick={onClose}
                                >
                                    Cancel
                                </CancelButton>
                                <SubmitButton
                                    type="submit"
                                    disabled={!isValid()}
                                >
                                    {isEditMode ? 'Save Changes' : 'Create Store'}
                                </SubmitButton>
                            </div>
                            {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
                        </div>
                    </Footer>
                </Form>
            </FormSection>
        </ContentWrapper>
      </ModalContainer>
    </Overlay>
  );
};

// Styled Components
const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background-color: var(--overlay-backdrop);
    backdrop-filter: blur(4px);
`;

const ModalContainer = styled.div`
    position: relative;
    width: 100%;
    max-width: 56rem;
    background-color: hsl(var(--card));
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-height: 90vh;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-subtle);
    background-color: hsl(var(--accent));
`;

const Title = styled.h2`
    font-size: 1.25rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
`;

const Subtitle = styled.p`
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const CloseButton = styled.button`
    padding: 0.5rem;
    color: hsl(var(--muted-foreground));
    border-radius: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.2s, background-color 0.2s;

    &:hover {
        color: hsl(var(--foreground));
        background-color: var(--overlay-light);
    }
`;

const ContentWrapper = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;

    @media (min-width: 768px) {
        flex-direction: row;
    }
`;

const Sidebar = styled.div`
    width: 100%;
    background-color: hsl(var(--accent));
    border-right: 1px solid var(--border-subtle);
    padding: 1rem;
    overflow-y: auto;

    @media (min-width: 768px) {
        width: 33.333333%;
    }
`;

const SidebarTitle = styled.h3`
    font-size: 0.75rem;
    font-weight: 700;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
    padding-left: 0.5rem;
`;

const FrameworkList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const FrameworkButton = styled.button<{ isSelected: boolean; color: string }>`
    width: 100%;
    display: flex;
    align-items: center;
    padding: 0.75rem;
    border-radius: 0.5rem;
    transition: all 0.2s;
    border: 1px solid transparent;
    text-align: left;
    background: transparent;
    cursor: pointer;
    color: hsl(var(--muted-foreground));

    &:hover {
        background-color: var(--overlay-light);
    }

    ${props => props.isSelected && css`
        background-color: rgba(139, 92, 246, 0.1);
        border-color: rgba(139, 92, 246, 0.5);
        color: hsl(var(--foreground));
        box-shadow: 0 0 10px rgba(0,0,0,0.2);
    `}
`;

const IconWrapper = styled.div<{ isSelected: boolean; color: string }>`
    padding: 0.625rem;
    border-radius: 0.5rem;
    margin-right: 0.75rem;
    flex-shrink: 0;
    transition: color 0.2s, background-color 0.2s;
    background-color: var(--overlay-light);
    color: hsl(var(--muted-foreground));

    ${props => props.isSelected && css`
        background-color: hsl(var(--primary));
        color: hsl(var(--primary-foreground));
    `}
`;

const FrameworkName = styled.span`
    font-weight: 700;
    font-size: 0.875rem;
    display: block;
`;

const FrameworkDesc = styled.span`
    font-size: 0.625rem;
    opacity: 0.7;
    display: block;
    line-height: 1.25;
    margin-top: 0.25rem;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

const FormSection = styled.div`
    flex: 1;
    padding: 2rem;
    background-color: hsl(var(--surface-elevated));
    overflow-y: auto;
    position: relative;
`;

const FormBackground = styled.div`
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.02;
    background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0);
    background-size: 24px 24px;
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 42rem;
    margin: 0 auto;
    position: relative;
    z-index: 10;
`;

const FrameworkBanner = styled.div<{ color?: string }>`
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 1.25rem;
    background-color: var(--overlay-light);
    border-radius: 0.75rem;
    border: 1px solid var(--border-subtle);
    box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);
`;

const BannerIcon = styled.div<{ color?: string }>`
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(139, 92, 246, 0.2);
    color: #a78bfa;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
`;

const BannerTitle = styled.h3`
    font-size: 1.125rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
`;

const BannerSubtitle = styled.p`
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    margin: 0.25rem 0 0 0;
`;

const Grid2Cols = styled.div`
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;

    @media (min-width: 768px) {
        grid-template-columns: 1fr 1fr;
    }
`;

const Label = styled.label`
    display: block;
    font-size: 0.75rem;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    margin-bottom: 0.5rem;
`;

const Input = styled.input`
    width: 100%;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    outline: none;
    transition: all 0.2s;

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }

    &:focus {
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.3);
    }

    &.has-icon {
        padding-left: 2.5rem;
    }
`;

const SelectWrapper = styled.div`
    position: relative;

    .icon {
        position: absolute;
        left: 0.75rem;
        top: 0.875rem;
        color: hsl(var(--muted-foreground));
        pointer-events: none;
    }
`;

const Select = styled.select`
    width: 100%;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    outline: none;
    appearance: none;
    cursor: pointer;

    &:focus {
        border-color: hsl(var(--primary));
    }
`;

const TextArea = styled.textarea`
    width: 100%;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    outline: none;
    resize: none;

    &:focus {
        border-color: hsl(var(--primary));
    }
`;

const SectionDivider = styled.h4`
    font-size: 0.75rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    padding-top: 0.5rem;

    .marker {
        width: 0.25rem;
        height: 0.75rem;
        background-color: hsl(var(--primary));
        border-radius: 9999px;
        margin-right: 0.5rem;
    }
`;

const InputWrapper = styled.div`
    position: relative;

    .icon {
        position: absolute;
        left: 0.75rem;
        top: 0.875rem;
        color: hsl(var(--muted-foreground));
    }
`;

const Footer = styled.div`
    padding-top: 2rem;
    margin-top: 1rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
`;

const CancelButton = styled.button`
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: color 0.2s, background-color 0.2s;

    &:hover {
        color: hsl(var(--foreground));
        background-color: var(--overlay-light);
    }
`;

const SubmitButton = styled.button`
    padding: 0.625rem 1.5rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: hsl(var(--primary-foreground));
    background-color: hsl(var(--primary));
    border: none;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(139, 92, 246, 0.2);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;

    &:hover {
        opacity: 0.9;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const ErrorMessage = styled.div`
    color: hsl(var(--destructive));
    font-size: 13px;
    margin-top: 8px;
    white-space: pre-wrap;
    text-align: right;
    width: 100%;
`;

const InfoText = styled.p`
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    font-style: italic;
`;

// Loading Animations
const ping = keyframes`
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
`;

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const LoadingOverlay = styled.div`
    position: absolute;
    inset: 0;
    z-index: 50;
    background-color: var(--overlay-backdrop);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
`;

const LoadingContent = styled.div`
    width: 16rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
`;

const LoaderWrapper = styled.div`
    position: relative;
    display: inline-flex;
    margin-bottom: 1rem;
    justify-content: center;
`;

const PingCircle = styled.div`
    width: 4rem;
    height: 4rem;
    border: 4px solid rgba(139, 92, 246, 0.3);
    border-radius: 9999px;
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    animation: ${ping} 1s cubic-bezier(0, 0, 0.2, 1) infinite;
`;

const SpinCircle = styled.div`
    width: 4rem;
    height: 4rem;
    border: 4px solid transparent;
    border-top-color: hsl(var(--primary));
    border-bottom-color: hsl(var(--primary));
    border-radius: 9999px;
    animation: ${spin} 1s linear infinite;
    position: relative;
    z-index: 10;
    left: -2px;
`;

const DatabaseIcon = styled(Database)`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: hsl(var(--foreground));
`;

const LoadingTitle = styled.h3`
    font-size: 1.125rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    letter-spacing: 0.1em;
    font-family: monospace;
    margin: 0;
`;

const LoadingText = styled.p`
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    font-family: monospace;
    margin: 0.25rem 0 0 0;
`;

const ProgressBarContainer = styled.div`
    width: 100%;
    background-color: var(--overlay-light);
    border-radius: 9999px;
    height: 0.25rem;
    overflow: hidden;
`;

const ProgressBar = styled.div<{ width: number }>`
    height: 100%;
    background-color: hsl(var(--primary));
    transition: width 0.3s ease-out;
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.6);
    width: ${props => props.width}%;
`;
