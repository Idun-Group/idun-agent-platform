import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { lazy, Suspense, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import Ajv, { type ValidateFunction } from 'ajv';
import { useAuth } from '../../hooks/use-auth';
import { Button } from '../../components/general/button/component';
import {
    getAgent,
    patchAgent,
    type BackendAgent,
} from '../../services/agents';
import Loader from '../../components/general/loader/component';
import { TextInput } from '../../components/general/form/component';
import { useLocation } from 'react-router-dom';
import type { components } from '../../generated/agent-manager';
import managerOpenApi from '../../../schema/manager-openapi.json';
// const CodeTab = lazy(
//     () => import('../../components/agent-detail/tabs/code-tab/component')
// );
const OverviewTab = lazy(
    () => import('../../components/agent-detail/tabs/overview-tab/component')
);
const ActivityTab = lazy(
    () => import('../../components/agent-detail/tabs/activity-tab/component')
);
const ConfigurationTab = lazy(
    () =>
        import('../../components/agent-detail/tabs/configuration-tab/component')
);
const LogsTab = lazy(
    () => import('../../components/agent-detail/tabs/logs-tab/component')
);

const GatewayTab = lazy(
    () => import('../../components/agent-detail/tabs/gateway-tab/component')
);

type AgentFramework = components['schemas']['AgentFramework'];
type EngineConfigInput = components['schemas']['EngineConfig-Input'];
type ManagedAgentPatch = components['schemas']['ManagedAgentPatch'];

const createEngineConfigValidator = (): ValidateFunction | null => {
    try {
        const ajv = new Ajv({ allErrors: true });
        const schemas = (managerOpenApi as any)?.components?.schemas ?? {};

        Object.entries(schemas).forEach(([name, schema]) => {
            ajv.addSchema({
                $id: `#/components/schemas/${name}`,
                ...(schema as object),
            });
        });

        return ajv.compile({
            $ref: '#/components/schemas/EngineConfig-Input',
        });
    } catch (err) {
        console.error('Failed to initialise engine config validator', err);
        return null;
    }
};

const engineConfigValidator = createEngineConfigValidator();

// Styled Components
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 80px); /* Account for navbar height */
    background-color: #0f1016;
    color: white;
    font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
`;

const Header = styled.header`
    padding: 20px 32px;
    border-bottom: 1px solid #1e1e1e;
    display: flex;
    align-items: center;
    gap: 16px;
    background-color: #0f1016;
`;

const Content = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 24px; /* add left/right breathing room */
`;

const AgentHeader = styled.div`
    padding: 24px 32px;
    margin: 0 24px; /* align with content padding */
    border-bottom: 1px solid #1e1e1e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #0f1016;
`;

const AgentInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
`;

const Avatar = styled.div`
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #8c52ff 0%, #ff6b9d 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 18px;
    color: white;
`;

const AgentDetails = styled.div`
    h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
        color: white;
    }

    p {
        margin: 4px 0 0 0;
        color: #8e8e93;
        font-size: 14px;
    }
`;

const AgentTitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const MetaRow = styled.div`
    display: flex;
    gap: 16px;
    margin-top: 8px;
`;

const MetaItem = styled.span`
    font-size: 12px;
    color: #9ca3af;
`;

const StatusBadge = styled.span<{ status: string }>`
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    background-color: ${(props) =>
        props.status === 'active' ? '#1d4ed8' : '#374151'};
    color: ${(props) => (props.status === 'active' ? '#dbeafe' : '#9ca3af')};
`;

const Controls = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const TabContainer = styled.div`
    display: flex;
    background-color: #0f1016;
    border-bottom: 1px solid #1e1e1e;
    padding: 0 32px;
    margin: 0 24px 16px; /* horizontal margin to match content */
`;

const Tab = styled.button<{ active: boolean }>`
    background: none;
    border: none;
    color: ${(props) => (props.active ? '#8c52ff' : '#8e8e93')};
    font-size: 14px;
    font-weight: 500;
    padding: 16px 24px;
    cursor: pointer;
    border-bottom: 2px solid
        ${(props) => (props.active ? '#8c52ff' : 'transparent')};
    transition: all 0.2s ease;

    &:hover {
        color: ${(props) => (props.active ? '#8c52ff' : '#ffffff')};
    }
`;

const ErrorContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 48px 24px;
`;

const ErrorMessage = styled.div`
    text-align: center;
    max-width: 500px;
    
    h2 {
        font-size: 24px;
        font-weight: 600;
        color: #ef4444;
        margin: 0 0 16px 0;
    }
    
    p {
        font-size: 16px;
        color: var(--color-text-secondary, #8892b0);
        margin: 0 0 24px 0;
        line-height: 1.6;
    }
`;

