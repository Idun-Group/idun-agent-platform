import { Check, Box, Code2, Shield, ChevronRight, ChevronLeft, Upload, Server, Layers, X, Database, Eye, Plus, Zap, AlertTriangle } from 'lucide-react';
import { type ChangeEvent, useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_FRAMEWORKS } from '../../utils/yaml-parser';
import { AgentAvatar } from '../general/agent-avatar/component';
import { DynamicForm } from '../general/dynamic-form/component';
import { API_BASE_URL } from '../../utils/api';
import { fetchApplications, MARKETPLACE_APPS, mapConfigToApi } from '../../services/applications';
import type { ApplicationConfig, AppType, MarketplaceApp, AppCategory } from '../../types/application.types';
import ApplicationModal from '../applications/application-modal/component';
import type { BackendAgent } from '../../services/agents';

const DISABLED_FRAMEWORKS = new Set(['CREWAI', 'CUSTOM']);

// Mapping of AgentFramework enum to OpenAPI schema definition names
const FRAMEWORK_SCHEMA_MAP: Record<string, string> = {
    'LANGGRAPH': 'LangGraphAgentConfig',
    'HAYSTACK': 'HaystackAgentConfig',
    'ADK': 'AdkAgentConfig',
    'CREWAI': 'BaseAgentConfig',
    'CUSTOM': 'BaseAgentConfig'
};

const OBSERVABILITY_TYPES: AppType[] = ['Langfuse', 'Phoenix', 'GoogleCloudLogging', 'GoogleCloudTrace', 'LangSmith'];
const FRAMEWORK_MEMORY_MAP: Record<string, AppType[]> = {
    'LANGGRAPH': ['PostgreSQL', 'SQLite'],
    'ADK': ['AdkVertexAi', 'AdkDatabase'],
    'HAYSTACK': [],
    'CREWAI': [],
    'CUSTOM': []
};

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

export interface AgentFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (agent: any) => void;
    mode: 'create' | 'edit';
    initialData?: BackendAgent;
}

