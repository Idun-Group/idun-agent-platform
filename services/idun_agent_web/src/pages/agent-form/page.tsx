import { Check, Box, Code2, Shield, ChevronRight, ChevronLeft, Activity, Upload, Server, Layers, X, Database, Info, Eye, Plus, Zap } from 'lucide-react';
import { type ChangeEvent, useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_FRAMEWORKS } from '../../utils/yaml-parser';
import { createAgent } from '../../services/agents';
import { useNavigate } from 'react-router-dom';
import { AgentAvatar } from '../../components/general/agent-avatar/component';
import { DynamicForm } from '../../components/general/dynamic-form/component';
import { API_BASE_URL } from '../../utils/api';
import { fetchApplications, MARKETPLACE_APPS, mapConfigToApi } from '../../services/applications';
import type { ApplicationConfig, AppType, MarketplaceApp, AppCategory } from '../../types/application.types';
import ApplicationModal from '../../components/applications/application-modal/component';

const DISABLED_FRAMEWORKS = new Set(['ADK', 'CREWAI', 'CUSTOM']);

// Mapping of AgentFramework enum to OpenAPI schema definition names
const FRAMEWORK_SCHEMA_MAP: Record<string, string> = {
    'LANGGRAPH': 'LangGraphAgentConfig',
    'HAYSTACK': 'HaystackAgentConfig',
    'ADK': 'BaseAgentConfig',
    'CREWAI': 'BaseAgentConfig',
    'CUSTOM': 'BaseAgentConfig'
};

const OBSERVABILITY_TYPES: AppType[] = ['Langfuse', 'Phoenix', 'GoogleCloudLogging', 'GoogleCloudTrace', 'LangSmith'];
const MEMORY_TYPES: AppType[] = ['PostgreSQL', 'SQLite'];

// Component for Horizontal Scrolling Carousel
const Carousel = ({ children }: { children: React.ReactNode }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 0);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [children]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const amount = 200;
            scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
            setTimeout(checkScroll, 300);
        }
    };

    return (
        <CarouselContainer>
            {canScrollLeft && (
                <CarouselButton direction="left" onClick={() => scroll('left')}>
                    <ChevronLeft size={16} />
                </CarouselButton>
            )}
            <CarouselTrack ref={scrollRef} onScroll={checkScroll}>
                {children}
            </CarouselTrack>
            {canScrollRight && (
                <CarouselButton direction="right" onClick={() => scroll('right')}>
                    <ChevronRight size={16} />
                </CarouselButton>
            )}
        </CarouselContainer>
    );
    };

