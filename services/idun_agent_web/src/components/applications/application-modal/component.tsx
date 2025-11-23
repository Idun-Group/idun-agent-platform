import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from '../../general/modal/component';
import { Button } from '../../general/button/component';
import { TextInput, Checkbox, TextArea, Select } from '../../general/form/component';
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

    const mode = appToCreate ? 'create' : 'view';
    const appType = appToCreate?.type || appToEdit?.type;
    const appName = appToCreate?.name || appToEdit?.name;

    useEffect(() => {
        if (isOpen) {
            if (mode === 'create') {
                setName('');
                setConfig({});
                setIsEditing(true);
            } else if (appToEdit) {
                setName(appToEdit.name);
                setConfig(appToEdit.config);
                setIsEditing(false); // Start in view mode
            }
        }
    }, [isOpen, appToCreate, appToEdit, mode]);

    const handleSubmit = async () => {
        if (!name) {
            toast.error('Please provide a name');
            return;
        }

        setIsSubmitting(true);
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
                    config
                });
                toast.success('Application updated successfully');
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!appToEdit || !confirm('Are you sure you want to delete this application?')) return;
        
        setIsSubmitting(true);
        try {
            await deleteApplication(appToEdit.id);
            toast.success('Application deleted successfully');
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('An error occurred');
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
                // Optional fields: Region/Zone (often optional but good to have), Log Name (can have default), etc.
                // Strict check on mandatory fields: Project ID.
                // Assuming others might have defaults or are optional based on API flexibility.
                // Let's enforce Project ID at minimum.
                return !!config.gcpProjectId;
            case 'GoogleCloudTrace':
                return !!config.gcpProjectId;
            case 'LangSmith':
                // Api Key is usually required. Project Name might be optional or have default.
                return !!config.apiKey;
            case 'PostgreSQL':
                return !!config.connectionString;
            case 'SQLite':
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
                        />
                        <TextInput 
                            label="Public Key"
                            tooltip="The public key for Langfuse authentication."
                            value={config.publicKey || ''} 
                            onChange={e => setConfig({...config, publicKey: e.target.value})}
                            disabled={!isEditing}
                            type={isEditing ? "text" : "password"}
                        />
                        <TextInput 
                            label="Secret Key"
                            tooltip="The secret key for Langfuse authentication."
                            value={config.secretKey || ''} 
                            onChange={e => setConfig({...config, secretKey: e.target.value})}
                            disabled={!isEditing}
                            type={isEditing ? "text" : "password"}
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
                    />
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
            />

            {renderFields()}

            <ActionButtons>
                {mode === 'view' && !isEditing && (
                    <>
                        <Button $variants="colored" $color="#ef4444" onClick={handleDelete} disabled={isSubmitting}>
                            Delete
                        </Button>
                         <div style={{ flex: 1 }} />
                        <Button $variants="transparent" onClick={() => setIsEditing(true)}>
                            Modify
                        </Button>
                    </>
                )}

                {isEditing && mode === 'view' && (
                     <>
                         <Button $variants="transparent" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
                             Cancel
                         </Button>
                         <div style={{ flex: 1 }} />
                         <Button $variants="base" onClick={handleSubmit} disabled={isSubmitDisabled}>
                             {isSubmitting ? 'Saving...' : 'Save'}
                         </Button>
                     </>
                )}
                
                {mode === 'create' && (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                         <Button 
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
                    </div>
                )}
            </ActionButtons>
        </Modal>
    );
};

export default ApplicationModal;

const ActionButtons = styled.div`
    display: flex;
    gap: 12px;
    margin-top: 16px;
    justify-content: flex-end;
    margin-bottom: 16px;
`;
