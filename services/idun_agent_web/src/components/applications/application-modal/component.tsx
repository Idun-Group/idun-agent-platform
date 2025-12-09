import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from '../../general/modal/component';
import { Button } from '../../general/button/component';
import { TextInput, Checkbox, TextArea, Select, TagInput } from '../../general/form/component';
import type { AppType, ApplicationConfig, MarketplaceApp } from '../../../types/application.types';
import { createApplication, updateApplication, deleteApplication } from '../../../services/applications';
import { toast } from 'react-toastify';

interface ApplicationModalProps {
    isOpen: boolean;
    onClose: () => void;
    appToCreate?: MarketplaceApp; // If provided, we are in "Create" mode
    appToEdit?: ApplicationConfig; // If provided, we are in "Edit/View" mode
    onSuccess: () => void;
}

const ApplicationModal = ({ isOpen, onClose, appToCreate, appToEdit, onSuccess }: ApplicationModalProps) => {
    const [name, setName] = useState('');
    const [config, setConfig] = useState<Record<string, string>>({});
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const mode = appToCreate ? 'create' : 'view';
    const appType = appToCreate?.type || appToEdit?.type;
    const appName = appToCreate?.name || appToEdit?.name;

    useEffect(() => {
        if (isOpen) {
            setErrorMessage(null);
            if (mode === 'create') {
                setName('');
                setConfig(appType === 'MCPServer' ? { transport: 'streamable_http' } : {});
                setIsEditing(true);
            } else if (appToEdit) {
                setName(appToEdit.name);
                setConfig(appToEdit.config);
                setIsEditing(false); // Start in view mode
            }
        }
    }, [isOpen, appToCreate, appToEdit, mode, appType]);

    const formatError = (error: any): string => {
        try {
            // Check if error.message is JSON
            const errObj = JSON.parse(error.message);
            if (errObj.detail) {
                if (Array.isArray(errObj.detail)) {
                    return errObj.detail.map((e: any) => e.msg).join('\n');
                }
                return String(errObj.detail);
            }
            if (errObj.message) return errObj.message;
        } catch (e) {
            // Not JSON, use message directly
        }
        return error.message || 'An error occurred';
    };

    const handleSubmit = async () => {
        if (!name) {
            toast.error('Please provide a name');
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        try {
            if (mode === 'create' && appToCreate) {
                await createApplication({
                    name,
                    type: appToCreate.type,
                    category: appToCreate.category,
                    config,
                    imageUrl: appToCreate.imageUrl
                });
                toast.success('Application created successfully');
            } else if (appToEdit) {
                await updateApplication(appToEdit.id, {
                    name,
                    config,
                    category: appToEdit.category,
                    type: appToEdit.type
                });
                toast.success('Application updated successfully');
            }
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error(error);
            const msg = formatError(error);
            setErrorMessage(msg);
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!appToEdit || !confirm('Are you sure you want to delete this application?')) return;

        setIsSubmitting(true);
        setErrorMessage(null);
        try {
            await deleteApplication(appToEdit.id);
            toast.success('Application deleted successfully');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error(error);
            const msg = formatError(error);
            setErrorMessage(msg);
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        if (!name) return false;
        if (!appType) return false;

        switch (appType) {
            case 'Langfuse':
                return !!(config.host && config.publicKey && config.secretKey);
            case 'Phoenix':
                return !!config.host;
            case 'GoogleCloudLogging':
                return !!config.gcpProjectId;
            case 'GoogleCloudTrace':
                return !!config.gcpProjectId;
            case 'LangSmith':
                return !!config.apiKey;
            case 'PostgreSQL':
                return !!config.connectionString;
            case 'SQLite':
                return !!config.connectionString;
            case 'MCPServer':
                // Validate based on transport
                if (config.transport === 'stdio') {
                    return !!config.command;
                }
                // For http/sse/websocket
                if (['sse', 'streamable_http', 'websocket'].includes(config.transport)) {
                    return !!config.url;
                }
                return true;
            case 'ModelArmor':
                return !!(config.projectId && config.location && config.templateId);
            case 'CustomLLM':
                return !!(config.model && config.prompt);
            case 'BanList':
                return !!config.banned_words;
            case 'BiasCheck':
            case 'GibberishText':
            case 'NSFWText':
                return !!config.threshold;
            case 'CompetitionCheck':
                return !!config.competitors;
            case 'CorrectLanguage':
                return !!config.expected_languages;
            case 'DetectPII':
                // Check if any PII entity is selected (stored as comma-separated string or handling logic)
                return !!config.pii_entities;
            case 'DetectJailbreak':
                return !!(config.sensitivity && config.check_type);
            case 'RestrictTopic':
                return !!config.valid_topics;
            case 'PromptInjection':
            case 'RagHallucination':
            case 'ToxicLanguage':
                return !!config.threshold;
            case 'CodeScanner':
                return !!config.allowed_languages;
            case 'AdkVertexAi':
                return !!(config.project_id && config.location && config.reasoning_engine_app_name);
            case 'AdkDatabase':
                return !!config.connectionString;
            default:
                return true;
        }
    };

    const renderFields = () => {
        if (!appType) return null;

        switch (appType) {
            case 'Langfuse':
                return (
                    <>
                        <TextInput
                            label="Host"
                            tooltip="The host URL for Langfuse."
                            value={config.host || ''}
                            onChange={e => setConfig({...config, host: e.target.value})}
                            disabled={!isEditing}
                            placeholder="https://cloud.langfuse.com"
                            required
                        />
                        <TextInput
                            label="Public Key"
                            tooltip="The public key for Langfuse authentication."
                            value={config.publicKey || ''}
                            onChange={e => setConfig({...config, publicKey: e.target.value})}
                            disabled={!isEditing}
                            type={isEditing ? "text" : "password"}
                            required
                        />
                        <TextInput
                            label="Secret Key"
                            tooltip="The secret key for Langfuse authentication."
                            value={config.secretKey || ''}
                            onChange={e => setConfig({...config, secretKey: e.target.value})}
                            disabled={!isEditing}
                            type={isEditing ? "text" : "password"}
                            required
                        />
                    </>
                );
            case 'Phoenix':
                return (
                    <>
                        <TextInput
                            label="Host"
                            tooltip="The host URL for Phoenix."
                            value={config.host || ''}
                            onChange={e => setConfig({...config, host: e.target.value})}
                            disabled={!isEditing}
                            placeholder="http://localhost:6006"
                            required
                        />
                    </>
                );
            case 'GoogleCloudLogging':
                return (
                    <>
                        <TextInput
                            label="GCP Project ID"
                            tooltip="The project identifier where logs and traces will be sent."
                            value={config.gcpProjectId || ''}
                            onChange={e => setConfig({...config, gcpProjectId: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Region/Zone"
                            tooltip="(Optional) The specific region/zone associated with the resource (e.g., us-central1)."
                            value={config.region || ''}
                            onChange={e => setConfig({...config, region: e.target.value})}
                            disabled={!isEditing}
                        />
                        <TextInput
                            label="Log Name"
                            tooltip="The identifier for the log stream (e.g., application-log)."
                            value={config.logName || ''}
                            onChange={e => setConfig({...config, logName: e.target.value})}
                            disabled={!isEditing}
                        />
                        <TextInput
                            label="Monitored Resource Type"
                            tooltip="The resource type label (e.g., global, gce_instance, cloud_run_revision)."
                            value={config.resourceType || ''}
                            onChange={e => setConfig({...config, resourceType: e.target.value})}
                            disabled={!isEditing}
                        />
                        <Select
                            label="Log Severity Level"
                            tooltip="Minimum level to record (e.g., INFO, WARNING, ERROR)."
                            value={config.severity || 'INFO'}
                            onChange={e => setConfig({...config, severity: e.target.value})}
                            disabled={!isEditing}
                        >
                            <option value="DEBUG">DEBUG</option>
                            <option value="INFO">INFO</option>
                            <option value="WARNING">WARNING</option>
                            <option value="ERROR">ERROR</option>
                            <option value="CRITICAL">CRITICAL</option>
                        </Select>
                        <Select
                            label="Transport Mode"
                            tooltip="Selection for delivery method (e.g., BackgroundThread vs Synchronous)."
                            value={config.transport || 'BackgroundThread'}
                            onChange={e => setConfig({...config, transport: e.target.value})}
                            disabled={!isEditing}
                        >
                            <option value="BackgroundThread">Background Thread</option>
                            <option value="Synchronous">Synchronous</option>
                        </Select>
                    </>
                );
            case 'GoogleCloudTrace':
                 return (
                    <>
                        <TextInput
                            label="GCP Project ID"
                            tooltip="The project identifier where logs and traces will be sent."
                            value={config.gcpProjectId || ''}
                            onChange={e => setConfig({...config, gcpProjectId: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Region/Zone"
                            tooltip="(Optional) The specific region/zone associated with the resource (e.g., us-central1)."
                            value={config.region || ''}
                            onChange={e => setConfig({...config, region: e.target.value})}
                            disabled={!isEditing}
                        />
                        <TextInput
                            label="Sampling Rate"
                            tooltip="A number between 0.0 and 1.0 indicating the probability of a request being traced (e.g., 1.0 for 100%, 0.1 for 10%)."
                            value={config.samplingRate || '1.0'}
                            onChange={e => setConfig({...config, samplingRate: e.target.value})}
                            disabled={!isEditing}
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                        />
                        <TextInput
                            label="Flush Interval (s)"
                            tooltip="Time in seconds to wait before sending buffered traces to the cloud."
                            value={config.flushInterval || '5'}
                            onChange={e => setConfig({...config, flushInterval: e.target.value})}
                            disabled={!isEditing}
                            type="number"
                        />
                        <TextInput
                            label="Ignore URLs/Endpoints"
                            tooltip="A list or comma-separated string of URL paths to exclude from tracing (e.g., /health, /metrics)."
                            value={config.ignoreUrls || ''}
                            onChange={e => setConfig({...config, ignoreUrls: e.target.value})}
                            disabled={!isEditing}
                        />
                    </>
                );
            case 'LangSmith':
                return (
                    <>
                        <TextInput
                            label="LangChain API Key"
                            tooltip="The unique authentication key from the LangSmith settings page."
                            value={config.apiKey || ''}
                            onChange={e => setConfig({...config, apiKey: e.target.value})}
                            disabled={!isEditing}
                            type={isEditing ? "text" : "password"}
                            required
                        />
                        <TextInput
                            label="LangChain Project Name"
                            tooltip="The name of the project in LangSmith to bucket these traces under (e.g., prod-chatbot-v1)."
                            value={config.projectName || ''}
                            onChange={e => setConfig({...config, projectName: e.target.value})}
                            disabled={!isEditing}
                        />
                        <TextInput
                            label="LangChain Endpoint"
                            tooltip="(Optional) The URL endpoint, used primarily if you are self-hosting LangSmith or using a specific enterprise instance."
                            value={config.endpoint || ''}
                            onChange={e => setConfig({...config, endpoint: e.target.value})}
                            disabled={!isEditing}
                            placeholder="https://api.smith.langchain.com"
                        />
                        <Checkbox
                            label="Tracing Enabled"
                            tooltip="A toggle/checkbox to globally turn tracing on or off."
                            checked={config.tracingEnabled === 'true'}
                            onChange={e => setConfig({...config, tracingEnabled: String(e.target.checked)})}
                            disabled={!isEditing}
                        />
                        <Checkbox
                            label="Capture Inputs/Outputs"
                            tooltip="A toggle to decide if the full text of LLM inputs and outputs should be logged."
                            checked={config.captureInputsOutputs === 'true'}
                            onChange={e => setConfig({...config, captureInputsOutputs: String(e.target.checked)})}
                            disabled={!isEditing}
                        />
                    </>
                );
            case 'PostgreSQL':
                return (
                    <TextInput
                        label="Connection String"
                        tooltip="Format: postgresql+asyncpg://user:password@host:port/dbname"
                        value={config.connectionString || ''}
                        onChange={e => setConfig({...config, connectionString: e.target.value})}
                        disabled={!isEditing}
                        placeholder="postgresql+asyncpg://user:password@host:port/dbname"
                        type={isEditing ? "text" : "password"}
                        required
                    />
                );
            case 'SQLite':
                return (
                    <TextInput
                        label="Connection String"
                        tooltip="Format: sqlite+aiosqlite:///./data.db (Use 4 slashes for absolute path)"
                        value={config.connectionString || ''}
                        onChange={e => setConfig({...config, connectionString: e.target.value})}
                        disabled={!isEditing}
                        placeholder="sqlite+aiosqlite:///./data.db"
                        required
                    />
                );
            case 'MCPServer':
                const transport = config.transport || 'streamable_http';
                return (
                    <>
                        <Select
                            label="Transport"
                            tooltip="Transport type used to reach the MCP server."
                            value={transport}
                            onChange={e => setConfig({...config, transport: e.target.value})}
                            disabled={!isEditing}
                        >
                            <option value="streamable_http">streamable_http</option>
                            <option value="sse">sse</option>
                            <option value="websocket">websocket</option>
                            <option value="stdio">stdio</option>
                        </Select>

                        {['sse', 'streamable_http', 'websocket'].includes(transport) && (
                            <>
                                <TextInput
                                    label="URL"
                                    tooltip="Endpoint URL for HTTP/S based transports."
                                    value={config.url || ''}
                                    onChange={e => setConfig({...config, url: e.target.value})}
                                    disabled={!isEditing}
                                    required
                                />
                                <TextArea
                                    label="Headers (JSON)"
                                    tooltip='Optional headers for HTTP/S transports. E.g. {"Authorization": "Bearer token"}'
                                    value={config.headers || ''}
                                    onChange={e => setConfig({...config, headers: e.target.value})}
                                    disabled={!isEditing}
                                    rows={3}
                                />
                                {transport === 'streamable_http' && (
                                    <Checkbox
                                        label="Terminate on Close"
                                        tooltip="Whether to terminate Streamable HTTP sessions on close."
                                        checked={config.terminate_on_close === 'true'}
                                        onChange={e => setConfig({...config, terminate_on_close: String(e.target.checked)})}
                                        disabled={!isEditing}
                                    />
                                )}
                                {transport === 'sse' && (
                                    <TextInput
                                        label="SSE Read Timeout (s)"
                                        tooltip="Timeout in seconds waiting for SSE events."
                                        value={config.sse_read_timeout_seconds || ''}
                                        onChange={e => setConfig({...config, sse_read_timeout_seconds: e.target.value})}
                                        disabled={!isEditing}
                                        type="number"
                                    />
                                )}
                                <TextInput
                                    label="Timeout (s)"
                                    tooltip="Timeout in seconds for HTTP/S transports."
                                    value={config.timeout_seconds || ''}
                                    onChange={e => setConfig({...config, timeout_seconds: e.target.value})}
                                    disabled={!isEditing}
                                    type="number"
                                />
                            </>
                        )}

                        {transport === 'stdio' && (
                            <>
                                <TextInput
                                    label="Command"
                                    tooltip="Executable to run when using stdio transport."
                                    value={config.command || ''}
                                    onChange={e => setConfig({...config, command: e.target.value})}
                                    disabled={!isEditing}
                                    required
                                />
                                <TextArea
                                    label="Args (JSON Array)"
                                    tooltip='Arguments to pass to the command. E.g. ["--port", "8000"]'
                                    value={config.args || ''}
                                    onChange={e => setConfig({...config, args: e.target.value})}
                                    disabled={!isEditing}
                                    rows={3}
                                />
                                <TextArea
                                    label="Environment Variables (JSON)"
                                    tooltip='Environment variables to set. E.g. {"DEBUG": "true"}'
                                    value={config.env || ''}
                                    onChange={e => setConfig({...config, env: e.target.value})}
                                    disabled={!isEditing}
                                    rows={3}
                                />
                                <TextInput
                                    label="Working Directory"
                                    tooltip="Working directory for stdio transports."
                                    value={config.cwd || ''}
                                    onChange={e => setConfig({...config, cwd: e.target.value})}
                                    disabled={!isEditing}
                                />
                                <TextInput
                                    label="Encoding"
                                    tooltip="Encoding used for stdio transport."
                                    value={config.encoding || ''}
                                    onChange={e => setConfig({...config, encoding: e.target.value})}
                                    disabled={!isEditing}
                                />
                                <Select
                                    label="Encoding Error Handler"
                                    tooltip="Encoding error handler for stdio transport."
                                    value={config.encoding_error_handler || ''}
                                    onChange={e => setConfig({...config, encoding_error_handler: e.target.value})}
                                    disabled={!isEditing}
                                >
                                    <option value="">None</option>
                                    <option value="strict">strict</option>
                                    <option value="ignore">ignore</option>
                                    <option value="replace">replace</option>
                                </Select>
                            </>
                        )}
                    </>
                );
            case 'ModelArmor':
                return (
                    <>
                        <TextInput
                            label="Project ID"
                            tooltip="ID du projet auquel appartient le modèle."
                            value={config.projectId || ''}
                            onChange={e => setConfig({...config, projectId: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Location"
                            tooltip="Emplacement du modèle."
                            value={config.location || ''}
                            onChange={e => setConfig({...config, location: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Template ID"
                            tooltip="ID du modèle."
                            value={config.templateId || ''}
                            onChange={e => setConfig({...config, templateId: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                    </>
                );
            case 'CustomLLM':
                return (
                    <>
                        <Select
                            label="Model"
                            tooltip="Select the LLM model."
                            value={config.model || ''}
                            onChange={e => setConfig({...config, model: e.target.value})}
                            disabled={!isEditing}
                            required
                        >
                            <option value="">Select a model</option>
                            <option value="gemini-2.5-flash-lite">Gemini 2.5 flash lite</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 flash</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 pro</option>
                            <option value="gemini-3-pro">Gemini 3 pro</option>
                            <option value="gpt-5.1">OpenAi GPT-5.1</option>
                            <option value="gpt-5-mini">OpenAi GPT-5 mini</option>
                            <option value="gpt-5-nano">OpenAi GPT-5 nano</option>
                        </Select>
                        <TextArea
                            label="Prompt"
                            tooltip="Define the custom prompt."
                            value={config.prompt || ''}
                            onChange={e => setConfig({...config, prompt: e.target.value})}
                            disabled={!isEditing}
                            rows={5}
                            required
                        />
                    </>
                );
            case 'BanList':
                return (
                    <TagInput
                        label="Banned Words"
                        tooltip="Type a word and press Enter to add. Double click to edit."
                        value={config.banned_words || ''}
                        onChange={e => setConfig({...config, banned_words: e.target.value})}
                        disabled={!isEditing}
                        required
                    />
                );
            case 'BiasCheck':
                return (
                    <TextInput
                        label="Threshold"
                        tooltip="A number between 0.0 and 1.0 (sensitivity level)."
                        value={config.threshold || ''}
                        onChange={e => setConfig({...config, threshold: e.target.value})}
                        disabled={!isEditing}
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        required
                    />
                );
            case 'CompetitionCheck':
                return (
                    <TagInput
                        label="Competitors"
                        tooltip="Type a competitor name and press Enter to add. Double click to edit."
                        value={config.competitors || ''}
                        onChange={e => setConfig({...config, competitors: e.target.value})}
                        disabled={!isEditing}
                        required
                    />
                );
            case 'CorrectLanguage':
                return (
                    <TagInput
                        label="Expected Languages"
                        tooltip="Type an ISO language code (e.g., en, fr) and press Enter to add. Double click to edit."
                        value={config.expected_languages || ''}
                        onChange={e => setConfig({...config, expected_languages: e.target.value})}
                        disabled={!isEditing}
                        required
                    />
                );
            case 'DetectPII': {
                // Helper to toggle PII entities
                const togglePII = (entity: string) => {
                    const current = config.pii_entities ? config.pii_entities.split(',') : [];
                    if (current.includes(entity)) {
                        setConfig({...config, pii_entities: current.filter(e => e !== entity).join(',')});
                    } else {
                        setConfig({...config, pii_entities: [...current, entity].join(',')});
                    }
                };
                const piiList = ['Email', 'Phone Number', 'Credit Card', 'SSN', 'Location'];
                return (
                    <div style={{ marginBottom: '24px' }}>
                         <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary, #ffffff)' }}>
                            PII Entities <span style={{ color: '#ff4757', marginLeft: '4px' }}>*</span>
                        </label>
                        {piiList.map(entity => (
                             <Checkbox
                                key={entity}
                                label={entity}
                                checked={(config.pii_entities || '').split(',').includes(entity)}
                                onChange={() => togglePII(entity)}
                                disabled={!isEditing}
                            />
                        ))}
                    </div>
                );
            }
            case 'GibberishText':
                return (
                    <TextInput
                        label="Threshold"
                        tooltip="A number between 0.0 and 1.0 (sensitivity level)."
                        value={config.threshold || ''}
                        onChange={e => setConfig({...config, threshold: e.target.value})}
                        disabled={!isEditing}
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        required
                    />
                );
            case 'NSFWText':
                return (
                    <TextInput
                        label="Threshold"
                        tooltip="A number between 0.0 and 1.0 (sensitivity level)."
                        value={config.threshold || ''}
                        onChange={e => setConfig({...config, threshold: e.target.value})}
                        disabled={!isEditing}
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        required
                    />
                );
            case 'DetectJailbreak':
                return (
                    <>
                        <Select
                            label="Sensitivity"
                            tooltip="Sensitivity level for jailbreak detection."
                            value={config.sensitivity || ''}
                            onChange={e => setConfig({...config, sensitivity: e.target.value})}
                            disabled={!isEditing}
                            required
                        >
                            <option value="">Select Sensitivity</option>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </Select>
                        <Select
                            label="Check Type"
                            tooltip="Type of check to perform."
                            value={config.check_type || ''}
                            onChange={e => setConfig({...config, check_type: e.target.value})}
                            disabled={!isEditing}
                            required
                        >
                            <option value="">Select Check Type</option>
                            <option value="Prompt Injection">Prompt Injection</option>
                            <option value="System Prompt Leakage">System Prompt Leakage</option>
                        </Select>
                    </>
                );
            case 'RestrictTopic':
                return (
                    <>
                        <TagInput
                            label="Valid Topics"
                            tooltip="Type a topic and press Enter to add. Double click to edit."
                            value={config.valid_topics || ''}
                            onChange={e => setConfig({...config, valid_topics: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TagInput
                            label="Invalid Topics"
                            tooltip="Type a topic and press Enter to add. Double click to edit."
                            value={config.invalid_topics || ''}
                            onChange={e => setConfig({...config, invalid_topics: e.target.value})}
                            disabled={!isEditing}
                        />
                    </>
                );
            case 'PromptInjection':
            case 'RagHallucination':
            case 'ToxicLanguage':
                return (
                    <TextInput
                        label="Threshold"
                        tooltip="A number between 0.0 and 1.0 (sensitivity level)."
                        value={config.threshold || ''}
                        onChange={e => setConfig({...config, threshold: e.target.value})}
                        disabled={!isEditing}
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        required
                    />
                );
            case 'CodeScanner':
                return (
                    <TagInput
                        label="Allowed Languages"
                        tooltip="Type a language (e.g. python) and press Enter to add. Double click to edit."
                        value={config.allowed_languages || ''}
                        onChange={e => setConfig({...config, allowed_languages: e.target.value})}
                        disabled={!isEditing}
                        required
                    />
                );
            case 'AdkInMemory':
                return <p>No configuration needed for In-Memory session service.</p>;
            case 'AdkVertexAi':
                return (
                    <>
                        <TextInput
                            label="Project ID"
                            tooltip="Google Cloud Project ID."
                            value={config.project_id || ''}
                            onChange={e => setConfig({...config, project_id: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Location"
                            tooltip="Google Cloud Location (e.g. us-central1)."
                            value={config.location || ''}
                            onChange={e => setConfig({...config, location: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Reasoning Engine App Name"
                            tooltip="Reasoning Engine Application Name or ID."
                            value={config.reasoning_engine_app_name || ''}
                            onChange={e => setConfig({...config, reasoning_engine_app_name: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                    </>
                );
            case 'AdkDatabase':
                return (
                    <TextInput
                        label="Database URL"
                        tooltip="The connection string (e.g. postgresql://user:password@host:port/db)."
                        value={config.connectionString || ''}
                        onChange={e => setConfig({...config, connectionString: e.target.value})}
                        disabled={!isEditing}
                        required
                    />
                );
            case 'SSO':
                return (
                    <>
                        <Select
                            label="Provider Type"
                            tooltip="Select your OIDC provider."
                            value={config.providerType || ''}
                            onChange={e => setConfig({...config, providerType: e.target.value})}
                            disabled={!isEditing}
                            required
                        >
                            <option value="">Select Provider</option>
                            <option value="okta">Okta</option>
                            <option value="auth0">Auth0</option>
                            <option value="entra">Microsoft Entra (Azure AD)</option>
                            <option value="google">Google Workspace</option>
                        </Select>
                        <TextInput
                            label="Issuer URL"
                            tooltip="OIDC discovery base URL (e.g. https://dev-xxxx.us.auth0.com/)."
                            value={config.issuer || ''}
                            onChange={e => setConfig({...config, issuer: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Client ID"
                            tooltip="Client ID from your Identity Provider."
                            value={config.clientId || ''}
                            onChange={e => setConfig({...config, clientId: e.target.value})}
                            disabled={!isEditing}
                            required
                        />
                        <TextInput
                            label="Client Secret"
                            tooltip="Client Secret from your Identity Provider."
                            value={config.clientSecret || ''}
                            onChange={e => setConfig({...config, clientSecret: e.target.value})}
                            disabled={!isEditing}
                            type={isEditing ? "text" : "password"}
                            required
                        />
                        <TextInput
                            label="Redirect URI"
                            tooltip="Callback URL configured in your IdP (e.g. http://localhost:8000/api/v1/auth/callback)."
                            value={config.redirectUri || ''}
                            onChange={e => setConfig({...config, redirectUri: e.target.value})}
                            disabled={!isEditing}
                            placeholder="http://localhost:8000/api/v1/auth/callback"
                        />
                        <TagInput
                            label="Expected Audiences"
                            tooltip="Audience(s) expected in the access token. Type and press Enter."
                            value={config.expectedAudiences || ''}
                            onChange={e => setConfig({...config, expectedAudiences: e.target.value})}
                            disabled={!isEditing}
                        />
                    </>
                );
            default:
                return <p>No configuration needed for this app type.</p>;
        }
    };

    const isSubmitDisabled = isSubmitting || (isEditing && !isFormValid());

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'create' ? `Configure ${appName}` : `${appName} Details`}
        >
            <TextInput
                label="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!isEditing}
                placeholder={mode === 'create' ? `My ${appToCreate?.name}` : ''}
                required
            />

            {renderFields()}

            <ActionButtons>
                {mode === 'view' && !isEditing && (
                    <>
                        <Button type="button" $variants="colored" $color="#ef4444" onClick={handleDelete} disabled={isSubmitting}>
                            Delete
                        </Button>
                         <div style={{ flex: 1 }} />
                        <Button type="button" $variants="transparent" onClick={() => setIsEditing(true)}>
                            Modify
                        </Button>
                    </>
                )}

                {isEditing && mode === 'view' && (
                    <>
                        <Button type="button" $variants="transparent" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <div style={{ flex: 1 }} />
                        <Button type="button" $variants="base" onClick={handleSubmit} disabled={isSubmitDisabled}>
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </Button>
                    </>
                )}

                {mode === 'create' && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                         <Button
                            type="button"
                            $variants="base"
                            onClick={handleSubmit}
                            disabled={isSubmitDisabled}
                            style={{
                                width: 'auto',
                                minWidth: '200px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                opacity: isSubmitDisabled ? 0.5 : 1,
                                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer'
                            }}
                        >
                             {isSubmitting ? 'Creating...' : 'Create Configuration'}
                        </Button>
                         {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
                    </div>
                )}
            </ActionButtons>
            {mode !== 'create' && errorMessage && (
                <ErrorMessage style={{ textAlign: 'right', marginTop: '0' }}>{errorMessage}</ErrorMessage>
            )}
        </Modal>
    );
};

export default ApplicationModal;

const ActionButtons = styled.div`
    display: flex;
    gap: 12px;
    margin-top: 16px;
    justify-content: flex-end;
`;

const ErrorMessage = styled.div`
    color: #ef4444;
    font-size: 13px;
    margin-top: 8px;
    white-space: pre-wrap;
    text-align: center;
`;