export default function AgentFormPage() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [name, setName] = useState<string>('');
    const [version, setVersion] = useState<string>('v1');
    const [description, setDescription] = useState<string>('');
    const [serverPort, setServerPort] = useState<string>('8000');
    const [agentType, setAgentType] = useState<string | null>('LANGGRAPH');
    
    // Dynamic Config State
    const [agentConfig, setAgentConfig] = useState<Record<string, any>>({});
    const [rootSchema, setRootSchema] = useState<any>(null);
    const [schemaError, setSchemaError] = useState<string | null>(null);

    // Applications Data
    const [observabilityApps, setObservabilityApps] = useState<ApplicationConfig[]>([]);
    const [memoryApps, setMemoryApps] = useState<ApplicationConfig[]>([]);
    const [mcpApps, setMcpApps] = useState<ApplicationConfig[]>([]);
    const [guardApps, setGuardApps] = useState<ApplicationConfig[]>([]);

    // Selection State
    const [selectedMemoryType, setSelectedMemoryType] = useState<string>('');
    const [selectedMemoryAppId, setSelectedMemoryAppId] = useState<string>('');
    
    const [selectedObservabilityTypes, setSelectedObservabilityTypes] = useState<string[]>([]);
    const [selectedObservabilityApps, setSelectedObservabilityApps] = useState<Record<string, string>>({}); // Type -> AppID

    const [selectedMCPIds, setSelectedMCPIds] = useState<string[]>([]);
    const [selectedGuardIds, setSelectedGuardIds] = useState<string[]>([]);
    const [selectedGuardTypeToAdd, setSelectedGuardTypeToAdd] = useState<string>('');

    // Application Modal State
    const [isAppModalOpen, setIsAppModalOpen] = useState(false);
    const [appToCreate, setAppToCreate] = useState<MarketplaceApp | undefined>(undefined);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | undefined>(undefined);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [availableFrameworks, setAvailableFrameworks] = useState<
        Array<{ id: string; name: string }>
    >([]);

    const [environment, setEnvironment] = useState<'development' | 'staging' | 'production' | null>('development');
    const { t } = useTranslation();

    const loadApps = () => {
        fetchApplications().then(apps => {
            setObservabilityApps(apps.filter(a => a.category === 'Observability'));
            setMemoryApps(apps.filter(a => a.category === 'Memory'));
            setMcpApps(apps.filter(a => a.category === 'MCP'));
            setGuardApps(apps.filter(a => a.category === 'Guardrails'));
        });
    };

    // Data Fetching
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        
        // Fetch Schema
        fetch(`${API_BASE_URL}/openapi.json`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch OpenAPI schema');
                return res.json();
            })
            .then(data => setRootSchema(data))
            .catch(err => {
                console.error('Error fetching OpenAPI schema:', err);
                setSchemaError('Failed to load agent configuration schema.');
            });

        // Fetch Apps
        loadApps();

        // Fetch Frameworks
        fetch('http://localhost:4001/api/v1/framework')
            .then((response) => response.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    const normalized = data.map((item: any) => ({
                        id: (item?.id ?? item?.value ?? '').toString().trim(),
                        name: item?.name ?? item?.label ?? item?.id
                    })).filter((item): item is { id: string; name: string } => !!item.id);
                    setAvailableFrameworks(normalized);
                }
            })
            .catch((error) => console.error('Error fetching frameworks:', error));

        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        setAgentConfig(prev => ({ ...prev, name: name }));
    }, [name]);

    // Helpers
    const getRiskLevel = (type: string) => {
        const high = ['DetectPII', 'Secrets', 'DetectJailbreak', 'NSFWText', 'ModelArmor'];
        const medium = ['BiasCheck', 'CompetitionCheck', 'GibberishText', 'ValidSQL', 'ValidPython', 'WebSanitization'];
        if (high.includes(type)) return { label: 'High Risk', color: 'red' };
        if (medium.includes(type)) return { label: 'Medium Risk', color: 'amber' };
        return { label: 'Low Risk', color: 'blue' };
    };

    const toggleMCP = (id: string) => {
        setSelectedMCPIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleGuard = (id: string) => {
        setSelectedGuardIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleVersionChange = (event: ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value ?? '';
        const normalized = `v${rawValue.replace(/^(v|V)+/, '').replace(/[^0-9a-zA-Z._-]/g, '')}`;
        setVersion(normalized || 'v');
    };

    // Step Navigation
    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const toggleObservabilityType = (type: string) => {
        setSelectedObservabilityTypes(prev => 
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const selectObservabilityApp = (type: string, appId: string) => {
        setSelectedObservabilityApps(prev => ({
            ...prev,
            [type]: appId
        }));
    };

    const getFilteredMemoryApps = () => {
        if (!selectedMemoryType) return [];
        return memoryApps.filter(app => app.type === selectedMemoryType);
    };

    const getFilteredObservabilityApps = (type: string) => {
        return observabilityApps.filter(app => app.type === type);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const handleCreateApp = (type: AppType, category: AppCategory) => {
        const marketplaceApp = MARKETPLACE_APPS.find(app => app.type === type && app.category === category);
        if (marketplaceApp) {
            setAppToCreate(marketplaceApp);
            setAppToEdit(undefined);
            setIsAppModalOpen(true);
            } else {
            toast.error(`Configuration template for ${type} not found.`);
        }
    };

    const handleViewApp = (e: React.MouseEvent, app: ApplicationConfig) => {
        e.stopPropagation();
        setAppToCreate(undefined);
        setAppToEdit(app);
        setIsAppModalOpen(true);
    };

    const handleSubmitForm = async (e: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
        if (e && 'preventDefault' in e) e.preventDefault();
        
        if (!name.trim()) return toast.error('Agent name is required');
        if (!agentType) return toast.error('Please select an agent type');
        const parsedPort = Number(serverPort);
        if (!Number.isFinite(parsedPort) || parsedPort <= 0) return toast.error('Invalid server port');

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const finalAgentConfig = { ...agentConfig };

            // 1. Handle Memory (Checkpointer)
            if (selectedMemoryAppId) {
                const memApp = memoryApps.find(a => a.id === selectedMemoryAppId);
                if (memApp) {
                    const typeMap: Record<string, string> = { 'SQLite': 'sqlite', 'PostgreSQL': 'postgres' };
                    finalAgentConfig.checkpointer = {
                        type: typeMap[memApp.type] || memApp.type.toLowerCase(),
                        db_url: memApp.config.connectionString
                    };
                }
            }

            // 2. Handle Observability
            const obsConfig: any = {
                enabled: selectedObservabilityTypes.length > 0,
                options: {}
            };

            let primaryProviderSet = false;

            selectedObservabilityTypes.forEach(type => {
                const appId = selectedObservabilityApps[type];
                if (appId) {
                    const app = observabilityApps.find(a => a.id === appId);
                    if (app) {
                        // Map app type to provider key
                        const providerMap: Record<string, string> = {
                            'Langfuse': 'langfuse',
                            'Phoenix': 'phoenix',
                            'GoogleCloudLogging': 'google_cloud_logging',
                            'GoogleCloudTrace': 'google_cloud_trace',
                            'LangSmith': 'langsmith'
                        };
                        const providerKey = providerMap[app.type] || app.type.toLowerCase();

                        if (!primaryProviderSet) {
                            obsConfig.provider = providerKey;
                            primaryProviderSet = true;
                        }

                        obsConfig.options = { ...obsConfig.options, ...app.config };
                    }
                }
            });

            if (obsConfig.enabled) {
                finalAgentConfig.observability = obsConfig;
            }

            // 3. Handle MCP & Guardrails
            // Map MCP IDs to actual config objects
            const mcpConfigs = selectedMCPIds.map(id => {
                const app = mcpApps.find(a => a.id === id);
                return app ? mapConfigToApi('MCPServer', app.config, app.name) : null;
            }).filter(Boolean);

            // Map Guardrail IDs to actual config objects (just the raw config, no wrapper)
            const guardConfigObjects = selectedGuardIds.map(id => {
                const app = guardApps.find(a => a.id === id);
                if (!app) return null;
                return mapConfigToApi(app.type, app.config);
            }).filter(Boolean);

            // Construct Guardrails object
            const guardrailsConfig = guardConfigObjects.length > 0 ? {
                input: guardConfigObjects,
                output: []
            } : undefined;

            const payload = {
                name: name.trim(),
                version: version.trim() || 'v1',
                engine_config: {
                    server: { api: { port: parsedPort } },
                    agent: { type: agentType, config: finalAgentConfig },
                    mcp_servers: mcpConfigs.length > 0 ? mcpConfigs : undefined,
                    guardrails: guardrailsConfig
                }
            };

            console.log('Creating agent:', payload);
            const createdAgent = await createAgent(payload);
            toast.success(`Agent "${createdAgent.name}" created successfully!`);
            setTimeout(() => navigate('/agents'), 1000);

        } catch (error: any) {
            console.error('Error:', error);
            let msg = 'Failed to create agent';
            try {
                const parsed = JSON.parse(error.message);
                if (parsed.detail) {
                    msg = Array.isArray(parsed.detail) 
                        ? parsed.detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join(', ')
                        : parsed.detail;
                }
            } catch {}
            setSubmitError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const frameworkOptions = (availableFrameworks.length > 0 ? availableFrameworks : SUPPORTED_FRAMEWORKS.map(f => ({ id: f, name: f.replace(/_/g, ' ') })))
        .map(f => ({ id: f.id.toUpperCase(), label: f.name }))
        .filter(f => !DISABLED_FRAMEWORKS.has(f.id));

    const getCurrentSchema = () => {
        if (!rootSchema || !agentType) return null;
        return rootSchema.components?.schemas?.[FRAMEWORK_SCHEMA_MAP[agentType]];
    };

    return (
        <PageContainer>
            <Backdrop onClick={() => navigate('/agents')} />
            <ModalWindow>
                <ModalHeader>
                    <div>
                        <ModalTitle>{t('agent-form.title')}</ModalTitle>
                        <ModalSubtitle>{t('agent-form.description')} • Step {currentStep} of 3</ModalSubtitle>
                    </div>
                    <CloseButton onClick={() => navigate('/agents')}><X size={24} /></CloseButton>
                </ModalHeader>

                <StepperContainer>
                    <StepperInner>
                        {[
                            { number: 1, title: 'Identity & Runtime', icon: Box },
                            { number: 2, title: 'Logic & Data', icon: Code2 },
                            { number: 3, title: 'Capabilities & Safety', icon: Shield }
                        ].map((step, idx) => (
                            <StepItem key={step.number}>
                                <StepContent>
                                    <StepCircle $isActive={step.number === currentStep} $isCompleted={step.number < currentStep}>
                                        {step.number < currentStep ? <Check size={18} /> : <step.icon size={18} />}
                                    </StepCircle>
                                    <StepInfo>
                                        <StepTitle $isActive={step.number === currentStep} $isCompleted={step.number < currentStep}>{step.title}</StepTitle>
                                        {step.number === currentStep && <StepInProgress>In Progress</StepInProgress>}
                                    </StepInfo>
                                </StepContent>
                                {idx < 2 && <StepSeparatorLine><StepProgress $isCompleted={step.number < currentStep} /></StepSeparatorLine>}
                            </StepItem>
                        ))}
                    </StepperInner>
                </StepperContainer>

                <ModalBody>
                    <StyledForm onSubmit={(e) => e.preventDefault()}>
                        {currentStep === 1 && (
                            <StepContainer>
                                <StepGrid>
                                    <IdentityColumn>
                                        <SectionTitle><SectionIndicator /> Identity</SectionTitle>
                                        <IdentityRow>
                                            <AvatarSection>
                                                <AvatarLabel>ICON</AvatarLabel>
                                                <AvatarWrapper>
                                                    <AgentAvatar name={name || 'New Agent'} size={96} />
                                                    <AvatarOverlay><Upload size={20} color="white" /></AvatarOverlay>
                                                </AvatarWrapper>
                                            </AvatarSection>
                                            <IdentityFields>
                                                <Row>
                                                    <FieldWrapper style={{ flex: 2 }}>
                                                        <InputLabel>{t('agent-form.name.label')}</InputLabel>
                                                        <StyledInput placeholder={t('agent-form.name.placeholder')} value={name} onChange={e => setName(e.target.value)} />
                                                    </FieldWrapper>
                                                    <FieldWrapper style={{ flex: 1 }}>
                                                        <InputLabel>Version</InputLabel>
                                                        <StyledInput placeholder="1.0.0" value={version} onChange={handleVersionChange} />
                                                    </FieldWrapper>
                                                </Row>
                                                <FieldWrapper>
                                                    <InputLabel>Description</InputLabel>
                                                    <StyledTextarea placeholder="Describe the agent's purpose..." rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                                                </FieldWrapper>
                                            </IdentityFields>
                                        </IdentityRow>
                                    </IdentityColumn>
                                    <RuntimeColumn>
                                        <SectionTitle><SectionIndicator $color="blue" /> Runtime</SectionTitle>
                                        <FieldWrapper>
                                            <InputLabel>Target Environment</InputLabel>
                                            <div style={{ position: 'relative' }}>
                                                <Server size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: '#6b7280' }} />
                                                <StyledSelect value={environment || ''} onChange={e => setEnvironment(e.target.value as any)} style={{ paddingLeft: '40px' }}>
                                                    <option value="development">Development</option>
                                                    <option value="staging">Staging</option>
                                                    <option value="production">Production</option>
                                                </StyledSelect>
                                            </div>
                                        </FieldWrapper>
                                        <FieldWrapper>
                                            <InputLabel>Server Port</InputLabel>
                                            <StyledInput value={serverPort} onChange={e => setServerPort(e.target.value)} />
                                        </FieldWrapper>
                                        <FieldWrapper>
                                            <InputLabel>Framework</InputLabel>
                                            <FrameworkList>
                                                {frameworkOptions.map(fw => (
                                                    <FrameworkOption key={fw.id} $isSelected={agentType === fw.id} onClick={() => setAgentType(fw.id)} type="button">
                                                        <span style={{ display: 'flex', alignItems: 'center' }}>
                                                            <Layers size={16} style={{ marginRight: '8px', opacity: 0.7 }} />
                                                            {fw.label}
                                        </span>
                                                        {agentType === fw.id && <CheckCircle><Check size={10} color="white" /></CheckCircle>}
                                                    </FrameworkOption>
                                                ))}
                                            </FrameworkList>
                                        </FieldWrapper>
                                    </RuntimeColumn>
                                </StepGrid>
                            </StepContainer>
                        )}

                        {currentStep === 2 && (
                            <StepContainer>
                                <StepGrid>
                                    <LogicColumn>
                                        {schemaError ? <ErrorMessage>{schemaError}</ErrorMessage> : rootSchema ? (
                                            <DynamicForm 
                                                schema={getCurrentSchema()} 
                                                rootSchema={rootSchema}
                                                data={agentConfig}
                                                onChange={setAgentConfig}
                                                excludeFields={['checkpointer', 'observability']}
                                            />
                                        ) : <div style={{ color: '#fff' }}>Loading schema...</div>}
                                    </LogicColumn>

                                    <DataColumn>
                                        {/* Memory Section */}
                                        <div>
                                            <SectionTitle><SectionIndicator $color="emerald" /> Data Sources</SectionTitle>
                                            <FieldWrapper>
                                                <InputLabel>Memory Store Type</InputLabel>
                                                <div style={{ position: 'relative' }}>
                                                    <Database size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: '#6b7280' }} />
                                                    <StyledSelect 
                                                        value={selectedMemoryType} 
                                                        onChange={(e) => {
                                                            setSelectedMemoryType(e.target.value);
                                                            setSelectedMemoryAppId('');
                                                        }}
                                                        style={{ paddingLeft: '40px' }}
                                                    >
                                                        <option value="">Select Type...</option>
                                                        {MEMORY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </StyledSelect>
                                                </div>
                                            </FieldWrapper>

                                            {selectedMemoryType && (
                                                <CardGrid>
                                                    {/* Add Config Button */}
                                                    <AddConfigCard onClick={() => handleCreateApp(selectedMemoryType as AppType, 'Memory')}>
                                                        <Plus size={24} color="#8c52ff" />
                                                        <span>Add New</span>
                                                    </AddConfigCard>

                                                    {getFilteredMemoryApps().map(app => (
                                                        <ConfigCard 
                                                            key={app.id} 
                                                            $selected={selectedMemoryAppId === app.id}
                                                            onClick={() => setSelectedMemoryAppId(app.id)}
                                                        >
                                                            <CardHeader>
                                                                <CardTitle>{app.name}</CardTitle>
                                                                <div style={{display: 'flex', gap: '4px'}}>
                                                                    <MiniIconButton onClick={(e) => handleViewApp(e, app)}>
                                                                        <Eye size={12} />
                                                                    </MiniIconButton>
                                                                    {selectedMemoryAppId === app.id && <Check size={14} color="#10b981" />}
                                                                </div>
                                                            </CardHeader>
                                                            <CardMeta>{formatDate(app.updatedAt)} • {app.owner}</CardMeta>
                                                        </ConfigCard>
                                                    ))}
                                                </CardGrid>
                                            )}
                                        </div>

                                        {/* Observability Section */}
                                        <div style={{ marginTop: '32px' }}>
                                            <SectionTitle><SectionIndicator $color="yellow" /> Monitoring</SectionTitle>
                                            <FieldWrapper>
                                                <InputLabel>Observability Types (Multi-Select)</InputLabel>
                                                <MultiSelectContainer>
                                                    {OBSERVABILITY_TYPES.map(type => (
                                                        <TypeCheckbox key={type} $checked={selectedObservabilityTypes.includes(type)} onClick={() => toggleObservabilityType(type)}>
                                                            <div style={{display: 'flex', alignItems: 'center'}}>
                                                                <div className="checkbox">{selectedObservabilityTypes.includes(type) && <Check size={10} />}</div>
                                                                <span>{type}</span>
                                                            </div>
                                                        </TypeCheckbox>
                                                    ))}
                                                </MultiSelectContainer>
                                            </FieldWrapper>

                                            {selectedObservabilityTypes.map(type => {
                                                const apps = getFilteredObservabilityApps(type);
                                                return (
                                                    <div key={type} style={{ marginTop: '16px' }}>
                                                        <TypeHeader>{type}</TypeHeader>
                                                        <Carousel>
                                                            {/* Add Config Button in Carousel */}
                                                            <AddConfigCard 
                                                                style={{ minWidth: '140px', height: 'auto', aspectRatio: 'unset' }}
                                                                onClick={() => handleCreateApp(type as AppType, 'Observability')}
                                                            >
                                                                <Plus size={24} color="#8c52ff" />
                                                                <span>Add New</span>
                                                            </AddConfigCard>

                                                            {apps.map(app => (
                                                                <ConfigCard 
                                                                    key={app.id} 
                                                                    $selected={selectedObservabilityApps[type] === app.id}
                                                                    onClick={() => selectObservabilityApp(type, app.id)}
                                                                    style={{ minWidth: '200px' }}
                                                                >
                                                                    <CardHeader>
                                                                        <CardTitle>{app.name}</CardTitle>
                                                                        <div style={{display: 'flex', gap: '4px'}}>
                                                                            <MiniIconButton onClick={(e) => handleViewApp(e, app)}>
                                                                                <Eye size={12} />
                                                                            </MiniIconButton>
                                                                            {selectedObservabilityApps[type] === app.id && <Check size={14} color="#10b981" />}
                                                                        </div>
                                                                    </CardHeader>
                                                                    <CardMeta>{formatDate(app.updatedAt)}</CardMeta>
                                                                </ConfigCard>
                                                            ))}
                                                        </Carousel>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </DataColumn>
                                </StepGrid>
                            </StepContainer>
                        )}

                        {currentStep === 3 && (
                            <StepContainer>
                                <StepGrid>
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                        
                                        {/* MCP Section */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                                 <SectionTitle style={{ marginBottom: 0 }}><SectionIndicator $color="purple" /> Model Context Protocol (MCP) Servers</SectionTitle>
                                                 <div style={{ display: 'flex', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', color: '#9ca3af', padding: '4px 12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        {selectedMCPIds.length} Selected
                                        </span>
                                                    <AddButton onClick={() => handleCreateApp('MCPServer', 'MCP')}>
                                                        <Plus size={14} style={{ marginRight: '4px' }} /> Add Server
                                                    </AddButton>
                                                 </div>
                                            </div>
                                            
                                            {mcpApps.length === 0 ? (
                                                <EmptyState>No MCP Servers configured.</EmptyState>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(315px, 1fr))', gap: '16px' }}>
                                                    {mcpApps.map(app => (
                                                        <SafetyCardContainer 
                                                            key={app.id} 
                                                            $enabled={selectedMCPIds.includes(app.id)}
                                                            onClick={() => toggleMCP(app.id)}
                                                        >
                                                            <SafetyCardHeader>
                                                                <Zap size={18} color={selectedMCPIds.includes(app.id) ? '#c084fc' : '#4b5563'} />
                                                                <SafetyCheckbox $checked={selectedMCPIds.includes(app.id)}>
                                                                    {selectedMCPIds.includes(app.id) && <Check size={12} />}
                                                                </SafetyCheckbox>
                                                            </SafetyCardHeader>
                                                            
                                                            <SafetyTitle $enabled={selectedMCPIds.includes(app.id)}>{app.name}</SafetyTitle>
                                                            
                                                            <SafetyFooter>
                                                                <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(140, 82, 255, 0.2)', backgroundColor: 'rgba(140, 82, 255, 0.1)', color: '#c084fc' }}>
                                                                    {app.type}
                                        </span>
                                                            </SafetyFooter>
                                                        </SafetyCardContainer>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Guardrails Section */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                                 <SectionTitle style={{ marginBottom: 0 }}><SectionIndicator $color="red" /> Safety Guardrails</SectionTitle>
                                                 <div style={{ display: 'flex', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', color: '#9ca3af', padding: '4px 12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        {selectedGuardIds.length} Selected
                                                    </span>
                                                    <div style={{ position: 'relative', display: 'flex' }}>
                                                        <StyledSelect 
                                                            value={selectedGuardTypeToAdd} 
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setSelectedGuardTypeToAdd(val);
                                                                if(val) handleCreateApp(val as AppType, 'Guardrails');
                                                                setTimeout(() => setSelectedGuardTypeToAdd(''), 500);
                                                            }}
                                                            style={{ width: '140px', padding: '6px 12px', fontSize: '12px', height: '32px' }}
                                                        >
                                                            <option value="">+ Add Guardrail</option>
                                                            {MARKETPLACE_APPS.filter(a => a.category === 'Guardrails').map(a => (
                                                                <option key={a.type} value={a.type}>{a.name}</option>
                            ))}
                                                        </StyledSelect>
                                                    </div>
                                                 </div>
                                            </div>

                                            {guardApps.length === 0 ? (
                                                <EmptyState>No Safety Guardrails configured.</EmptyState>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(315px, 1fr))', gap: '16px' }}>
                                                    {guardApps.map(app => {
                                                        const risk = getRiskLevel(app.type);
                                                        const isEnabled = selectedGuardIds.includes(app.id);
                                                        return (
                                                            <SafetyCardContainer 
                                                                key={app.id} 
                                                                $enabled={isEnabled} 
                                                                $risk={risk.label.includes('High') ? 'High' : 'Low'}
                                                                onClick={() => toggleGuard(app.id)}
                                                            >
                                                                <SafetyCardHeader>
                                                                    <Shield size={18} color={isEnabled ? (risk.label.includes('High') ? '#f87171' : '#c084fc') : '#4b5563'} />
                                                                    <SafetyCheckbox $checked={isEnabled} $risk={risk.label.includes('High') ? 'High' : 'Low'}>
                                                                        {isEnabled && <Check size={12} />}
                                                                    </SafetyCheckbox>
                                                                </SafetyCardHeader>
                                                                
                                                                <SafetyTitle $enabled={isEnabled}>{app.name}</SafetyTitle>
                                                                
                                                                <SafetyFooter>
                                                                    <RiskTag $color={risk.color}>{risk.label}</RiskTag>
                                                                </SafetyFooter>
                                                            </SafetyCardContainer>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </StepGrid>
                            </StepContainer>
                        )}
                    </StyledForm>
                </ModalBody>

                <ModalFooter>
                    <CancelButton onClick={() => navigate('/agents')}>Cancel</CancelButton>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {currentStep > 1 && <BackButton onClick={prevStep}><ChevronLeft size={16} style={{ marginRight: '8px' }} /> Back</BackButton>}
                        {currentStep < 3 ? (
                            <NextButton onClick={nextStep}>Next Step <ChevronRight size={16} style={{ marginLeft: '8px' }} /></NextButton>
                        ) : (
                            <DeployButton onClick={(e) => handleSubmitForm(e as any)} disabled={isSubmitting}>
                                {isSubmitting ? 'Deploying...' : 'Deploy Agent'} <Activity size={16} style={{ marginLeft: '8px' }} />
                            </DeployButton>
                        )}
                    </div>
                </ModalFooter>
            </ModalWindow>

            <ApplicationModal
                isOpen={isAppModalOpen}
                onClose={() => setIsAppModalOpen(false)}
                appToCreate={appToCreate}
                appToEdit={appToEdit}
                onSuccess={loadApps}
            />
        </PageContainer>
    );
}

// Styled Components
const PageContainer = styled.div`
    position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px;
`;
const Backdrop = styled.div`
    position: absolute; inset: 0; background-color: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
`;
const ModalWindow = styled.div`
    position: relative; width: 100%; max-width: 1152px; background-color: #0f1016; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; max-height: 90vh; overflow: hidden;
`;
const ModalHeader = styled.div`
    display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); background-color: #0B0A15;
`;
const ModalTitle = styled.h2` font-size: 24px; font-weight: 700; color: white; margin: 0; `;
const ModalSubtitle = styled.p` font-size: 14px; color: #9ca3af; margin-top: 4px; `;
const CloseButton = styled.button` padding: 8px; color: #9ca3af; background: transparent; border: none; cursor: pointer; border-radius: 8px; transition: all 0.2s; &:hover { color: white; background-color: rgba(255, 255, 255, 0.05); } `;
const StepperContainer = styled.div` background-color: #08070f; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 16px 32px; `;
const StepperInner = styled.div` display: flex; align-items: center; justify-content: space-between; max-width: 768px; margin: 0 auto; `;
const StepItem = styled.div` display: flex; align-items: center; flex: 1; &:last-child { flex: none; } `;
const StepContent = styled.div` display: flex; align-items: center; position: relative; `;
const StepCircle = styled.div<{ $isActive: boolean; $isCompleted: boolean }>` width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid; transition: all 0.2s; z-index: 10; ${props => props.$isActive ? `background-color: #8c52ff; border-color: #8c52ff; color: white; box-shadow: 0 0 15px rgba(139, 92, 246, 0.5);` : props.$isCompleted ? `background-color: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #34d399;` : `background-color: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.1); color: #6b7280;`} `;
const StepInfo = styled.div` margin-left: 12px; `;
const StepTitle = styled.p<{ $isActive: boolean; $isCompleted: boolean }>` font-size: 14px; font-weight: 700; color: ${props => (props.$isActive || props.$isCompleted) ? 'white' : '#6b7280'}; margin: 0; `;
const StepInProgress = styled.p` font-size: 10px; color: #8c52ff; margin: 0; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } } `;
const StepSeparatorLine = styled.div` flex: 1; height: 2px; margin: 0 16px; background-color: rgba(255, 255, 255, 0.1); position: relative; `;
const StepProgress = styled.div<{ $isCompleted: boolean }>` position: absolute; inset: 0; background-color: #10b981; width: ${props => props.$isCompleted ? '100%' : '0%'}; transition: width 0.5s; `;
const ModalBody = styled.div` flex: 1; overflow-y: auto; padding: 32px; background-color: #040210; `;
const ModalFooter = styled.div` padding: 24px; border-top: 1px solid rgba(255, 255, 255, 0.05); background-color: #0B0A15; display: flex; justify-content: space-between; align-items: center; `;
const CancelButton = styled.button` padding: 10px 20px; font-size: 14px; font-weight: 500; color: #9ca3af; background: transparent; border: none; border-radius: 8px; cursor: pointer; transition: color 0.2s; &:hover { color: white; background-color: rgba(255, 255, 255, 0.05); } `;
const BackButton = styled.button` padding: 10px 20px; font-size: 14px; font-weight: 500; color: #d1d5db; background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; cursor: pointer; display: flex; align-items: center; transition: all 0.2s; &:hover { color: white; background-color: rgba(255, 255, 255, 0.1); } `;
const NextButton = styled.button` padding: 10px 24px; font-size: 14px; font-weight: 700; color: white; background-color: #8c52ff; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; box-shadow: 0 10px 15px -3px rgba(139, 92, 246, 0.2); transition: all 0.2s; &:hover { background-color: #7c3aed; } `;
const DeployButton = styled.button` padding: 10px 24px; font-size: 14px; font-weight: 700; color: white; background-color: #10b981; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.2); transition: all 0.2s; &:hover { background-color: #059669; } &:disabled { opacity: 0.6; cursor: not-allowed; } `;
const StepContainer = styled.div` animation: fadeIn 0.3s ease-in-out; height: 100%; @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } `;
const StepGrid = styled.div` display: grid; grid-template-columns: 1fr; gap: 32px; height: 100%; @media (min-width: 768px) { grid-template-columns: repeat(3, 1fr); } `;
const IdentityColumn = styled.div` grid-column: span 2; display: flex; flex-direction: column; gap: 24px; `;
const RuntimeColumn = styled.div` display: flex; flex-direction: column; gap: 24px; `;
const LogicColumn = styled.div` grid-column: span 2; display: flex; flex-direction: column; gap: 24px; height: 100%; min-height: 400px; `;
const DataColumn = styled.div` display: flex; flex-direction: column; gap: 24px; `;
const SectionTitle = styled.h3` font-size: 14px; font-weight: 700; color: white; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; margin-bottom: 16px; `;
const SectionIndicator = styled.span<{ $color?: string }>` width: 4px; height: 16px; background-color: ${props => { switch(props.$color) { case 'blue': return '#3b82f6'; case 'emerald': return '#10b981'; case 'yellow': return '#eab308'; case 'purple': return '#a855f7'; default: return '#8c52ff'; } }}; border-radius: 9999px; margin-right: 8px; `;
const IdentityRow = styled.div` display: flex; gap: 24px; align-items: flex-start; `;
const AvatarSection = styled.div` flex-shrink: 0; `;
const AvatarLabel = styled.label` display: block; font-size: 12px; font-weight: 500; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px; text-align: center; `;
const AvatarWrapper = styled.div` position: relative; cursor: pointer; &:hover > div { opacity: 1; } `;
const AvatarOverlay = styled.div` position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background-color: rgba(0, 0, 0, 0.6); opacity: 0; transition: opacity 0.2s; border-radius: 12px; `;
const IdentityFields = styled.div` flex: 1; display: flex; flex-direction: column; gap: 20px; `;
const Row = styled.div` display: flex; gap: 16px; `;
const FieldWrapper = styled.div` width: 100%; `;
const InputLabel = styled.label` display: block; font-size: 12px; font-weight: 500; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px; `;
const StyledInput = styled.input` width: 100%; background-color: #0B0A15; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 16px; font-size: 14px; color: white; outline: none; transition: all 0.2s; &:focus { border-color: #8c52ff; box-shadow: 0 0 0 1px #8c52ff; } &::placeholder { color: #374151; } `;
const StyledTextarea = styled.textarea` width: 100%; background-color: #0B0A15; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 16px; font-size: 14px; color: white; outline: none; transition: all 0.2s; resize: none; &:focus { border-color: #8c52ff; box-shadow: 0 0 0 1px #8c52ff; } &::placeholder { color: #374151; } `;
const StyledSelect = styled.select` width: 100%; background-color: #0B0A15; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #d1d5db; outline: none; appearance: none; transition: all 0.2s; cursor: pointer; &:focus { border-color: #8c52ff; } &:hover { border-color: rgba(255, 255, 255, 0.2); } `;
const FrameworkList = styled.div` display: flex; flex-direction: column; gap: 8px; `;
const FrameworkOption = styled.button<{ $isSelected: boolean }>` width: 100%; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; border: 1px solid; transition: all 0.2s; display: flex; align-items: center; justify-content: space-between; cursor: pointer; ${props => props.$isSelected ? `background-color: rgba(140, 82, 255, 0.1); border-color: #8c52ff; color: white;` : `background-color: #0B0A15; border-color: rgba(255, 255, 255, 0.1); color: #9ca3af; &:hover { border-color: rgba(255, 255, 255, 0.2); background-color: rgba(255, 255, 255, 0.05); }`} `;
const CheckCircle = styled.div` width: 16px; height: 16px; background-color: #8c52ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; `;
const ErrorMessage = styled.p` margin-top: 8px; margin-bottom: 0; font-size: 14px; font-family: inherit; font-weight: 400; color: #ff4757; line-height: 1.5; `;

// New Components for Enhanced Selection
const CardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    margin-top: 12px;
`;

const AddConfigCard = styled.button`
    background-color: rgba(140, 82, 255, 0.05);
    border: 1px dashed rgba(140, 82, 255, 0.3);
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 80px;
    color: #8c52ff;
    font-size: 12px;
    font-weight: 600;

    &:hover {
        background-color: rgba(140, 82, 255, 0.1);
        border-color: #8c52ff;
    }
`;

const ConfigCard = styled.div<{ $selected: boolean }>`
    background-color: ${props => props.$selected ? 'rgba(140, 82, 255, 0.1)' : '#0B0A15'};
    border: 1px solid ${props => props.$selected ? '#8c52ff' : 'rgba(255, 255, 255, 0.1)'};
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    gap: 8px;

    &:hover {
        border-color: ${props => props.$selected ? '#8c52ff' : 'rgba(255, 255, 255, 0.2)'};
        background-color: ${props => props.$selected ? 'rgba(140, 82, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)'};
    }
`;

const CardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
`;

const CardTitle = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const MiniIconButton = styled.div`
    padding: 2px;
    border-radius: 4px;
    color: #9ca3af;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    &:hover {
        background-color: rgba(255, 255, 255, 0.1);
        color: white;
    }
`;

const CardMeta = styled.span`
    font-size: 10px;
    color: #9ca3af;
`;

const EmptyText = styled.p`
    font-size: 12px;
    color: #6b7280;
    font-style: italic;
        margin: 0;
`;

const MultiSelectContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    background-color: #0B0A15;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
`;

const TypeCheckbox = styled.div<{ $checked: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background-color: ${props => props.$checked ? 'rgba(140, 82, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)'};
    border: 1px solid ${props => props.$checked ? '#8c52ff' : 'transparent'};
    border-radius: 6px;
    font-size: 12px;
    color: ${props => props.$checked ? 'white' : '#9ca3af'};
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;

    &:hover {
        background-color: ${props => props.$checked ? 'rgba(140, 82, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'};
    }

    .checkbox {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid ${props => props.$checked ? '#8c52ff' : '#4b5563'};
        background-color: ${props => props.$checked ? '#8c52ff' : 'transparent'};
        display: flex;
        align-items: center;
    justify-content: center;
        margin-right: 6px;
    }
`;

const CarouselContainer = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
`;

const CarouselTrack = styled.div`
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 4px 0;
    scroll-behavior: smooth;
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
    &::-webkit-scrollbar {
        display: none;
    }
    width: 100%;
`;

const CarouselButton = styled.button<{ direction: 'left' | 'right' }>`
    position: absolute;
    ${props => props.direction === 'left' ? 'left: -12px;' : 'right: -12px;'}
    z-index: 10;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: #1f2937;
    border: 1px solid #374151;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.8;
    &:hover { opacity: 1; background-color: #374151; }
`;

const TypeHeader = styled.div`
    font-size: 11px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background-color: rgba(255, 255, 255, 0.1);
    }
`;

const StyledForm = styled.form`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
`;

const SafetyCardContainer = styled.div<{ $enabled: boolean, $risk?: string }>`
    padding: 16px;
    border-radius: 12px;
    border: 1px solid ${props => props.$enabled
        ? (props.$risk === 'High' ? 'rgba(239, 68, 68, 0.5)' : props.$risk ? 'rgba(140, 82, 255, 0.5)' : 'rgba(140, 82, 255, 0.5)')
        : 'rgba(255, 255, 255, 0.1)'};
    background-color: ${props => props.$enabled
        ? (props.$risk === 'High' ? 'rgba(127, 29, 29, 0.1)' : props.$risk ? 'rgba(140, 82, 255, 0.1)' : 'rgba(140, 82, 255, 0.1)')
        : '#0B0A15'};
    display: flex;
    flex-direction: column;
    transition: all 0.2s;
    cursor: pointer;
    height: 100%;
    min-height: 120px;

    &:hover {
        border-color: ${props => props.$enabled ? '' : 'rgba(255, 255, 255, 0.2)'};
    }
`;

const SafetyCardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
    width: 100%;
`;

const SafetyCheckbox = styled.div<{ $checked: boolean, $risk?: string }>`
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    
    ${props => props.$checked
        ? `
            background-color: ${props.$risk === 'High' ? '#ef4444' : '#8c52ff'};
            border-color: ${props.$risk === 'High' ? '#ef4444' : '#8c52ff'};
            color: white;
        `
        : `
            background-color: rgba(0, 0, 0, 0.2);
            border-color: #374151;
        `
    }
`;

const SafetyTitle = styled.h4<{ $enabled: boolean }>`
    font-size: 14px;
    font-weight: 700;
    color: ${props => props.$enabled ? 'white' : '#d1d5db'};
    margin: 0 0 4px 0;
`;

const SafetyFooter = styled.div`
    margin-top: auto;
    padding-top: 8px;
`;

const SafetyDesc = styled.p`
    font-size: 12px;
    color: #6b7280;
        margin: 0;
`;

// Removed unused SafetyToggle and SafetyToggleKnob styled components

const RiskTag = styled.span<{ $color: string }>`
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid;
    ${props => {
        switch(props.$color) {
            case 'red': return `background-color: rgba(239, 68, 68, 0.1); color: #f87171; border-color: rgba(239, 68, 68, 0.2);`;
            case 'amber': return `background-color: rgba(245, 158, 11, 0.1); color: #fbbf24; border-color: rgba(245, 158, 11, 0.2);`;
            default: return `background-color: rgba(59, 130, 246, 0.1); color: #60a5fa; border-color: rgba(59, 130, 246, 0.2);`;
        }
    }}
`;

const AddButton = styled.button`
    display: flex;
    align-items: center;
    padding: 4px 12px;
    background-color: rgba(140, 82, 255, 0.1);
    color: #8c52ff;
    border: 1px solid rgba(140, 82, 255, 0.2);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
        background-color: rgba(140, 82, 255, 0.2);
    }
`;

const EmptyState = styled.div`
    padding: 32px;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    text-align: center;
    color: #6b7280;
    font-size: 13px;
    background-color: rgba(255, 255, 255, 0.02);
`;
