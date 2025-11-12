import Editor from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { FolderIcon, GithubIcon, NetworkIcon, UploadIcon } from 'lucide-react';
import { type ChangeEvent, useEffect, useState } from 'react';
import styled from 'styled-components';
import SourcePopup from '../../components/create-agent/source-popup/component';
import { Button } from '../../components/general/button/component';
import useAgentFile from '../../hooks/use-agent-file';
import { Label } from '../../components/create-agent/popup-styled';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import {
    Form,
    FormSelect,
    LabeledToggleButton,
    TextInput,
} from '../../components/general/form/component';
import ToggleButton from '../../components/general/toggle-button/component';
import { readFileFromZip } from '../../utils/zip-session';
import { extractFrameworkFromYaml, extractObservabilityFromYaml, extractDatabaseFromYaml, normalizeFrameworkName, isFrameworkSupported, SUPPORTED_FRAMEWORKS, parseYamlConfig } from '../../utils/yaml-parser';
import { createAgent } from '../../services/agents';
import { useNavigate } from 'react-router-dom';

const DISABLED_FRAMEWORKS = new Set(['ADK', 'CREWAI', 'CUSTOM']);

export default function AgentFormPage() {
    const navigate = useNavigate();
    const [name, setName] = useState<string>('');
    const [version, setVersion] = useState<string>('v1');
    const [serverPort, setServerPort] = useState<string>('8000');
    const [agentType, setAgentType] = useState<string | null>('LANGGRAPH');
    const [configName, setConfigName] = useState<string>('');
    const [graphDefinition, setGraphDefinition] = useState<string>('');
    const [checkpointerType, setCheckpointerType] = useState<'sqlite' | 'postgres'>('sqlite');
    const [databaseUrl, setDatabaseUrl] = useState<string>('');
    const [haystackComponentType, setHaystackComponentType] =
        useState<'pipeline' | 'agent'>('pipeline');
    const [haystackComponentDefinition, setHaystackComponentDefinition] =
        useState<string>('');
    const [baseInputSchema, setBaseInputSchema] = useState<string>('');
    const [baseOutputSchema, setBaseOutputSchema] = useState<string>('');
    const [langGraphStore, setLangGraphStore] = useState<string>('');
    const [baseInputSchemaError, setBaseInputSchemaError] = useState<string | null>(null);
    const [baseOutputSchemaError, setBaseOutputSchemaError] = useState<string | null>(null);
    const [langGraphStoreError, setLangGraphStoreError] = useState<string | null>(null);
    const [selectedObservabilityProvider, setSelectedObservabilityProvider] =
        useState<string | null>(null);
    const { selectedAgentFile } = useAgentFile();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [availableFrameworks, setAvailableFrameworks] = useState<
        Array<{ id: string; name: string }>
    >([]);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [selectedSourceType, setSelectedSourceType] = useState<
        'upload' | 'Git' | 'remote' | 'project'
    >('upload');
    const [yamlFiles, setYamlFiles] = useState<string[]>([]);
    const [selectedConfigFile, setSelectedConfigFile] = useState<string>('');
    const [detectedFramework, setDetectedFramework] = useState<string | null>(null);
    const [frameworkError, setFrameworkError] = useState<string | null>(null);

    const formatJsonField = (
        value: string,
        setter: (formatted: string) => void,
        errorSetter: (error: string | null) => void
    ) => {
        const trimmed = value.trim();
        if (!trimmed) {
            setter('');
            errorSetter(null);
            return;
        }

        try {
            const parsed = JSON.parse(trimmed);
            setter(JSON.stringify(parsed, null, 2));
            errorSetter(null);
        } catch (error) {
            errorSetter('Invalid JSON');
        }
    };

    const handleLangGraphStoreChange = (value: string | undefined) => {
        setLangGraphStore(value ?? '');
        if (langGraphStoreError) {
            setLangGraphStoreError(null);
        }
    };

    const handleBaseInputSchemaChange = (value: string | undefined) => {
        setBaseInputSchema(value ?? '');
        if (baseInputSchemaError) {
            setBaseInputSchemaError(null);
        }
    };

    const handleBaseOutputSchemaChange = (value: string | undefined) => {
        setBaseOutputSchema(value ?? '');
        if (baseOutputSchemaError) {
            setBaseOutputSchemaError(null);
        }
    };

    const handleLangGraphStoreEditorMount = (
        editorInstance: MonacoEditor.IStandaloneCodeEditor
    ) => {
        editorInstance.onDidBlurEditorText(() => {
            const currentValue = editorInstance.getValue();
            formatJsonField(
                currentValue,
                setLangGraphStore,
                setLangGraphStoreError
            );
        });
    };

    const handleBaseInputSchemaEditorMount = (
        editorInstance: MonacoEditor.IStandaloneCodeEditor
    ) => {
        editorInstance.onDidBlurEditorText(() => {
            const currentValue = editorInstance.getValue();
            formatJsonField(
                currentValue,
                setBaseInputSchema,
                setBaseInputSchemaError
            );
        });
    };

    const handleBaseOutputSchemaEditorMount = (
        editorInstance: MonacoEditor.IStandaloneCodeEditor
    ) => {
        editorInstance.onDidBlurEditorText(() => {
            const currentValue = editorInstance.getValue();
            formatJsonField(
                currentValue,
                setBaseOutputSchema,
                setBaseOutputSchemaError
            );
        });
    };

    const jsonEditorOptions = {
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        formatOnPaste: true,
        formatOnType: true,
        automaticLayout: true,
        wordWrap: 'on' as const,
        lineNumbers: 'off' as const,
    };

    const handleChangesYamlFiles = (files: string[]) => {
        setYamlFiles(files);
        // Reset framework detection when new files are loaded
        setDetectedFramework(null);
        setFrameworkError(null);
        setSelectedConfigFile('');
        setAgentType('LANGGRAPH');
        setConfigName('');
        setGraphDefinition('');
        setDatabaseUrl('');
        setCheckpointerType('sqlite');
        setHaystackComponentDefinition('');
        setBaseInputSchema('');
        setBaseOutputSchema('');
        setLangGraphStore('');
        setBaseInputSchemaError(null);
        setBaseOutputSchemaError(null);
        setLangGraphStoreError(null);
        console.log('YAML files in ZIP:', files);
    };

    // Handle config file selection and read its content
    const handleVersionChange = (event: ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value ?? '';
        const withoutPrefix = rawValue.replace(/^(v|V)+/, '');
        const sanitized = withoutPrefix.replace(/[^0-9a-zA-Z._-]/g, '');
        const normalized = `v${sanitized}`;
        setVersion(normalized || 'v');
    };

    const handleConfigFileChange = async (e: ChangeEvent<HTMLSelectElement>) => {
        const filePath = e.target.value;
        console.log('Config file selected:', filePath);
        console.log('Selected agent file:', selectedAgentFile);
        
        setSelectedConfigFile(filePath);
        setDetectedFramework(null);
        setFrameworkError(null);

        if (!filePath) {
            console.log('No file path selected');
            return;
        }
        
        if (!selectedAgentFile) {
            console.log('No agent file available');
            return;
        }

        try {
            console.log('Reading file from ZIP...');
            const yamlContent = await readFileFromZip(selectedAgentFile.file, filePath);
            console.log('YAML content:', yamlContent);
            
            const framework = extractFrameworkFromYaml(yamlContent);
            console.log('Extracted framework:', framework);

            if (!framework) {
                setFrameworkError('Could not detect framework in the config file. Please ensure your YAML has an "agent.type" field.');
                return;
            }

            const normalizedFramework = normalizeFrameworkName(framework);
            setDetectedFramework(normalizedFramework);

            if (!isFrameworkSupported(framework)) {
                setFrameworkError(
                    `Framework "${normalizedFramework}" is not supported. Supported frameworks: ${SUPPORTED_FRAMEWORKS.join(', ')}`
                );
            } else {
                const upperFramework = normalizedFramework.toUpperCase();
                if (DISABLED_FRAMEWORKS.has(upperFramework)) {
                    const message = `Framework "${upperFramework}" is not enabled yet.`;
                    setFrameworkError(message);
                    setAgentType('LANGGRAPH');
                    toast.error(message);
                } else {
                    setFrameworkError(null);
                    setAgentType(upperFramework);
                    toast.success(`Framework detected: ${upperFramework}`);
                }
            }

            const parsedConfig = parseYamlConfig(yamlContent);

            if (parsedConfig?.agent?.config) {
                const parsedAgentConfig: Record<string, any> = parsedConfig.agent.config;
                if (parsedAgentConfig.name) {
                    setConfigName(parsedAgentConfig.name);
                }
                if (parsedAgentConfig.graph_definition) {
                    setGraphDefinition(parsedAgentConfig.graph_definition);
                }
                if (parsedAgentConfig.checkpointer) {
                    const parsedType = (parsedAgentConfig.checkpointer.type ?? '').toString().toLowerCase();
                    if (parsedType === 'postgres') {
                        setCheckpointerType('postgres');
                    } else {
                        setCheckpointerType('sqlite');
                    }
                    if (parsedAgentConfig.checkpointer.db_url) {
                        setDatabaseUrl(parsedAgentConfig.checkpointer.db_url ?? '');
                    }
                }
                if (parsedAgentConfig.store) {
                    try {
                        setLangGraphStore(
                            JSON.stringify(parsedAgentConfig.store, null, 2)
                        );
                        setLangGraphStoreError(null);
                    } catch (error) {
                        console.warn('Unable to parse store from config', error);
                    }
                }
                if (parsedAgentConfig.component_type) {
                    setHaystackComponentType(parsedAgentConfig.component_type);
                }
                if (parsedAgentConfig.component_definition) {
                    setHaystackComponentDefinition(parsedAgentConfig.component_definition);
                }
                if (parsedAgentConfig.input_schema_definition) {
                    setBaseInputSchema(
                        JSON.stringify(parsedAgentConfig.input_schema_definition, null, 2)
                    );
                    setBaseInputSchemaError(null);
                }
                if (parsedAgentConfig.output_schema_definition) {
                    setBaseOutputSchema(
                        JSON.stringify(parsedAgentConfig.output_schema_definition, null, 2)
                    );
                    setBaseOutputSchemaError(null);
                }
            }

            // Extract and pre-fill observability config
            const observability = extractObservabilityFromYaml(yamlContent);
            console.log('Extracted observability:', observability);
            
            if (observability) {
                if (observability.enabled) {
                    setIsObservabilityEnabled(true);
                }
                
                if (observability.provider) {
                    setSelectedObservabilityProvider(observability.provider.toLowerCase());
                }
                
                if (observability.options) {
                    if (observability.options.host) {
                        setLangfuseHost(observability.options.host);
                    }
                    if (observability.options.public_key) {
                        setLangfusePublicKey(observability.options.public_key);
                    }
                    if (observability.options.secret_key) {
                        setLangfuseSecretKey(observability.options.secret_key);
                    }
                    if (observability.options.run_name) {
                        setLangfuseRunName(observability.options.run_name);
                    }
                }
            }

            // Extract and pre-fill database URL if not already set above
            if (!parsedConfig?.agent?.config?.checkpointer?.db_url) {
                const dbUrl = extractDatabaseFromYaml(yamlContent);
                console.log('Extracted database URL:', dbUrl);
                if (dbUrl) {
                    setDatabaseUrl(dbUrl ?? '');
                }
            }
        } catch (error) {
            console.error('Error reading config file:', error);
            setFrameworkError(`Error reading config file: ${error instanceof Error ? error.message : String(error)}`);
            toast.error('Failed to read config file');
        }
    };


    const handleSourceClick = (
        sourceType: 'upload' | 'Git' | 'remote' | 'project'
    ) => {
        setSelectedSourceType(sourceType);
        setIsPopupOpen(true);
    };


    const [isObservabilityEnabled, setIsObservabilityEnabled] = useState(false);

    // Environment selector (DEV, STAGING, PRODUCTION)
    const [environment, setEnvironment] = useState<'development' | 'staging' | 'production' | null>('development');

    const [langfusePublicKey, setLangfusePublicKey] = useState<string>('');
    const [langfuseHost, setLangfuseHost] = useState<string>('');
    const [langfuseSecretKey, setLangfuseSecretKey] = useState<string>('');
    const [langfuseRunName, setLangfuseRunName] = useState<string>('');

    const [dbUrlError, setDbUrlError] = useState<string | null>(null);
    const handleDatabaseUrlChange = (
        e: ChangeEvent<HTMLInputElement>
    ) => {
        const url = e.target.value;
        setDatabaseUrl(url);

        if (checkpointerType === 'sqlite') {
            if (url && !url.startsWith('sqlite:///')) {
                setDbUrlError('SQLite URLs must start with "sqlite:///"');
            } else {
        setDbUrlError(null);
            }
            return;
        }

        const postgresRegex =
            /^(postgres(?:ql)?:\/\/)([a-zA-Z0-9._%+-]+)(:[^@]+)?@([a-zA-Z0-9.-]+)(:\d+)?\/[a-zA-Z0-9_-]+$/;
        if (url && !postgresRegex.test(url)) {
            setDbUrlError(
                'Postgres URLs must look like postgres://user:password@host:5432/database'
            );
        } else {
            setDbUrlError(null);
        }
    };

    const handleManualCheckpointerTypeChange = (type: 'sqlite' | 'postgres') => {
        setCheckpointerType(type);
        setDbUrlError(null);
        if (!databaseUrl || (type === 'sqlite' && !databaseUrl.startsWith('sqlite:///')) || (type === 'postgres' && !databaseUrl.startsWith('postgres'))) {
            setDatabaseUrl('');
        }
    };

    const { t } = useTranslation();

    const rawFrameworkOptions = (availableFrameworks.length > 0
        ? availableFrameworks.map((framework) => ({
              id: framework.id.toUpperCase(),
              label: framework.name,
          }))
        : SUPPORTED_FRAMEWORKS.map((framework) => ({
              id: framework.toUpperCase(),
              label: framework.replace(/_/g, ' '),
          }))
    )
        .filter((option) => option.id)
        .filter((option) => !DISABLED_FRAMEWORKS.has(option.id));

    const frameworkOptions = Array.from(
        new Map(rawFrameworkOptions.map((option) => [option.id, option])).values()
    );

    useEffect(() => {
        if (!databaseUrl) {
            setDbUrlError(null);
            return;
        }

        if (
            checkpointerType.trim().toLowerCase() === 'sqlite' &&
            !databaseUrl.startsWith('sqlite:///')
        ) {
            setDbUrlError('SQLite URLs must start with "sqlite:///"');
        } else {
            setDbUrlError(null);
        }
    }, [checkpointerType, databaseUrl]);

    const handleClosePopup = () => {
        setIsPopupOpen(false);
    };

    useEffect(() => {
        fetch('http://localhost:4001/api/v1/framework')
            .then((response) => response.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    const normalized = data
                        .map((item: any) => {
                            const id = (item?.id ?? item?.value ?? '')
                                .toString()
                                .trim();

                            if (!id) {
                                return null;
                            }

                            const nameSource = item?.name ?? item?.label;
                            const name = nameSource
                                ? nameSource.toString()
                                : id;

                            return {
                                id,
                                name,
                            } as { id: string; name: string };
                        })
                        .filter((item): item is { id: string; name: string } =>
                            item !== null
                        );

                    setAvailableFrameworks(normalized);
                }
            })
            .catch((error) =>
                console.error('Error fetching frameworks:', error)
            );
    }, []);

    const handleSubmitForm = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        console.log('Submitting create-agent form');

        // Validate required fields
        if (!name.trim()) {
            toast.error('Agent name is required');
            return;
        }

        if (!agentType) {
            toast.error('Please select an agent type');
            return;
        }

        if (!configName.trim()) {
            toast.error('Agent config name is required');
            return;
        }

        const parsedPort = Number(serverPort);
        if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
            toast.error('Please provide a valid server port');
            return;
        }

        if (frameworkError) {
            toast.error(frameworkError);
            return;
        }

        if (agentType === 'LANGGRAPH' && !graphDefinition.trim()) {
            toast.error('Graph definition is required for LangGraph agents');
            return;
        }

        if (
            agentType === 'HAYSTACK' &&
            !haystackComponentDefinition.trim()
        ) {
            toast.error('Component definition is required for Haystack agents');
            return;
        }

        if (baseInputSchemaError || baseOutputSchemaError || langGraphStoreError) {
            toast.error('Please fix invalid JSON fields before submitting');
            return;
        }

        if (dbUrlError) {
            toast.error(dbUrlError);
            return;
        }

        let parsedInputSchema: Record<string, any> | undefined;
        let parsedOutputSchema: Record<string, any> | undefined;
        let parsedStore: Record<string, any> | undefined;

        if (baseInputSchema.trim()) {
            try {
                parsedInputSchema = JSON.parse(baseInputSchema);
            } catch (error) {
                toast.error('Input schema definition must be valid JSON');
                return;
            }
        }

        if (baseOutputSchema.trim()) {
            try {
                parsedOutputSchema = JSON.parse(baseOutputSchema);
            } catch (error) {
                toast.error('Output schema definition must be valid JSON');
                return;
            }
        }

        if (langGraphStore.trim()) {
            try {
                parsedStore = JSON.parse(langGraphStore);
        } catch (error) {
                toast.error('Store must be valid JSON');
                return;
            }
        }

        setIsSubmitting(true);
        setSubmitError(null); // Clear any previous errors

        try {
            const agentConfig: Record<string, any> = {
                name: configName.trim() || name.trim(),
            };

            if (agentType === 'LANGGRAPH') {
                agentConfig.graph_definition = graphDefinition.trim();
                if (databaseUrl.trim()) {
                    agentConfig.checkpointer = {
                        type: checkpointerType,
                        db_url: databaseUrl.trim(),
                    };
                }
                if (parsedStore) {
                    agentConfig.store = parsedStore;
                }
            }

            if (agentType === 'HAYSTACK') {
                agentConfig.type = 'haystack';
                agentConfig.component_type = haystackComponentType;
                agentConfig.component_definition =
                    haystackComponentDefinition.trim();
            }

            if (isObservabilityEnabled && selectedObservabilityProvider) {
                agentConfig.observability = {
                    provider: selectedObservabilityProvider,
                    enabled: true,
                    options: {},
                };

                if (selectedObservabilityProvider === 'langfuse') {
                    if (langfuseHost) {
                        agentConfig.observability.options.host = langfuseHost;
                    }
                    if (langfusePublicKey) {
                        agentConfig.observability.options.public_key =
                            langfusePublicKey;
                    }
                    if (langfuseSecretKey) {
                        agentConfig.observability.options.secret_key =
                            langfuseSecretKey;
                    }
                    if (langfuseRunName) {
                        agentConfig.observability.options.run_name =
                            langfuseRunName;
                    }
                }
            }

            if (parsedInputSchema) {
                agentConfig.input_schema_definition = parsedInputSchema;
            }
            if (parsedOutputSchema) {
                agentConfig.output_schema_definition = parsedOutputSchema;
            }

            const payload = {
                name: name.trim(),
                version: version.trim() || 'v1',
                engine_config: {
                    server: {
                        api: {
                            port: parsedPort,
                        },
                    },
                    agent: {
                        type: agentType,
                        config: agentConfig,
                    },
                },
            };

            console.log('Creating agent with payload:', payload);

            const createdAgent = await createAgent(payload);

            toast.success(`Agent "${createdAgent.name}" created successfully!`);

            setTimeout(() => {
                navigate(`/agents/${createdAgent.id}`);
            }, 1000);
        } catch (error) {
            console.error('Error creating agent:', error);
            
            // Extract error message from the backend response
            let errorMessage = 'Failed to create agent';
            
            if (error instanceof Error) {
                try {
                    // Try to parse JSON error response from backend
                    const parsedError = JSON.parse(error.message);
                    if (parsedError.detail) {
                        // Handle FastAPI validation errors
                        if (Array.isArray(parsedError.detail)) {
                            errorMessage = parsedError.detail
                                .map((err: any) => `${err.loc.join('.')}: ${err.msg}`)
                                .join(', ');
                        } else if (typeof parsedError.detail === 'string') {
                            errorMessage = parsedError.detail;
                        }
                    }
                } catch {
                    // If not JSON, use the error message as-is
                    errorMessage = error.message;
                }
            }
            
            setSubmitError(errorMessage);
            // Don't use toast for errors, display inline instead
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <MainContainer>
            <Header>
                <h1>{t('agent-form.title')}</h1>
                <p>{t('agent-form.description')}</p>
            </Header>

            <Form
                onSubmit={handleSubmitForm}
                onKeyDown={(e: React.KeyboardEvent<HTMLFormElement>) => {
                    if (e.key === 'Enter') {
                        const target = e.target as HTMLElement;
                        const tag = (target.tagName || '').toLowerCase();

                        if (tag === 'input' || tag === 'select') {
                                e.preventDefault();
                        }
                    }
                }}
            >
                    <>
                        <h2>{t('agent-form.general-info')}</h2>

                        <TextInput
                            label={t('agent-form.name.label')}
                            placeholder={t('agent-form.name.placeholder')}
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />

                    <TextInput
                        label="Agent Version"
                        placeholder="e.g., v1"
                        value={version}
                        onChange={handleVersionChange}
                    />

                    <TextInput
                        label="Server Port"
                        type="text"
                        placeholder="8000"
                        value={serverPort}
                        onChange={(e) => setServerPort(e.target.value)}
                    />

                    <LabelWithButtons>
                        <ButtonLabel>Agent Type</ButtonLabel>
                        <SelectButtonContainer>
                            {frameworkOptions.map((framework) => (
                                <SelectButton
                                    type="button"
                                    key={framework.id}
                                    onClick={() => {
                                        setAgentType(framework.id);
                                        setDetectedFramework(framework.id);
                                        setFrameworkError(null);
                                    }}
                                    $selected={agentType === framework.id}
                                >
                                    {framework.label}
                                </SelectButton>
                            ))}
                        </SelectButtonContainer>
                    </LabelWithButtons>

                    <TextInput
                        label="Agent Config Name"
                        placeholder="Enter a config name"
                        required
                        value={configName}
                        onChange={(e) => setConfigName(e.target.value)}
                    />

                    {agentType === 'LANGGRAPH' && (
                        <>
                            <TextInput
                                label="Graph Definition"
                                placeholder="./path/to/file.py:app"
                                required
                                value={graphDefinition}
                                onChange={(e) => setGraphDefinition(e.target.value)}
                            />
                            <JsonEditorContainer>
                                <JsonEditorLabel>Store (JSON)</JsonEditorLabel>
                                <JsonEditorWrapper>
                                    <Editor
                                        height="220px"
                                        language="json"
                                        theme="vs-dark"
                                        value={langGraphStore}
                                        onChange={handleLangGraphStoreChange}
                                        onMount={handleLangGraphStoreEditorMount}
                                        options={jsonEditorOptions}
                                    />
                                </JsonEditorWrapper>
                                {langGraphStoreError && (
                                    <ErrorMessage>{langGraphStoreError}</ErrorMessage>
                                )}
                            </JsonEditorContainer>
                        </>
                    )}

                    {agentType === 'HAYSTACK' && (
                        <>
                            <LabelWithButtons>
                                <ButtonLabel>Haystack Component Type</ButtonLabel>
                                <SelectButtonContainer>
                                    {(['pipeline', 'agent'] as const).map((type) => (
                                        <SelectButton
                                            type="button"
                                            key={type}
                                            onClick={() => setHaystackComponentType(type)}
                                            $selected={haystackComponentType === type}
                                        >
                                            {type.toUpperCase()}
                                        </SelectButton>
                                    ))}
                                </SelectButtonContainer>
                            </LabelWithButtons>
                            <TextInput
                                label="Haystack Component Definition"
                                placeholder="path.to.module:component"
                                required
                                value={haystackComponentDefinition}
                                onChange={(e) =>
                                    setHaystackComponentDefinition(e.target.value)
                                }
                            />
                        </>
                    )}

                    {['LANGGRAPH', 'HAYSTACK'].includes(agentType ?? '') && (
                        <>
                            <JsonEditorContainer>
                                <JsonEditorLabel>
                                    Input Schema Definition (JSON)
                                </JsonEditorLabel>
                                <JsonEditorWrapper>
                                    <Editor
                                        height="220px"
                                        language="json"
                                        theme="vs-dark"
                                        value={baseInputSchema}
                                        onChange={handleBaseInputSchemaChange}
                                        onMount={handleBaseInputSchemaEditorMount}
                                        options={jsonEditorOptions}
                                    />
                                </JsonEditorWrapper>
                                {baseInputSchemaError && (
                                    <ErrorMessage>{baseInputSchemaError}</ErrorMessage>
                                )}
                            </JsonEditorContainer>
                            <JsonEditorContainer>
                                <JsonEditorLabel>
                                    Output Schema Definition (JSON)
                                </JsonEditorLabel>
                                <JsonEditorWrapper>
                                    <Editor
                                        height="220px"
                                        language="json"
                                        theme="vs-dark"
                                        value={baseOutputSchema}
                                        onChange={handleBaseOutputSchemaChange}
                                        onMount={handleBaseOutputSchemaEditorMount}
                                        options={jsonEditorOptions}
                                    />
                                </JsonEditorWrapper>
                                {baseOutputSchemaError && (
                                    <ErrorMessage>{baseOutputSchemaError}</ErrorMessage>
                                )}
                            </JsonEditorContainer>
                        </>
                    )}

                    <SourceLabel style={{ display: 'none' }}>
                            {t('agent-form.source.label')}
                        </SourceLabel>
                    <SourceSection style={{ display: 'none' }}>
                            <SourceCard
                                onClick={() => handleSourceClick('upload')}
                            >
                                <UploadIcon />
                                <p>
                                    {t('agent-form.source.upload')}
                                    <br />
                                    {selectedAgentFile &&
                                    selectedAgentFile.source == 'Folder' ? (
                                        <span>
                                            {selectedAgentFile.file.name}
                                        </span>
                                    ) : (
                                        <span>
                                            {t(
                                                'agent-form.source.select-folder'
                                            )}
                                        </span>
                                    )}
                                </p>
                            </SourceCard>
                            <SourceCard
                                onClick={() => handleSourceClick('Git')}
                            style={{ display: 'none' }}
                            >
                                <GithubIcon />
                                <p>
                                    {t('agent-form.source.git')}
                                    <br />
                                    {selectedAgentFile &&
                                    selectedAgentFile.source == 'Git' ? (
                                        <span>
                                            {selectedAgentFile.file.name}
                                        </span>
                                    ) : (
                                        <span>
                                            {t(
                                                'agent-form.source.select-git-repo'
                                            )}
                                        </span>
                                    )}
                                </p>
                            </SourceCard>
                            <SourceCard
                                onClick={() => handleSourceClick('remote')}
                            style={{ display: 'none' }}
                            >
                                <NetworkIcon />
                                <p>
                                    {t('agent-form.source.remote')}
                                    <br />
                                    {selectedAgentFile &&
                                    selectedAgentFile.source == 'Remote' ? (
                                        <span>
                                            {selectedAgentFile.file.name}
                                        </span>
                                    ) : (
                                        <span>
                                            {t(
                                                'agent-form.source.select-remote'
                                            )}
                                        </span>
                                    )}
                                </p>
                            </SourceCard>
                            <SourceCard
                                onClick={() => handleSourceClick('project')}
                            style={{ display: 'none' }}
                            >
                                <FolderIcon />
                                <p>
                                    {t('agent-form.source.project')}
                                    <br />
                                    {selectedAgentFile &&
                                    selectedAgentFile.source == 'Project' ? (
                                        <span>
                                            {selectedAgentFile.file.name}
                                        </span>
                                    ) : (
                                        <span>
                                            {t(
                                                'agent-form.source.select-project-template'
                                            )}
                                        </span>
                                    )}
                                </p>
                            </SourceCard>
                        </SourceSection>

                    <div style={{ display: 'none' }}>
                        <FormSelect
                            label={t('agent-form.graph-definition-path.label')}
                            value={selectedConfigFile}
                            onChange={handleConfigFileChange}
                        >
                            <option value="">
                                --{' '}
                                {t('agent-form.graph-definition-path.select')}{' '}
                                --
                            </option>
                            {yamlFiles.map((file) => (
                                <option key={file} value={file}>
                                    {file}
                                </option>
                            ))}
                        </FormSelect>
                    </div>

                    {/* Framework Detection Display */}
                    {(detectedFramework || frameworkError) && (
                        <FrameworkDetectionBox
                            $isError={!!frameworkError}
                            style={{ display: 'none' }}
                        >
                            <FrameworkLabel>
                                {frameworkError ? '❌ Framework Error' : '✓ Framework Detected'}
                            </FrameworkLabel>
                            {detectedFramework && (
                                <FrameworkValue $isError={!!frameworkError}>
                                    {detectedFramework}
                                </FrameworkValue>
                            )}
                            {frameworkError && (
                                <ErrorMessage>{frameworkError}</ErrorMessage>
                            )}
                        </FrameworkDetectionBox>
                    )}

                        <LabelWithButtons>
                            <ButtonLabel>Environnement</ButtonLabel>
                            <SelectButtonContainer>
                                <SelectButton
                                    type="button"
                                    onClick={() => setEnvironment('development')}
                                    $selected={environment === 'development'}
                                >
                                    DEV
                                </SelectButton>
                                <SelectButton
                                    type="button"
                                    onClick={() => setEnvironment('staging')}
                                    $selected={environment === 'staging'}
                                >
                                    STAGING
                                </SelectButton>
                                <SelectButton
                                    type="button"
                                    onClick={() => setEnvironment('production')}
                                    $selected={environment === 'production'}
                                >
                                    PRODUCTION
                                </SelectButton>
                            </SelectButtonContainer>
                        </LabelWithButtons>

                    {/* Framework is now auto-detected from the config file */}
                    {/* <Label>
                            {t('agent-form.framework.label')}
                            <SelectButtonContainer>
                                {availableFrameworks.map((framework) => (
                                    <SelectButton
                                        $variants="base"
                                        $color="secondary"
                                        type="button"
                                        onClick={() =>
                                            setSelectedFramework(framework.id)
                                        }
                                        selected={
                                            selectedFramework === framework.id
                                        }
                                        key={framework.id}
                                    >
                                        {framework.name}
                                    </SelectButton>
                                ))}
                            </SelectButtonContainer>
                    </Label> */}

                    {/* Agent path is now in the YAML config file */}
                    {/* <TextInput
                            label={t('agent-form.agent-path.label')}
                            placeholder={t('agent-form.agent-path.placeholder')}
                            value={agentPath}
                            onChange={(e) => setAgentPath(e.target.value)}
                    /> */}
                        <h2>{t('agent-form.observability.title')}</h2>

                        <LabelWithButtons>
                            <ButtonLabel>
                            {t('agent-form.observability.label')}
                            <sup>*</sup>
                            </ButtonLabel>
                            <SelectButtonContainer>
                                <SelectButton
                                    type="button"
                                    onClick={() =>
                                        setSelectedObservabilityProvider(null)
                                    }
                                    $selected={
                                        selectedObservabilityProvider === null
                                    }
                                >
                                    {t('agent-form.observability.tools.none')}
                                </SelectButton>
                                <SelectButton
                                    type="button"
                                    onClick={() =>
                                        setSelectedObservabilityProvider(
                                            'langfuse'
                                        )
                                    }
                                    $selected={
                                        selectedObservabilityProvider ===
                                        'langfuse'
                                    }
                                >
                                    Langfuse
                                </SelectButton>
                                <SelectButton
                                    type="button"
                                    onClick={() =>
                                        setSelectedObservabilityProvider(
                                            'phoenix'
                                        )
                                    }
                                    $selected={
                                        selectedObservabilityProvider ===
                                        'phoenix'
                                    }
                                >
                                    Phoenix
                                </SelectButton>
                            </SelectButtonContainer>
                        </LabelWithButtons>

                        {selectedObservabilityProvider === 'langfuse' && (
                            <>
                                <TextInput
                                    label={t(
                                        'agent-form.observability.langfuse.host.label'
                                    )}
                                    placeholder={t(
                                        'agent-form.observability.langfuse.host.placeholder'
                                    )}
                                    value={langfuseHost}
                                    required
                                    onChange={(e) =>
                                        setLangfuseHost(e.target.value)
                                    }
                                />
                                <TextInput
                                    label={t(
                                        'agent-form.observability.langfuse.public-key.label'
                                    )}
                                    placeholder={t(
                                        'agent-form.observability.langfuse.public-key.placeholder'
                                    )}
                                    value={langfusePublicKey}
                                    onChange={(e) =>
                                        setLangfusePublicKey(e.target.value)
                                    }
                                    required
                                />
                                <TextInput
                                    label={t(
                                        'agent-form.observability.langfuse.secret-key.label'
                                    )}
                                    placeholder={t(
                                        'agent-form.observability.langfuse.secret-key.placeholder'
                                    )}
                                    required
                                    value={langfuseSecretKey}
                                    onChange={(e) =>
                                        setLangfuseSecretKey(e.target.value)
                                    }
                                />
                                <TextInput
                                    label={t(
                                        'agent-form.observability.langfuse.run-name.label'
                                    )}
                                    placeholder={t(
                                        'agent-form.observability.langfuse.run-name.placeholder'
                                    )}
                                    value={langfuseRunName}
                                    onChange={(e) =>
                                        setLangfuseRunName(e.target.value)
                                    }
                                />
                            </>
                        )}

                    {agentType === 'LANGGRAPH' && (
                        <>
                        <LabelWithButtons>
                            <ButtonLabel>Checkpointer Type</ButtonLabel>
                            <SelectButtonContainer>
                                {(['sqlite', 'postgres'] as const).map((type) => (
                                    <SelectButton
                                        type="button"
                                        key={type}
                                        onClick={() => handleManualCheckpointerTypeChange(type)}
                                        $selected={checkpointerType === type}
                                    >
                                        {type.toUpperCase()}
                                    </SelectButton>
                                ))}
                            </SelectButtonContainer>
                        </LabelWithButtons>
                        <TextInput
                                label="Checkpointer Database URL"
                                placeholder={
                                    checkpointerType === 'sqlite'
                                        ? 'sqlite:///support_bot.db'
                                        : 'postgres://user:password@host:5432/database'
                                }
                                value={databaseUrl}
                            error={dbUrlError ?? undefined}
                            onChange={handleDatabaseUrlChange}
                        />
                    </>
                )}

                <ButtonContainer>
                                    <Button
                                        $variants="base"
                                        $color="primary"
                                        type="submit"
                            disabled={isSubmitting}
                                    >
                            {isSubmitting
                                ? 'Creating Agent...'
                                : t('agent-form.create-agent') || 'Create Agent'}
                                    </Button>
                </ButtonContainer>
                
                {submitError && (
                    <SubmitErrorMessage>{submitError}</SubmitErrorMessage>
                )}
                </>
            </Form>

            <SourcePopup
                isOpen={isPopupOpen}
                onClose={handleClosePopup}
                onChangeZip={handleChangesYamlFiles}
                sourceType={selectedSourceType}
            />
        </MainContainer>
    );
}