export default function AgentDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [agent, setAgent] = useState<BackendAgent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [draftFramework, setDraftFramework] =
        useState<AgentFramework>('LANGGRAPH');
    const [draftPort, setDraftPort] = useState('');
    const [agentConfigJson, setAgentConfigJson] = useState('');
    const [agentConfigError, setAgentConfigError] = useState<string | null>(
        null
    );
    const [inputSchemaJson, setInputSchemaJson] = useState('');
    const [outputSchemaJson, setOutputSchemaJson] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [pendingPayload, setPendingPayload] =
        useState<ManagedAgentPatch | null>(null);

    const { session, isLoading: isAuthLoading } = useAuth();
    const location = useLocation();

    useEffect(() => {
        if (!id || isAuthLoading) return;
        // Auth guard temporarily disabled, fetch agent regardless of session
        getAgent(id)
            .then(setAgent)
            .catch((e) => {
                const errorMsg = e instanceof Error ? e.message : 'Failed to load agent';
                setError(errorMsg);
                console.error('Error loading agent:', e);
            });
    }, [id, isAuthLoading]);

    const tabs = [
        { id: 'overview', label: "Vue d'ensemble" },
        { id: 'gateway', label: 'API Gateway' },
        // Activity temporarily hidden
        { id: 'configuration', label: 'Configuration' },
        { id: 'logs', label: 'Logs' },
        // { id: 'code', label: 'Code' },
    ];

    const getLangfuseUrl = (): string => {
        const maybe = (agent as any)?.run_config?.env?.LANGFUSE_HOST as string | undefined;
        if (maybe && typeof maybe === 'string' && !maybe.includes('${')) return maybe;
        return 'https://cloud.langfuse.com';
    };

    const handleTabClick = (id: string) => {
        if (id === 'logs') {
            if (typeof window !== 'undefined') {
                const url = getLangfuseUrl();
                window.open(url, '_blank');
            }
            return;
        }
        setActiveTab(id);
    };
    
    const getAgentInitials = (): string => {
        if (!agent?.name) return '...';
        
        const words = agent.name.trim().split(/\s+/);
        if (words.length === 1) {
            // Single word: take first two letters
            return words[0].substring(0, 2).toUpperCase();
        }
        
        // Multiple words: take first letter of each word (max 2)
        return words
            .slice(0, 2)
            .map(word => word.charAt(0).toUpperCase())
            .join('');
    };

    const jsonEditorOptions = {
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        formatOnPaste: true,
        formatOnType: true,
        automaticLayout: true,
        fontSize: 14,
        tabSize: 2,
        insertSpaces: true,
        lineNumbers: 'off' as const,
        folding: false,
    };

    const updateSchemaPreviewFromConfig = (config: unknown) => {
        if (config && typeof config === 'object' && !Array.isArray(config)) {
            const cfg = config as Record<string, unknown>;
            const input = cfg.input_schema_definition ?? null;
            const output = cfg.output_schema_definition ?? null;
            setInputSchemaJson(
                input ? JSON.stringify(input, null, 2) : ''
            );
            setOutputSchemaJson(
                output ? JSON.stringify(output, null, 2) : ''
            );
        } else {
            setInputSchemaJson('');
            setOutputSchemaJson('');
        }
    };

    const initializeDraftFromAgent = (current: BackendAgent) => {
        setDraftName(current.name ?? '');
        const framework =
            (current.engine_config?.agent?.type ??
                current.framework ??
                'LANGGRAPH') as AgentFramework;
        setDraftFramework(framework);
        const portValue = current.engine_config?.server?.api?.port;
        setDraftPort(
            portValue !== undefined && portValue !== null
                ? String(portValue)
                : ''
        );
        const config =
            current.engine_config?.agent?.config ??
            {};
        setAgentConfigJson(JSON.stringify(config, null, 2));
        setAgentConfigError(null);
        setSaveError(null);
        updateSchemaPreviewFromConfig(config);
    };

    const handleAgentConfigChange = (value: string | undefined) => {
        const nextValue = value ?? '';
        setAgentConfigJson(nextValue);
        try {
            const parsed = nextValue.trim() ? JSON.parse(nextValue) : {};
            updateSchemaPreviewFromConfig(parsed);
        } catch {
            // Ignore parse errors while user is typing; previews will update when JSON is valid.
        }
    };

    const handleStartEditing = () => {
        if (!agent) return;
        initializeDraftFromAgent(agent);
        setIsEditing(true);
    };

    const handleCancelEditing = () => {
        if (isSaving) return;
        if (agent) {
            initializeDraftFromAgent(agent);
        }
        setIsEditing(false);
        setAgentConfigError(null);
        setSaveError(null);
        setPendingPayload(null);
        setIsConfirmModalOpen(false);
    };

    const buildPayload = (): ManagedAgentPatch | null => {
        if (!agent) return null;

        const trimmedName = draftName.trim();
        if (!trimmedName) {
            setSaveError("Le nom de l'agent est requis.");
            return null;
        }

        if (agentConfigError) {
            setSaveError(
                'Corrigez la configuration JSON avant de sauvegarder.'
            );
            return null;
        }

        let parsedConfig: unknown;
        try {
            parsedConfig = agentConfigJson.trim()
                ? JSON.parse(agentConfigJson)
                : {};
            setAgentConfigError(null);
        } catch (err) {
            setAgentConfigError('JSON invalide');
            setSaveError(
                'Impossible de sauvegarder tant que la configuration JSON est invalide.'
            );
            return null;
        }

        const trimmedPort = draftPort.trim();
        let parsedPort: number | undefined;
        if (trimmedPort) {
            const maybePort = Number(trimmedPort);
            if (Number.isNaN(maybePort)) {
                setSaveError('Le port API doit être un nombre.');
                return null;
            }
            parsedPort = maybePort;
        }

        let serverClone: EngineConfigInput['server'] | undefined =
            agent.engine_config?.server
                ? (JSON.parse(
                      JSON.stringify(agent.engine_config.server)
                  ) as EngineConfigInput['server'])
                : undefined;

        if (parsedPort !== undefined) {
            if (!serverClone) serverClone = {};
            serverClone.api = { ...(serverClone.api ?? {}), port: parsedPort };
        } else if (serverClone?.api?.port !== undefined) {
            delete serverClone.api;
            if (serverClone && Object.keys(serverClone).length === 0) {
                serverClone = undefined;
            }
        }

        const agentClone = {
            ...(agent.engine_config?.agent
                ? JSON.parse(JSON.stringify(agent.engine_config.agent))
                : { type: draftFramework, config: parsedConfig }),
        } as EngineConfigInput['agent'];
        agentClone.type = draftFramework;
        (agentClone as any).config = parsedConfig;

        const engineConfig: EngineConfigInput = {
            agent: agentClone,
        };
        if (serverClone) {
            engineConfig.server = serverClone;
        }

        if (engineConfigValidator) {
            const isValid = engineConfigValidator(engineConfig as unknown);
            if (!isValid) {
                const messages =
                    engineConfigValidator.errors
                        ?.map((err) => {
                            const path =
                                'instancePath' in err &&
                                typeof err.instancePath === 'string'
                                    ? err.instancePath
                                    : err.schemaPath;
                            return `${path} ${err.message ?? ''}`.trim();
                        })
                        .join(', ') ?? 'Configuration invalide.';
                setAgentConfigError(messages);
                setSaveError(
                    'La configuration JSON ne correspond pas au schéma attendu.'
                );
                return null;
            }
        }

        setSaveError(null);
        return {
            name: trimmedName,
            engine_config: engineConfig,
        };
    };

    const handleSaveClick = () => {
        const payload = buildPayload();
        if (!payload) return;
        setPendingPayload(payload);
        setIsConfirmModalOpen(true);
    };

    const handleConfirmSave = async () => {
        if (!agent || !pendingPayload) return;
        setIsConfirmModalOpen(false);
        setIsSaving(true);
        setSaveError(null);

        try {
            const updatedAgent = await patchAgent(agent.id, pendingPayload);
            setAgent(updatedAgent);
            initializeDraftFromAgent(updatedAgent);
            setIsEditing(false);
            setAgentConfigError(null);
            setSaveError(null);
            setPendingPayload(null);
        } catch (err) {
            setSaveError(
                err instanceof Error
                    ? err.message
                    : 'Impossible de mettre à jour cet agent.'
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelConfirm = () => {
        setIsConfirmModalOpen(false);
        setPendingPayload(null);
    };

    const renderTabContent = () => (
        <Suspense fallback={<Loader />}>
            {
                {
                    overview: <OverviewTab agent={agent} />,
                    gateway: <GatewayTab agent={agent} />,
                    activity: <ActivityTab />,
                    configuration: <ConfigurationTab agent={agent} />,
                    logs: <LogsTab />,
                    // code: <CodeTab />,
                }[activeTab]
            }
        </Suspense>
    );

    if (error) {
        return (
            <PageContainer>
                <Header>
                    <Button
                        $variants="transparent"
                        $color="secondary"
                        onClick={() => navigate('/agents')}
                    >
                        Retour
                    </Button>
                </Header>
                <Content>
                    <ErrorContainer>
                        <ErrorMessage>
                            <h2>Failed to load agent</h2>
                            <p>{error}</p>
                            <Button 
                                $variants="base" 
                                $color="primary"
                                onClick={() => window.location.reload()}
                            >
                                Retry
                            </Button>
                        </ErrorMessage>
                    </ErrorContainer>
                </Content>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <Header>
                <Button
                    $variants="transparent"
                    $color="secondary"
                    onClick={() => navigate('/agents')}
                >
                    Retour
                </Button>
            </Header>

            <Content>
                <AgentHeader>
                    <AgentInfo>
                        <Avatar>{getAgentInitials()}</Avatar>
                        <AgentDetails>
                            <AgentTitleRow>
                                <h1>{agent?.name ?? '...'}</h1>
                                <StatusBadge status={(agent?.status || 'draft').toLowerCase()}>
                                    {agent?.status ?? 'draft'}
                                </StatusBadge>
                            </AgentTitleRow>
                            {agent?.description ? <p>{agent.description}</p> : null}
                            {agent?.framework ? (
                                <MetaRow>
                                    <MetaItem>
                                        Framework: {agent.framework}
                                    </MetaItem>
                                    {agent?.created_at ? (
                                        <MetaItem>
                                            Created: {new Date(agent.created_at).toLocaleString()}
                                        </MetaItem>
                                    ) : null}
                                    {agent?.updated_at ? (
                                        <MetaItem>
                                            Updated: {new Date(agent.updated_at).toLocaleString()}
                                        </MetaItem>
                                    ) : null}
                                </MetaRow>
                            ) : null}
                        </AgentDetails>
                    </AgentInfo>
                    <Controls>
                        {isEditing ? (
                            <>
                                <Button
                                    $variants="transparent"
                                    $color="secondary"
                                    onClick={handleCancelEditing}
                                    disabled={isSaving}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    $variants="base"
                                    $color="primary"
                                    onClick={handleSaveClick}
                                    disabled={isSaving}
                                >
                                    {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    $variants="transparent"
                                    $color="secondary"
                                    onClick={handleStartEditing}
                                    disabled={!agent}
                                >
                                    Modifier
                                </Button>
                                <Button $variants="transparent" $color="secondary" disabled>
                                    Pause
                                </Button>
                                <Button $variants="base" $color="primary" disabled>
                                    Exécuter
                                </Button>
                            </>
                        )}
                    </Controls>
                </AgentHeader>

                {isEditing ? (
                    <>
                        <EditFormContainer>
                        <EditFormHeader>
                            <EditFormTitle>Modifier l&apos;agent</EditFormTitle>
                            <EditFormSubtitle>
                                Mettez à jour le nom, le port et la configuration JSON de l&apos;agent.
                            </EditFormSubtitle>
                        </EditFormHeader>

                        {saveError ? (
                            <ErrorBanner role="alert">{saveError}</ErrorBanner>
                        ) : null}

                        <EditFormGrid>
                            <TextInput
                                label="Nom de l'agent"
                                value={draftName}
                                placeholder="Nom de l'agent"
                                onChange={(event) => setDraftName(event.target.value)}
                                disabled={isSaving}
                            />

                            <ReadOnlyField>
                                <span className="label">Framework</span>
                                <span className="value">{draftFramework}</span>
                            </ReadOnlyField>

                            <TextInput
                                label="Port API"
                                value={draftPort}
                                placeholder="8000"
                                onChange={(event) => setDraftPort(event.target.value)}
                                disabled={isSaving}
                            />
                        </EditFormGrid>

                        <EditorSection>
                            <SectionLabel>
                                Configuration de l&apos;agent (JSON)
                            </SectionLabel>
                            <Editor
                                height="320px"
                                language="json"
                                theme="vs-dark"
                                value={agentConfigJson}
                                onChange={handleAgentConfigChange}
                                options={jsonEditorOptions}
                                onValidate={(markers) => {
                                    if (!markers.length) {
                                        setAgentConfigError(null);
                                        return;
                                    }
                                    setAgentConfigError('Syntaxe JSON invalide');
                                }}
                            />
                            <HelperText>
                                Modifiez la configuration JSON. Le format doit être valide pour enregistrer les modifications.
                            </HelperText>
                            {agentConfigError ? (
                                <FieldError>{agentConfigError}</FieldError>
                            ) : null}
                        </EditorSection>
                        <JsonDisplaySection>
                            <SectionLabel>
                                Input Schema Definition (JSON)
                            </SectionLabel>
                            <JsonDisplay>
                                {inputSchemaJson ? (
                                    <pre>{inputSchemaJson}</pre>
                                ) : (
                                    <PlaceholderText>
                                        Aucune définition fournie
                                    </PlaceholderText>
                                )}
                            </JsonDisplay>
                        </JsonDisplaySection>
                        <JsonDisplaySection>
                            <SectionLabel>
                                Output Schema Definition (JSON)
                            </SectionLabel>
                            <JsonDisplay>
                                {outputSchemaJson ? (
                                    <pre>{outputSchemaJson}</pre>
                                ) : (
                                    <PlaceholderText>
                                        Aucune définition fournie
                                    </PlaceholderText>
                                )}
                            </JsonDisplay>
                        </JsonDisplaySection>
                    </EditFormContainer>
                    {isConfirmModalOpen && (
                        <ConfirmOverlay>
                            <ConfirmModal role="dialog" aria-modal="true">
                                <ConfirmTitle>Confirmer les modifications</ConfirmTitle>
                                <ConfirmBody>
                                    Êtes-vous sûr de vouloir enregistrer les modifications apportées à cet agent&nbsp;?
                                </ConfirmBody>
                                <ConfirmActions>
                                    <Button
                                        $variants="transparent"
                                        $color="secondary"
                                        onClick={handleCancelConfirm}
                                        disabled={isSaving}
                                    >
                                        Annuler
                                    </Button>
                                    <Button
                                        $variants="base"
                                        $color="primary"
                                        onClick={handleConfirmSave}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? 'Enregistrement...' : 'Confirmer'}
                                    </Button>
                                </ConfirmActions>
                            </ConfirmModal>
                        </ConfirmOverlay>
                    )}
                    </>
                ) : (
                    <>
                        <TabContainer>
                            {tabs.map((tab) => (
                                <Tab
                                    key={tab.id}
                                    active={activeTab === tab.id}
                                    onClick={() => handleTabClick(tab.id)}
                                >
                                    {tab.label}
                                </Tab>
                            ))}
                        </TabContainer>

                        <>{renderTabContent()}</>
                    </>
                )}
            </Content>
        </PageContainer>
    );
}

const EditFormContainer = styled.div`
    margin: 24px 24px 48px;
    padding: 24px;
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const EditFormHeader = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const EditFormTitle = styled.h2`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
`;

const EditFormSubtitle = styled.p`
    margin: 0;
    font-size: 14px;
    color: var(--color-text-secondary, #8892b0);
`;

const EditFormGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
`;

const EditorSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SectionLabel = styled.span`
    font-size: 14px;
    font-weight: 600;
`;

const HelperText = styled.span`
    font-size: 13px;
    color: var(--color-text-secondary, #8892b0);
`;

const JsonDisplaySection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const JsonDisplay = styled.div`
    max-height: 240px;
    padding: 16px 20px;
    border-radius: 8px;
    border: 1px solid var(--color-border-primary, #2a3f5f);
    background: rgba(24, 26, 36, 0.8);
    overflow: auto;

    pre {
        margin: 0;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo,
            monospace;
        font-size: 13px;
        line-height: 1.6;
        color: var(--color-text-primary, #ffffff);
        white-space: pre-wrap;
        word-break: break-word;
    }
`;

const PlaceholderText = styled.span`
    color: var(--color-text-secondary, #8892b0);
    font-style: italic;
    font-size: 14px;
`;

const FieldError = styled.span`
    font-size: 13px;
    color: #ef4444;
`;

const ErrorBanner = styled.div`
    padding: 12px 16px;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
    font-size: 14px;
`;

const ConfirmOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(3, 7, 17, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
`;

const ConfirmModal = styled.div`
    width: min(420px, 90vw);
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 20px 48px rgba(2, 6, 23, 0.45);
`;

const ConfirmTitle = styled.h3`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
`;

const ConfirmBody = styled.p`
    margin: 0;
    font-size: 15px;
    color: var(--color-text-secondary, #8892b0);
    line-height: 1.6;
`;

const ConfirmActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
`;

const ReadOnlyField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;

    .label {
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-primary, #ffffff);
    }

    .value {
        padding: 16px 20px;
        border-radius: 8px;
        background: rgba(140, 82, 255, 0.1);
        border: 1px solid rgba(140, 82, 255, 0.2);
        color: var(--color-primary, #8c52ff);
        font-size: 16px;
        font-weight: 600;
    }
`;
