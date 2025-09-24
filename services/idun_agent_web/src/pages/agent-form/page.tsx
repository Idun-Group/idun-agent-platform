import { FolderIcon, GithubIcon, NetworkIcon, UploadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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
    FormTextArea,
    LabeledToggleButton,
    TextInput,
} from '../../components/general/form/component';
import ToggleButton from '../../components/general/toggle-button/component';

export default function AgentFormPage() {
    const [name, setName] = useState<string>('');
    const [databaseUrl, setDatabaseUrl] = useState<string | null>(null);
    const [agentPath, setAgentPath] = useState<string>('');
    const [selectedFramework, setSelectedFramework] = useState<string | null>(
        null
    );
    const [selectedObservabilityProvider, setSelectedObservabilityProvider] =
        useState<string | null>(null);
    const { selectedAgentFile } = useAgentFile();

    const [graphDefinitionPath, setGraphDefinitionPath] = useState<string>();

    const [availableFrameworks, setAvailableFrameworks] = useState<any[]>([]);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [selectedSourceType, setSelectedSourceType] = useState<
        'upload' | 'Git' | 'remote' | 'project'
    >('upload');
    const [pyFiles, setPyFiles] = useState<string[]>([]);

    const handleChangesPyfiles = (files: string[]) => {
        setPyFiles(files);

        console.log('Python files in ZIP:', files);
    };


    const handleSourceClick = (
        sourceType: 'upload' | 'Git' | 'remote' | 'project'
    ) => {
        setSelectedSourceType(sourceType);
        setIsPopupOpen(true);
    };


    const [isObservabilityEnabled, setIsObservabilityEnabled] = useState(false);

    const [langfusePublicKey, setLangfusePublicKey] = useState<string>('');
    const [langfuseHost, setLangfuseHost] = useState<string>('');
    const [langfuseSecretKey, setLangfuseSecretKey] = useState<string>('');
    const [langfuseRunName, setLangfuseRunName] = useState<string>('');

    const [dbUrlError, setDbUrlError] = useState<string | null>(null);
    const handleDatabaseUrlChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const url = e.target.value;
        setDatabaseUrl(url);
        setDbUrlError(null);

        const regex = regexMap[selectedDatabaseType];
        if (regex && !regex.test(url)) {
            setDbUrlError(
                `
                Invalid ${selectedDatabaseType} URL format. Please use the correct format.
                exemple : ${
                    {
                        postgres: 'postgres://user:pass@localhost:5432/mydb',
                        mysql: 'mysql://root@127.0.0.1/dbname"',
                        mariadb:
                            'mariadb://root:secret@db.example.com:3306/testdb',
                    }[selectedDatabaseType]
                }
                `
            );
        }
    };

    const { t } = useTranslation();

    const [selectedDatabaseType, setSelectedDatabaseType] = useState<
        'postgres' | 'mysql' | 'mariadb'
    >('postgres');

    const postgresRegex =
        /^postgres:\/\/([a-zA-Z0-9._%+-]+)(:[^@]+)?@([a-zA-Z0-9.-]+)(:\d+)?\/([a-zA-Z0-9_\-]+)$/;
    const mySQLRegex =
        /^mysql:\/\/([a-zA-Z0-9._%+-]+)(:[^@]+)?@([a-zA-Z0-9.-]+)(:\d+)?\/([a-zA-Z0-9_\-]+)$/;
    const mariaDBRegex =
        /^mariadb:\/\/([a-zA-Z0-9._%+-]+)(:[^@]+)?@([a-zA-Z0-9.-]+)(:\d+)?\/([a-zA-Z0-9_\-]+)$/;

    const regexMap: Record<string, RegExp> = {
        postgres: postgresRegex,
        mysql: mySQLRegex,
        mariadb: mariaDBRegex,
    };

    const availableDatabaseTypes = [
        {
            id: 'postgres',
            name: 'PostgreSQL',
        },
        {
            id: 'mysql',
            name: 'MySQL',
        },
        {
            id: 'mariadb',
            name: 'MariaDB',
        },
    ];

    const handleClosePopup = () => {
        setIsPopupOpen(false);
    };

    useEffect(() => {
        fetch('http://localhost:4001/api/v1/framework')
            .then((response) => response.json())
            .then((data) => setAvailableFrameworks(data))
            .catch((error) =>
                console.error('Error fetching frameworks:', error)
            );
    }, []);

    const handleSubmitForm = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        console.log('Submitting form with step:', step);

        if (step < 1) {
            setStep((s) => s + 1);
            return;
        }

        const formData = new FormData();
        if (selectedAgentFile && selectedFramework) {
            formData.append('name', name);
            formData.append('databaseUrl', databaseUrl || '');
            formData.append('agentPath', agentPath);
            formData.append('selectedFramework', selectedFramework);
            formData.append('sourceFile', selectedAgentFile?.file);
        }

        try {
            const response = await fetch(
                'http://localhost:4001/api/v1/agents',
                {
                    method: 'POST',
                    body: formData,
                }
            );

            if (response.ok) {
                toast.success('Agent created successfully!', {});
            } else {
                toast.error('Failed to create agent.', {});
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            toast.error('An error occurred while creating the agent.', {});
        }

        console.log('Form submitted:', formData);
    };
    const [step, setStep] = useState(0);

    return (
        <MainContainer>
            <Header>
                <h1>{t('agent-form.title')}</h1>
                <p>{t('agent-form.description')}</p>
            </Header>
            {/* Steps indicator */}
            <StepsWrapper>
                <StepDot active={step === 0}>1</StepDot>
                <StepLabel>{t('agent-form.tabs.agent')}</StepLabel>
                <StepSeparator />
                <StepDot active={step === 1}>2</StepDot>
                <StepLabel>{t('agent-form.tabs.observability')}</StepLabel>
            </StepsWrapper>

            <Form
                onSubmit={handleSubmitForm}
                onKeyDown={(e: React.KeyboardEvent<HTMLFormElement>) => {
                    // Prevent Enter from submitting the whole form on intermediate steps.
                    if (e.key === 'Enter') {
                        const target = e.target as HTMLElement;
                        const tag = (target.tagName || '').toLowerCase();

                        // Only intercept Enter for inputs/selects (allow Enter in textareas)
                        if (tag === 'input' || tag === 'select') {
                            if (step < 1) {
                                e.preventDefault();
                                setStep((s) => s + 1);
                            }
                        }
                    }
                }}
            >
                {step === 0 && (
                    <>
                        <h2>{t('agent-form.general-info')}</h2>

                        <TextInput
                            label={t('agent-form.name.label')}
                            placeholder={t('agent-form.name.placeholder')}
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />

                        <SourceLabel>
                            {t('agent-form.source.label')}
                        </SourceLabel>
                        <SourceSection>
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

                        <FormSelect
                            label={t('agent-form.graph-definition-path.label')}
                        >
                            <option value="">
                                --{' '}
                                {t('agent-form.graph-definition-path.select')}{' '}
                                --
                            </option>
                            {pyFiles.map((file) => (
                                <option key={file} value={file}>
                                    {file}
                                </option>
                            ))}
                        </FormSelect>

                        <Label>
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
                        </Label>

                        <TextInput
                            label={t('agent-form.agent-path.label')}
                            placeholder={t('agent-form.agent-path.placeholder')}
                            value={agentPath}
                            onChange={(e) => setAgentPath(e.target.value)}
                        />
                    </>
                )}

                {step === 1 && (
                    <>
                        <h2>{t('agent-form.observability.title')}</h2>

                        <Label>
                            {t('agent-form.observability.enabled')}
                            <ToggleButton
                                isOn={isObservabilityEnabled}
                                onToggle={() =>
                                    setIsObservabilityEnabled(
                                        !isObservabilityEnabled
                                    )
                                }
                            />
                        </Label>
                        <Label>
                            {t('agent-form.observability.label')}
                            <sup>*</sup>
                            <SelectButtonContainer>
                                <SelectButton
                                    $variants="base"
                                    type="button"
                                    $color="secondary"
                                    onClick={() =>
                                        setSelectedObservabilityProvider(null)
                                    }
                                    selected={
                                        selectedObservabilityProvider === null
                                    }
                                >
                                    {t('agent-form.observability.tools.none')}
                                </SelectButton>
                                <SelectButton
                                    $variants="base"
                                    $color="secondary"
                                    type="button"
                                    onClick={() =>
                                        setSelectedObservabilityProvider(
                                            'langfuse'
                                        )
                                    }
                                    selected={
                                        selectedObservabilityProvider ===
                                        'langfuse'
                                    }
                                >
                                    Langfuse
                                </SelectButton>
                                <SelectButton
                                    $variants="base"
                                    $color="secondary"
                                    type="button"
                                    onClick={() =>
                                        setSelectedObservabilityProvider(
                                            'phoenix'
                                        )
                                    }
                                    selected={
                                        selectedObservabilityProvider ===
                                        'phoenix'
                                    }
                                >
                                    Phoenix
                                </SelectButton>
                            </SelectButtonContainer>
                        </Label>

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

                        <Label>
                            {t('agent-form.database-type')}
                            <SelectButtonContainer>
                                {availableDatabaseTypes.map((dbType) => (
                                    <SelectButton
                                        $variants="base"
                                        $color="secondary"
                                        type="button"
                                        onClick={() =>
                                            setSelectedDatabaseType(
                                                dbType.id as
                                                    | 'postgres'
                                                    | 'mysql'
                                                    | 'mariadb'
                                            )
                                        }
                                        selected={
                                            selectedDatabaseType === dbType.id
                                        }
                                        key={dbType.id}
                                    >
                                        {dbType.name}
                                    </SelectButton>
                                ))}
                            </SelectButtonContainer>
                        </Label>

                        <TextInput
                            label={t('agent-form.database-url.label')}
                            placeholder={t(
                                'agent-form.database-url.placeholder'
                            )}
                            error={dbUrlError ?? undefined}
                            onChange={handleDatabaseUrlChange}
                        />
                    </>
                )}

                <ButtonContainer>
                    {
                        {
                            0: (
                                <>
                                    <Button
                                        $variants="base"
                                        $color="primary"
                                        type="button"
                                        onClick={() => setIsPopupOpen(true)}
                                    >
                                        {t('agent-form.open-source-popup') ||
                                            'Source'}
                                    </Button>
                                    <Button
                                        $variants="base"
                                        $color="primary"
                                        type="button"
                                        onClick={() => setStep((s) => s + 1)}
                                    >
                                        {t('agent-form.next') || 'Next'}
                                    </Button>
                                </>
                            ),
                            1: (
                                <>
                                    <Button
                                        $variants="base"
                                        $color="primary"
                                        type="button"
                                        onClick={() => setStep((s) => s - 1)}
                                    >
                                        {t('agent-form.back') || 'Back'}
                                    </Button>
                                    <Button
                                        $variants="base"
                                        $color="primary"
                                        type="submit"
                                        disabled={!selectedAgentFile}
                                    >
                                        {t('agent-form.create-agent') ||
                                            'Create Agent'}
                                    </Button>
                                </>
                            ),
                        }[step]
                    }

                </ButtonContainer>
            </Form>

            <SourcePopup
                isOpen={isPopupOpen}
                onClose={handleClosePopup}
                onChangeZip={handleChangesPyfiles}
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

const SelectButton = styled(Button)<{ selected: boolean }>`
    background: ${({ selected }) =>
        selected ? 'var(--color-primary, #8c52ff)' : 'transparent'};
    color: ${({ selected }) =>
        selected ? 'var(--color-background-primary, #16213e)' : 'inherit'};
    border: 2px solid var(--color-primary, #8c52ff);
    border-radius: 8px;
    padding: 12px 16px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background: var(--color-primary, #8c52ff);
        color: var(--color-background-primary, #16213e);
    }
`;

const SelectButtonContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 8px 0;
`;