const MainContainer = styled.main`
    min-height: 100vh;
    padding: 40px;
    background: var(--color-background-primary, #0f1016);
    overflow-y: auto;
`;

const Header = styled.div`
    text-align: center;
    margin-bottom: 40px;

    h1 {
        font-size: 32px;
        font-weight: 700;
        margin: 0 0 16px 0;
        color: var(--color-text-primary, #ffffff);
    }

    p {
        font-size: 18px;
        color: var(--color-text-secondary, #8892b0);
        margin: 0;
        line-height: 1.5;
    }
`;

const StepsWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    justify-content: center;
`;

const StepDot = styled.div<{ active?: boolean }>`
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: ${({ active }) =>
        active ? 'var(--color-primary, #8c52ff)' : 'transparent'};
    color: ${({ active }) =>
        active
            ? 'var(--color-background-primary, #16213e)'
            : 'var(--color-text-secondary, #8892b0)'};
    border: 2px solid var(--color-primary, #8c52ff);
    font-weight: 700;
`;

const StepLabel = styled.span`
    color: var(--color-text-secondary, #8892b0);
    font-size: 14px;
    margin-right: 12px;
`;

const StepSeparator = styled.div`
    width: 24px;
    height: 2px;
    background: var(--color-border-primary, #2a3f5f);
`;

const SourceLabel = styled.label`
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin-bottom: 16px;
    margin-top: 24px;
`;

const SourceSection = styled.section`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 24px;
`;

const SourceCard = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    background: var(--color-background-tertiary, #2a3f5f);
    border: 2px solid var(--color-border-primary, #2a3f5f);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;

    &:hover {
        border-color: var(--color-primary, #8c52ff);
        background: var(--color-background-primary, #16213e);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    }

    svg {
        width: 32px;
        height: 32px;
        color: var(--color-primary, #8c52ff);
        margin-bottom: 16px;
    }

    p {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary, #ffffff);
        line-height: 1.4;

        span {
            display: block;
            font-size: 14px;
            font-weight: 400;
            color: var(--color-text-secondary, #8892b0);
            margin-top: 4px;
        }
    }
`;

const ButtonContainer = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: 32px;
    padding-top: 32px;    gap: 8px;
    border-top: 1px solid var(--color-border-primary, #2a3f5f);
`;

const SelectButton = styled.button<{ $selected: boolean }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 16px;
    flex: 0 0 auto;
    font: inherit;
    border-radius: 8px;
    border: 2px solid var(--color-primary, #8c52ff);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background: var(--color-primary, #8c52ff) !important;
        color: var(--color-background-primary, #16213e) !important;
    }

    color: ${({ $selected }) =>
        $selected
            ? 'var(--color-background-primary, #16213e)'
            : 'var(--color-text-primary, #ffffff)'} !important;
    background: ${({ $selected }) =>
        $selected ? 'var(--color-primary, #8c52ff)' : 'transparent'} !important;

    &:focus-visible {
        outline: 2px solid rgba(140, 82, 255, 0.7);
        outline-offset: 2px;
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: transparent;
        color: var(--color-text-secondary, #8892b0);
    }
`;

const SelectButtonContainer = styled.div`
    display: inline-flex;
    gap: 8px;
    vertical-align: middle;
    flex-wrap: wrap;
`;

const LabelWithButtons = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
`;

const ButtonLabel = styled.div`
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
`;

const JsonEditorContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
`;

const JsonEditorLabel = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
`;

const JsonEditorWrapper = styled.div`
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-background-primary, #0f1016);
`;

const FrameworkDetectionBox = styled.div<{ $isError: boolean }>`
    padding: 16px 20px;
    background: ${({ $isError }) => 
        $isError 
            ? 'rgba(255, 71, 87, 0.1)' 
            : 'rgba(140, 82, 255, 0.1)'
    };
    border: 1px solid ${({ $isError }) => 
        $isError 
            ? '#ff4757' 
            : 'var(--color-primary, #8c52ff)'
    };
    border-radius: 8px;
    margin-bottom: 24px;
`;

const FrameworkLabel = styled.div`
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary, #8892b0);
    margin-bottom: 4px;
`;

const FrameworkValue = styled.div<{ $isError: boolean }>`
    font-size: 16px;
    font-weight: 600;
    font-family: inherit;
    color: ${({ $isError }) => 
        $isError 
            ? '#ff4757' 
            : 'var(--color-primary, #8c52ff)'
    };
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const ErrorMessage = styled.p`
    margin-top: 8px;
    margin-bottom: 0;
    font-size: 14px;
    font-family: inherit;
    font-weight: 400;
    color: #ff4757;
    line-height: 1.5;
`;

const SubmitErrorMessage = styled.div`
    margin-top: 16px;
    padding: 16px 20px;
    background: rgba(255, 71, 87, 0.1);
    border: 1px solid #ff4757;
    border-radius: 8px;
    color: #ff4757;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.5;
    word-break: break-word;
`;
