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
    FormTextArea,
    TextInput,
} from '../../components/general/form/component';

export default function AgentFormPage() {
    const [name, setName] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [databaseUrl, setDatabaseUrl] = useState<string | null>(null);
    const [agentPath, setAgentPath] = useState<string>('');
    const [selectedFramework, setSelectedFramework] = useState<string | null>(
        null
    );
    const { selectedAgentFile } = useAgentFile();

    const [availableFrameworks, setAvailableFrameworks] = useState<any[]>([]);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [selectedSourceType, setSelectedSourceType] = useState<
        'upload' | 'Git' | 'remote' | 'project'
    >('upload');
    const handleSourceClick = (
        sourceType: 'upload' | 'Git' | 'remote' | 'project'
    ) => {
        setSelectedSourceType(sourceType);
        setIsPopupOpen(true);
    };

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

        const formData = new FormData();
        if (selectedAgentFile && selectedFramework) {
            formData.append('name', name);
            formData.append('description', description);
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

    return (
        <MainContainer>
            <Header>
                <h1>{t('agent-form.title')}</h1>
                <p>{t('agent-form.description')}</p>
            </Header>

            <Form onSubmit={handleSubmitForm}>
                <h2>{t('agent-form.general-info')}</h2>

                <TextInput
                    label={t('agent-form.name.label')}
                    placeholder={t('agent-form.name.placeholder')}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <FormTextArea
                    label={t('agent-form.description.label')}
                    placeholder={t('agent-form.description.placeholder')}
                    rows={4}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />

                <SourceLabel>{t('agent-form.source.label')}</SourceLabel>
                <SourceSection>
                    <SourceCard onClick={() => handleSourceClick('upload')}>
                        <UploadIcon />
                        <p>
                            {t('agent-form.source.upload')}
                            <br />
                            {selectedAgentFile &&
                            selectedAgentFile.source == 'Folder' ? (
                                <span>{selectedAgentFile.file.name}</span>
                            ) : (
                                <span>
                                    {t('agent-form.source.select-folder')}
                                </span>
                            )}
                        </p>
                    </SourceCard>
                    <SourceCard onClick={() => handleSourceClick('Git')}>
                        <GithubIcon />
                        <p>
                            {t('agent-form.source.git')}
                            <br />
                            {selectedAgentFile &&
                            selectedAgentFile.source == 'Git' ? (
                                <span>{selectedAgentFile.file.name}</span>
                            ) : (
                                <span>
                                    {t('agent-form.source.select-git-repo')}
                                </span>
                            )}
                        </p>
                    </SourceCard>
                    <SourceCard onClick={() => handleSourceClick('remote')}>
                        <NetworkIcon />
                        <p>
                            {t('agent-form.source.remote')}
                            <br />
                            {selectedAgentFile &&
                            selectedAgentFile.source == 'Remote' ? (
                                <span>{selectedAgentFile.file.name}</span>
                            ) : (
                                <span>
                                    {t('agent-form.source.select-remote')}
                                </span>
                            )}
                        </p>
                    </SourceCard>
                    <SourceCard onClick={() => handleSourceClick('project')}>
                        <FolderIcon />
                        <p>
                            {t('agent-form.source.project')}
                            <br />
                            {selectedAgentFile &&
                            selectedAgentFile.source == 'Project' ? (
                                <span>{selectedAgentFile.file.name}</span>
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
                <Label>
                    {t('agent-form.framework')}
                    <SelectButtonContainer>
                        {availableFrameworks.map((framework) => (
                            <SelectButton
                                $variants="base"
                                $color="secondary"
                                onClick={() =>
                                    setSelectedFramework(framework.id)
                                }
                                selected={selectedFramework === framework.id}
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

                <Label>
                    {t('agent-form.database-type')}
                    <SelectButtonContainer>
                        {availableDatabaseTypes.map((dbType) => (
                            <SelectButton
                                $variants="base"
                                $color="secondary"
                                onClick={() =>
                                    setSelectedDatabaseType(
                                        dbType.id as
                                            | 'postgres'
                                            | 'mysql'
                                            | 'mariadb'
                                    )
                                }
                                selected={selectedDatabaseType === dbType.id}
                                key={dbType.id}
                            >
                                {dbType.name}
                            </SelectButton>
                        ))}
                    </SelectButtonContainer>
                </Label>

                <TextInput
                    label={t('agent-form.database-url.label')}
                    placeholder={t('agent-form.database-url.placeholder')}
                    error={dbUrlError ?? undefined}
                    onChange={handleDatabaseUrlChange}
                />

                <ButtonContainer>
                    <Button $variants="base" $color="primary">
                        {t('agent-form.create-agent')}
                    </Button>
                </ButtonContainer>
            </Form>

            <SourcePopup
                isOpen={isPopupOpen}
                onClose={handleClosePopup}
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
    padding-top: 32px;
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