export default function AgentFormModal({ isOpen, onClose, onSuccess, mode, initialData }: AgentFormModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [name, setName] = useState<string>('');
    const [version, setVersion] = useState<string>('1.0.0');
    const [baseUrl, setBaseUrl] = useState<string>('');
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
    const [selectedMemoryType, setSelectedMemoryType] = useState<string>('InMemoryCheckpointConfig');
    const [selectedMemoryAppId, setSelectedMemoryAppId] = useState<string>('');

    const [selectedObservabilityTypes, setSelectedObservabilityTypes] = useState<string[]>([]);
    const [selectedObservabilityApps, setSelectedObservabilityApps] = useState<Record<string, string>>({});

    const [selectedMCPIds, setSelectedMCPIds] = useState<string[]>([]);
    const [selectedGuardIds, setSelectedGuardIds] = useState<string[]>([]);
    const [selectedGuardTypeToAdd, setSelectedGuardTypeToAdd] = useState<string>('');
    const [isGuardrailMarketplaceVisible, setIsGuardrailMarketplaceVisible] = useState(false);

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

    // Initialize form with existing data when editing
    useEffect(() => {
        if (mode === 'edit' && initialData && isOpen) {
            setName(initialData.name || '');
            setVersion(initialData.version || '1.0.0');
            setBaseUrl(initialData.base_url || '');
            setDescription(initialData.description || '');

            // Extract port from engine_config
            const port = initialData.engine_config?.server?.api?.port;
            setServerPort(port ? String(port) : '8000');

            // Extract framework/agent type
            const framework = initialData.engine_config?.agent?.type || initialData.framework || 'LANGGRAPH';
            setAgentType(framework);

            // Extract agent config - cast to any to access dynamic properties
            const config = { ...(initialData.engine_config?.agent?.config || {}) } as any;

            // Ensure graph_definition is a string
            if (config.graph_definition && typeof config.graph_definition !== 'string') {
                try {
                    config.graph_definition = JSON.stringify(config.graph_definition, null, 4);
                } catch (e) {
                    console.error('Failed to stringify graph_definition', e);
                }
            }

            // Ensure component_definition is a string
            if (config.component_definition && typeof config.component_definition !== 'string') {
                try {
                    config.component_definition = JSON.stringify(config.component_definition, null, 4);
                } catch (e) {
                    console.error('Failed to stringify component_definition', e);
                }
            }

            // Ensure schema definitions and store are strings
            ['input_schema_definition', 'output_schema_definition', 'store'].forEach(key => {
                if (config[key] && typeof config[key] !== 'string') {
                    try {
                        config[key] = JSON.stringify(config[key], null, 4);
                    } catch (e) {
                        console.error(`Failed to stringify ${key}`, e);
                    }
                }
            });

            setAgentConfig(config);

            // Extract checkpointer/memory selection
            const checkpointer = config.checkpointer;
            const sessionService = config.session_service;

            if (framework === 'ADK') {
                if (sessionService) {
                    if (sessionService.type === 'in_memory') {
                        setSelectedMemoryType('AdkInMemory');
                    } else {
                        const typeMap: Record<string, string> = { 'vertex_ai': 'AdkVertexAi', 'database': 'AdkDatabase' };
                        const memType = typeMap[sessionService.type];
                        if (memType) {
                            setSelectedMemoryType(memType);
                            // Try to match with existing apps
                            // This logic assumes we can match by config. Ideally we should store app_id if possible or just match by config values.
                            // For now, let's leave app matching logic basic or skip it if complex,
                            // as we mainly need to set the type.
                            // Re-using the checkpointer matching logic style:
                            if (memoryApps.length > 0) {
                                const match = memoryApps.find(app => {
                                    if (app.type !== memType) return false;
                                    if (memType === 'AdkDatabase') return app.config.connectionString === sessionService.db_url;
                                    if (memType === 'AdkVertexAi') return app.config.project_id === sessionService.project_id;
                                    return false;
                                });
                                if (match) setSelectedMemoryAppId(match.id);
                            }
                        }
                    }
                } else {
                    // Default to AdkInMemory if no session service config present? Or leave empty?
                    // User query implies default is AdkInMemory.
                    setSelectedMemoryType('AdkInMemory');
                }
            } else if (checkpointer) {
                if (checkpointer.type === 'memory') {
                    setSelectedMemoryType('InMemoryCheckpointConfig');
                } else {
                    const memType = checkpointer.type === 'sqlite' ? 'SQLite' : 'PostgreSQL';
                    setSelectedMemoryType(memType);

                    if (memoryApps.length > 0 && checkpointer.db_url) {
                        const match = memoryApps.find(app => app.type === memType && app.config.connectionString === checkpointer.db_url);
                        if (match) {
                            setSelectedMemoryAppId(match.id);
                        }
                    }
                }
            }

            // Extract observability
            const obs = (initialData.engine_config as any)?.observability || config.observability;
            if (Array.isArray(obs)) {
                const types: string[] = [];
                const selectedApps: Record<string, string> = {};

                obs.forEach((o: any) => {
                    if (o.provider && o.enabled !== false) {
                        const providerMap: Record<string, string> = {
                            'langfuse': 'Langfuse',
                            'LANGFUSE': 'Langfuse',
                            'phoenix': 'Phoenix',
                            'PHOENIX': 'Phoenix',
                            'google_cloud_logging': 'GoogleCloudLogging',
                            'GCP_LOGGING': 'GoogleCloudLogging',
                            'google_cloud_trace': 'GoogleCloudTrace',
                            'GCP_TRACE': 'GoogleCloudTrace',
                            'langsmith': 'LangSmith',
                            'LANGSMITH': 'LangSmith'
                        };
                        const type = providerMap[o.provider];
                        if (type) {
                            types.push(type);

                            if (observabilityApps.length > 0 && o.config) {
                                const match = observabilityApps.find(app => {
                                    if (app.type !== type) return false;
                                    // Compare config keys
                                    const keys = Object.keys(o.config);
                                    if (keys.length === 0) return false;
                                    return keys.every(k => app.config[k] === o.config[k]);
                                });
                                if (match) {
                                    selectedApps[type] = match.id;
                                }
                            }
                        }
                    }
                });
                setSelectedObservabilityTypes([...new Set(types)]);
                setSelectedObservabilityApps(selectedApps);
            }

            // Guardrails
            const guards = (initialData.engine_config as any)?.guardrails;
            if (guards?.input && Array.isArray(guards.input) && guardApps.length > 0) {
                 const ids: string[] = [];
                 guards.input.forEach((g: any) => {
                     const match = guardApps.find(app => app.name === g.name);
                     if (match) {
                        ids.push(match.id);
                     }
                 });
                 setSelectedGuardIds([...new Set(ids)]);
            }

            // MCP Servers
            const mcp = (initialData.engine_config as any)?.mcp_servers;
            if (Array.isArray(mcp) && mcpApps.length > 0) {
                const ids: string[] = [];
                mcp.forEach((m: any) => {
                    const match = mcpApps.find(app => app.name === m.name);
                    if (match) {
                        ids.push(match.id);
                    }
                });
                setSelectedMCPIds([...new Set(ids)]);
            }
        }
    }, [mode, initialData, isOpen, guardApps, memoryApps, observabilityApps, mcpApps]);

    // Data Fetching
    useEffect(() => {
        if (!isOpen) return;

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
        fetch('/api/v1/agent-frameworks/')
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
    }, [isOpen]);

    useEffect(() => {
        setAgentConfig(prev => ({ ...prev, name: name }));
    }, [name]);

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setCurrentStep(1);
            if (mode === 'create') {
                setName('');
                setVersion('1.0.0');
                setBaseUrl('');
                setDescription('');
                setServerPort('8000');
                setAgentType('LANGGRAPH');
                setAgentConfig({});
                setSelectedMemoryType('InMemoryCheckpointConfig');
                setSelectedMemoryAppId('');
                setSelectedObservabilityTypes([]);
                setSelectedObservabilityApps({});
                setSelectedMCPIds([]);
                setSelectedGuardIds([]);
            }
            setSubmitError(null);
        }
    }, [isOpen, mode]);

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
        setVersion(event.target.value ?? '');
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

        // Validate required fields based on framework
        if (agentType === 'LANGGRAPH') {
            if (!agentConfig.graph_definition || (typeof agentConfig.graph_definition === 'string' && !agentConfig.graph_definition.trim())) {
                return toast.error('Graph Definition is required for LangGraph agents');
            }
        }
        if (agentType === 'HAYSTACK') {
            if (!agentConfig.component_type) {
                return toast.error('Component Type is required for Haystack agents');
            }
            if (!agentConfig.component_definition || (typeof agentConfig.component_definition === 'string' && !agentConfig.component_definition.trim())) {
                return toast.error('Component Definition is required for Haystack agents');
            }
        }
        if (agentType === 'ADK') {
            if (!agentConfig.agent) {
                return toast.error('Agent definition is required for ADK agents');
            }
            if (!agentConfig.app_name) {
                return toast.error('App Name is required for ADK agents');
            }
        }

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const finalAgentConfig = { ...agentConfig };

            // Parse schema definitions and store if they are JSON strings
            ['input_schema_definition', 'output_schema_definition', 'store'].forEach(key => {
                if (typeof finalAgentConfig[key] === 'string') {
                    try {
                        finalAgentConfig[key] = JSON.parse(finalAgentConfig[key]);
                    } catch (e) {
                        console.warn(`Failed to parse ${key} as JSON`, e);
                    }
                }
            });

            // 1. Handle Memory
            if (agentType === 'ADK') {
                if (selectedMemoryType === 'AdkInMemory') {
                    finalAgentConfig.session_service = { type: 'in_memory' };
                } else if (selectedMemoryAppId) {
                    const memApp = memoryApps.find(a => a.id === selectedMemoryAppId);
                    if (memApp) {
                        const typeMap: Record<string, string> = {
                            'AdkVertexAi': 'vertex_ai',
                            'AdkDatabase': 'database'
                        };
                        const type = typeMap[memApp.type];

                        if (type) {
                            const sessionConfig: any = { type };
                            if (type === 'vertex_ai') {
                                sessionConfig.project_id = memApp.config.project_id;
                                sessionConfig.location = memApp.config.location;
                                sessionConfig.reasoning_engine_app_name = memApp.config.reasoning_engine_app_name;
                            } else if (type === 'database') {
                                sessionConfig.db_url = memApp.config.connectionString || memApp.config.db_url;
                            }
                            finalAgentConfig.session_service = sessionConfig;
                        }
                    }
                }
                // Ensure memory_service is null as requested
                finalAgentConfig.memory_service = null;
            } else {
                if (selectedMemoryType === 'InMemoryCheckpointConfig') {
                    finalAgentConfig.checkpointer = {
                        type: "memory"
                    };
                } else if (selectedMemoryAppId) {
                    const memApp = memoryApps.find(a => a.id === selectedMemoryAppId);
                    if (memApp) {
                        const typeMap: Record<string, string> = { 'SQLite': 'sqlite', 'PostgreSQL': 'postgres' };
                        finalAgentConfig.checkpointer = {
                            type: typeMap[memApp.type] || memApp.type.toLowerCase(),
                            db_url: memApp.config.connectionString
                        };
                    }
                } else {
                    finalAgentConfig.checkpointer = null;
                }
            }

            // 2. Handle Observability
            const observabilityConfigs: any[] = [];

            selectedObservabilityTypes.forEach(type => {
                const appId = selectedObservabilityApps[type];
                if (appId) {
                    const app = observabilityApps.find(a => a.id === appId);
                    if (app) {
                        const providerMap: Record<string, string> = {
                            'Langfuse': 'LANGFUSE',
                            'Phoenix': 'PHOENIX',
                            'GoogleCloudLogging': 'GCP_LOGGING',
                            'GoogleCloudTrace': 'GCP_TRACE',
                            'LangSmith': 'LANGSMITH'
                        };
                        const providerKey = providerMap[app.type] || app.type.toLowerCase();

                        observabilityConfigs.push({
                            enabled: true,
                            provider: providerKey,
                            config: app.config
                        });
                    }
                }
            });

            if (observabilityConfigs.length > 0) {
                // finalAgentConfig.observability = observabilityConfigs;
            } else {
                // finalAgentConfig.observability = [];
            }

            // 3. Handle MCP & Guardrails
            const mcpConfigs = selectedMCPIds.map(id => {
                const app = mcpApps.find(a => a.id === id);
                return app ? mapConfigToApi('MCPServer', app.config, app.name) : null;
            }).filter(Boolean);

            const guardConfigObjects = selectedGuardIds.map(id => {
                const app = guardApps.find(a => a.id === id);
                if (!app) return null;
                return mapConfigToApi(app.type, app.config);
            }).filter(Boolean);

            const guardrailsConfig = guardConfigObjects.length > 0 ? {
                input: guardConfigObjects,
                output: []
            } : null;

            const payload = {
                name: name.trim(),
                version: version.trim() || '1.0.0',
                base_url: baseUrl.trim() || null,
                engine_config: {
                    server: { api: { port: parsedPort } },
                    agent: { type: agentType, config: finalAgentConfig },
                    mcp_servers: mcpConfigs.length > 0 ? mcpConfigs : null,
                    guardrails: guardrailsConfig,
                    observability: observabilityConfigs
                }
            };

            console.log(`${mode === 'edit' ? 'Updating' : 'Creating'} agent:`, payload);

            // Call the appropriate API based on mode
            onSuccess(payload);

        } catch (error: any) {
            console.error('Error:', error);
            let msg = `Failed to ${mode === 'edit' ? 'update' : 'create'} agent`;
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

    const availableMemoryTypes = FRAMEWORK_MEMORY_MAP[agentType || 'LANGGRAPH'] || [];

    const getCurrentSchema = () => {
        if (!rootSchema || !agentType) return null;
        const schema = rootSchema.components?.schemas?.[FRAMEWORK_SCHEMA_MAP[agentType]];
        console.log('schema', schema);
        // Patch schema labels if needed
        if (schema && agentType === 'ADK') {
            const patched = JSON.parse(JSON.stringify(schema));
            if (patched.properties?.agent) {
                patched.properties.agent.title = 'Agent Definition Path';
            }
            console.log('patched', patched);
            return patched;
        }

        return schema;
    };

    if (!isOpen) return null;

    return (
        <PageContainer>
            <Backdrop onClick={onClose} />
            <ModalWindow>
                <ModalHeader>
                    <div>
                        <ModalTitle>{mode === 'edit' ? t('agent-form.edit-title', 'Edit Agent') : t('agent-form.title')}</ModalTitle>
                        <ModalSubtitle>Step {currentStep} of 3</ModalSubtitle>
                    </div>
                    <CloseButton onClick={onClose}><X size={24} /></CloseButton>
                </ModalHeader>

                {mode === 'edit' && (
                    <WarningBanner>
                        <AlertTriangle size={16} />
                        <span>Updating the agent will overwrite its configuration. Please ensure all desired settings are selected below.</span>
                    </WarningBanner>
                )}

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
                                                        <InputLabel>{t('agent-form.name.label')}<RequiredAsterisk>*</RequiredAsterisk></InputLabel>
                                                        <StyledInput placeholder={t('agent-form.name.placeholder')} value={name} onChange={e => setName(e.target.value)} />
                                                    </FieldWrapper>
                                                    <FieldWrapper style={{ flex: 1 }}>
                                                        <InputLabel>Version</InputLabel>
                                                        <StyledInput placeholder="1.0.0" value={version} onChange={handleVersionChange} />
                                                    </FieldWrapper>
                                                </Row>
                                                <FieldWrapper>
                                                    <InputLabel>Base URL</InputLabel>
                                                    <StyledInput placeholder="https://api.example.com" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                                                </FieldWrapper>
                                                <FieldWrapper>
                                                    <InputLabel>Description</InputLabel>
                                                    <StyledTextarea placeholder="Describe the agent's purpose..." rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                                                </FieldWrapper>
                                                <A2ARow>
                                                    <A2ALogo src="https://www.a2aprotocol.org/logo.png" alt="A2A" />
                                                    <A2ALabel>
                                                        <Checkbox
                                                            type="checkbox"
                                                            checked={!!agentConfig.a2a}
                                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, a2a: e.target.checked }))}
                                                        />
                                                        Agent2Agent (A2A) Protocol
                                                    </A2ALabel>
                                                </A2ARow>
                                            </IdentityFields>
                                        </IdentityRow>
                                    </IdentityColumn>
                                    <RuntimeColumn>
                                        <SectionTitle><SectionIndicator $color="blue" /> Runtime</SectionTitle>
                                        <FieldWrapper>
                                            <InputLabel>Target Environment</InputLabel>
                                            <div style={{ position: 'relative' }}>
                                                <Server size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: '#6b7280' }} />
                                                <StyledSelect value={environment || ''} onChange={e => setEnvironment(e.target.value as any)} style={{ paddingLeft: '36px' }}>
                                                    <option value="development">Development</option>
                                                    <option value="staging">Staging</option>
                                                    <option value="production">Production</option>
                                                </StyledSelect>
                                            </div>
                                        </FieldWrapper>
                                        <FieldWrapper>
                                            <InputLabel>Server Port</InputLabel>
                                            <StyledInput placeholder="8000" value={serverPort} onChange={e => setServerPort(e.target.value)} />
                                        </FieldWrapper>
                                        <FieldWrapper>
                                            <InputLabel>Agent Framework<RequiredAsterisk>*</RequiredAsterisk></InputLabel>
                                            <FrameworkList>
                                                {frameworkOptions.map((f) => (
                                                    <FrameworkOption key={f.id} $isSelected={agentType === f.id} onClick={() => {
                                                        setAgentType(f.id);
                                                        if (f.id === 'ADK') setSelectedMemoryType('AdkInMemory');
                                                        else if (f.id === 'LANGGRAPH') setSelectedMemoryType('InMemoryCheckpointConfig');
                                                        else setSelectedMemoryType('');
                                                        setSelectedMemoryAppId('');
                                                    }} type="button">
                                                        <span>{f.label}</span>
                                                        {agentType === f.id && <CheckCircle><Check size={10} color="white" /></CheckCircle>}
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
                                        <SectionTitle><SectionIndicator $color="emerald" /> Agent Configuration</SectionTitle>
                                        {schemaError ? (
                                            <ErrorMessage>{schemaError}</ErrorMessage>
                                        ) : getCurrentSchema() ? (
                                            <DynamicForm
                                                schema={getCurrentSchema()}
                                                data={agentConfig}
                                                onChange={setAgentConfig}
                                                rootSchema={rootSchema}
                                                excludeFields={['checkpointer', 'observability', 'memory_service', 'session_service']}
                                            />
                                        ) : (
                                            <EmptyText>Loading schema...</EmptyText>
                                        )}
                                    </LogicColumn>

                                    <DataColumn>
                                        <SectionTitle><SectionIndicator $color="yellow" /> Data Connections</SectionTitle>

                                        {/* Memory Section */}
                                        {agentType !== 'ADK' && (
                                            <FieldWrapper>
                                                <InputLabel><Database size={14} style={{ marginRight: '6px' }} />
                                                    Memory (Checkpointer)
                                                </InputLabel>
                                                <StyledSelect value={selectedMemoryType} onChange={e => { setSelectedMemoryType(e.target.value); setSelectedMemoryAppId(''); }}>
                                                    <option value="">No Memory</option>
                                                    <option value="InMemoryCheckpointConfig">InMemoryCheckpointConfig</option>
                                                    {availableMemoryTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                                </StyledSelect>
                                                {selectedMemoryType && selectedMemoryType !== 'InMemoryCheckpointConfig' && (
                                                    <CardGrid>
                                                        <AddConfigCard onClick={() => handleCreateApp(selectedMemoryType as AppType, 'Memory')}>
                                                            <Plus size={20} />
                                                            <span>New</span>
                                                        </AddConfigCard>
                                                        {getFilteredMemoryApps().map(app => (
                                                            <ConfigCard key={app.id} $selected={selectedMemoryAppId === app.id} onClick={() => setSelectedMemoryAppId(app.id)}>
                                                                <CardHeader>
                                                                    <CardTitle>{app.name}</CardTitle>
                                                                    <MiniIconButton onClick={(e) => handleViewApp(e, app)}><Eye size={12} /></MiniIconButton>
                                                                </CardHeader>
                                                                <CardMeta>{formatDate(app.updatedAt)}</CardMeta>
                                                            </ConfigCard>
                                                        ))}
                                                    </CardGrid>
                                                )}
                                            </FieldWrapper>
                                        )}

                                        {/* Observability Section */}
                                        <FieldWrapper>
                                            <InputLabel><Layers size={14} style={{ marginRight: '6px' }} />Observability</InputLabel>
                                            <MultiSelectContainer>
                                                {OBSERVABILITY_TYPES.map(type => (
                                                    <TypeCheckbox key={type} $checked={selectedObservabilityTypes.includes(type)} onClick={() => toggleObservabilityType(type)}>
                                                        <span className="checkbox">{selectedObservabilityTypes.includes(type) && <Check size={10} color="white" />}</span>
                                                        {type}
                                                    </TypeCheckbox>
                                                ))}
                                            </MultiSelectContainer>
                                            {selectedObservabilityTypes.map(type => (
                                                <div key={type} style={{ marginTop: '16px' }}>
                                                    <TypeHeader>
                                                        {type}
                                                        <AddButton onClick={() => handleCreateApp(type as AppType, 'Observability')}><Plus size={12} style={{ marginRight: '4px' }} />Add</AddButton>
                                                    </TypeHeader>
                                                    <Carousel>
                                                        <AddConfigCard
                                                            style={{ minWidth: '140px', height: 'auto', aspectRatio: 'unset' }}
                                                            onClick={() => handleCreateApp(type as AppType, 'Observability')}
                                                        >
                                                            <Plus size={24} color="#8c52ff" />
                                                            <span>Add New</span>
                                                        </AddConfigCard>
                                                        {getFilteredObservabilityApps(type).map(app => (
                                                            <ConfigCard key={app.id} $selected={selectedObservabilityApps[type] === app.id} onClick={() => selectObservabilityApp(type, app.id)} style={{ minWidth: '140px', flexShrink: 0 }}>
                                                                <CardHeader>
                                                                    <CardTitle>{app.name}</CardTitle>
                                                                    <MiniIconButton onClick={(e) => handleViewApp(e, app)}><Eye size={12} /></MiniIconButton>
                                                                </CardHeader>
                                                                <CardMeta>{formatDate(app.updatedAt)}</CardMeta>
                                                            </ConfigCard>
                                                        ))}
                                                        {getFilteredObservabilityApps(type).length === 0 && (
                                                            <EmptyText style={{ marginLeft: '12px', alignSelf: 'center' }}>No {type} configs yet.</EmptyText>
                                                        )}
                                                    </Carousel>
                                                </div>
                                            ))}
                                        </FieldWrapper>
                                    </DataColumn>
                                </StepGrid>
                            </StepContainer>
                        )}

                        {currentStep === 3 && (
                            <StepContainer>
                                <StepGrid style={{ gridTemplateColumns: '1fr' }}>
                                    {/* MCP Servers */}
                                    <div>
                                        <SectionTitle><SectionIndicator $color="purple" /><Zap size={16} style={{ marginRight: '8px' }} />MCP Servers</SectionTitle>
                                        {mcpApps.length === 0 ? (
                                            <EmptyState>
                                                <p>No MCP servers configured.</p>
                                                <AddButton onClick={() => handleCreateApp('MCPServer', 'MCP')} style={{ marginTop: '12px' }}>
                                                    <Plus size={14} style={{ marginRight: '4px' }} />Add MCP Server
                                                </AddButton>
                                            </EmptyState>
                                        ) : (
                                            <>
                                                <AddButton onClick={() => handleCreateApp('MCPServer', 'MCP')} style={{ marginBottom: '16px' }}>
                                                    <Plus size={14} style={{ marginRight: '4px' }} />Add New
                                                </AddButton>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(315px, 1fr))', gap: '16px' }}>
                                                    {mcpApps.map(app => (
                                                        <SafetyCardContainer key={app.id} $enabled={selectedMCPIds.includes(app.id)} onClick={() => toggleMCP(app.id)}>
                                                            <SafetyCardHeader>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <Server size={16} color="#8c52ff" />
                                                                    <SafetyTitle $enabled={selectedMCPIds.includes(app.id)}>{app.name}</SafetyTitle>
                                                                </div>
                                                                <SafetyCheckbox $checked={selectedMCPIds.includes(app.id)}>
                                                                    {selectedMCPIds.includes(app.id) && <Check size={12} />}
                                                                </SafetyCheckbox>
                                                            </SafetyCardHeader>
                                                            <SafetyFooter>
                                                                <SafetyDesc>{app.config.url || app.config.command || 'MCP Server'}</SafetyDesc>
                                                            </SafetyFooter>
                                                        </SafetyCardContainer>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Guardrails */}
                                    <div>
                                        <SectionTitle><SectionIndicator $color="blue" /><Shield size={16} style={{ marginRight: '8px' }} />Guardrails</SectionTitle>

                                        {guardApps.length > 0 && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(315px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                                                {guardApps.map(app => {
                                                    const risk = getRiskLevel(app.type);
                                                    return (
                                                        <SafetyCardContainer key={app.id} $enabled={selectedGuardIds.includes(app.id)} $risk={risk.label.split(' ')[0]} onClick={() => toggleGuard(app.id)}>
                                                            <SafetyCardHeader>
                                                                <div>
                                                                    <Shield size={16} color={risk.color === 'red' ? '#ef4444' : '#8c52ff'} style={{ marginBottom: '4px' }} />
                                                                    <SafetyTitle $enabled={selectedGuardIds.includes(app.id)}>{app.name}</SafetyTitle>
                                                                </div>
                                                                <SafetyCheckbox $checked={selectedGuardIds.includes(app.id)} $risk={risk.label.split(' ')[0]}>
                                                                    {selectedGuardIds.includes(app.id) && <Check size={12} />}
                                                                </SafetyCheckbox>
                                                            </SafetyCardHeader>
                                                            <SafetyFooter>
                                                                <RiskTag $color={risk.color}>{risk.label}</RiskTag>
                                                            </SafetyFooter>
                                                        </SafetyCardContainer>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {!isGuardrailMarketplaceVisible ? (
                                            <AddButton onClick={() => setIsGuardrailMarketplaceVisible(true)}>
                                                <Plus size={14} style={{ marginRight: '4px' }} />
                                                Show available guardrails
                                            </AddButton>
                                        ) : (
                                            <div style={{ marginTop: '16px', animation: 'fadeIn 0.3s', backgroundColor: '#0B0A15', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                    <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Available Guardrails</span>
                                                    <CloseButton onClick={() => setIsGuardrailMarketplaceVisible(false)} style={{ padding: '4px' }}><X size={14} /></CloseButton>
                                                 </div>
                                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                                                    {MARKETPLACE_APPS.filter(a => a.category === 'Guardrails').map(a => (
                                                        <AddConfigCard key={a.type} onClick={() => { handleCreateApp(a.type as AppType, 'Guardrails'); setIsGuardrailMarketplaceVisible(false); }}>
                                                            <Plus size={20} />
                                                            <span style={{ textAlign: 'center' }}>{a.name}</span>
                                                        </AddConfigCard>
                                                    ))}
                                                 </div>
                                            </div>
                                        )}

                                        {guardApps.length === 0 && !isGuardrailMarketplaceVisible && (
                                            <EmptyText style={{ marginTop: '8px' }}>No guardrails configured.</EmptyText>
                                        )}
                                    </div>
                                </StepGrid>
                            </StepContainer>
                        )}

                        {submitError && <ErrorMessage>{submitError}</ErrorMessage>}
                    </StyledForm>
                </ModalBody>

                <ModalFooter>
                    <CancelButton onClick={onClose}>Cancel</CancelButton>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {currentStep > 1 && (
                            <BackButton onClick={prevStep}>
                                <ChevronLeft size={16} style={{ marginRight: '4px' }} />
                                Back
                            </BackButton>
                        )}
                        {currentStep < 3 ? (
                            <NextButton onClick={nextStep}>
                                Next
                                <ChevronRight size={16} style={{ marginLeft: '4px' }} />
                            </NextButton>
                        ) : (
                            <DeployButton onClick={handleSubmitForm} disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : (mode === 'edit' ? 'Save Changes' : 'Create Agent')}
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
const WarningBanner = styled.div`
    background-color: rgba(234, 179, 8, 0.1);
    border: 1px solid rgba(234, 179, 8, 0.2);
    border-radius: 8px;
    padding: 12px 16px;
    margin: 0 32px 16px 32px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #facc15;
    font-size: 13px;

    svg {
        flex-shrink: 0;
    }
`;
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
const RequiredAsterisk = styled.span` color: #ef4444; margin-left: 4px; `;
const StyledInput = styled.input` width: 100%; background-color: #0B0A15; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 16px; font-size: 14px; color: white; outline: none; transition: all 0.2s; &:focus { border-color: #8c52ff; box-shadow: 0 0 0 1px #8c52ff; } &::placeholder { color: #374151; } `;
const StyledTextarea = styled.textarea` width: 100%; background-color: #0B0A15; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 16px; font-size: 14px; color: white; outline: none; transition: all 0.2s; resize: none; &:focus { border-color: #8c52ff; box-shadow: 0 0 0 1px #8c52ff; } &::placeholder { color: #374151; } `;
const StyledSelect = styled.select` width: 100%; background-color: #0B0A15; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #d1d5db; outline: none; appearance: none; transition: all 0.2s; cursor: pointer; &:focus { border-color: #8c52ff; } &:hover { border-color: rgba(255, 255, 255, 0.2); } `;
const FrameworkList = styled.div` display: flex; flex-direction: column; gap: 8px; `;
const FrameworkOption = styled.button<{ $isSelected: boolean }>` width: 100%; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; border: 1px solid; transition: all 0.2s; display: flex; align-items: center; justify-content: space-between; cursor: pointer; ${props => props.$isSelected ? `background-color: rgba(140, 82, 255, 0.1); border-color: #8c52ff; color: white;` : `background-color: #0B0A15; border-color: rgba(255, 255, 255, 0.1); color: #9ca3af; &:hover { border-color: rgba(255, 255, 255, 0.2); background-color: rgba(255, 255, 255, 0.05); }`} `;
const CheckCircle = styled.div` width: 16px; height: 16px; background-color: #8c52ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; `;
const ErrorMessage = styled.p` margin-top: 8px; margin-bottom: 0; font-size: 14px; font-family: inherit; font-weight: 400; color: #ff4757; line-height: 1.5; `;

// Card Components
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
    -ms-overflow-style: none;
    scrollbar-width: none;
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

const A2ARow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    padding: 12px;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

    &:hover {
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
        border-color: rgba(140, 82, 255, 0.3);
        transform: translateY(-1px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
`;

const A2ALogo = styled.img`
    width: 32px;
    height: 32px;
    border-radius: 4px;
`;

const A2ALabel = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: white;
    font-size: 14px;
    font-weight: 500;
    user-select: none;
`;

const Checkbox = styled.input`
    accent-color: #8c52ff;
    width: 16px;
    height: 16px;
    cursor: pointer;
`;
