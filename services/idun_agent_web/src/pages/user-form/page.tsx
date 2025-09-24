import { User, Building, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../components/general/button/component';

import useWorkspace from '../../hooks/use-workspace';
import {
    Form,
    FormSelect,
    FormTextArea,
    TextInput,
} from '../../components/general/form/component';
import { useTranslation } from 'react-i18next';

interface Workspace {
    id: string;
    name: string;
}

export default function UserFormPage() {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        role: '',
        department: '',
        bio: '',
        workspaces: [] as string[],
    });
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const { getAllWorkspace } = useWorkspace();

    useEffect(() => {
        const fetchWorkspaces = async () => {
            const data = await getAllWorkspace();
            setWorkspaces(data);
        };
        fetchWorkspaces();
    }, [getAllWorkspace]);

    const handleInputChange =
        (field: string) =>
        (
            e: React.ChangeEvent<
                HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >
        ) => {
            setFormData((prev) => ({
                ...prev,
                [field]: e.target.value,
            }));
        };

    const handleWorkspaceChange = (workspaceId: string) => {
        setFormData((prev) => {
            const newWorkspaces = prev.workspaces.includes(workspaceId)
                ? prev.workspaces.filter((id) => id !== workspaceId)
                : [...prev.workspaces, workspaceId];
            return { ...prev, workspaces: newWorkspaces };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('User form data:', formData);
        // Ici vous pourriez envoyer les données à votre API
    };

    return (
        <MainContainer>
            <Header>
                <User size={32} />
                <h1>{t('user-form.title')}</h1>
                <p>{t('user-form.description')}</p>
            </Header>

            <Form onSubmit={handleSubmit}>
                <SectionTitle>
                    <User size={20} />
                    {t('user-form.personal-information.legend')}
                </SectionTitle>

                <FormRow>
                    <TextInput
                        label={t(
                            'user-form.personal-information.first-name.label'
                        )}
                        placeholder={t(
                            'user-form.personal-information.first-name.placeholder'
                        )}
                        required
                        value={formData.firstName}
                        onChange={handleInputChange('firstName')}
                    />
                    <TextInput
                        label={t(
                            'user-form.personal-information.last-name.label'
                        )}
                        placeholder={t(
                            'user-form.personal-information.last-name.placeholder'
                        )}
                        required
                        value={formData.lastName}
                        onChange={handleInputChange('lastName')}
                    />
                </FormRow>

                <TextInput
                    label={t('user-form.personal-information.email.label')}
                    type="email"
                    placeholder={t(
                        'user-form.personal-information.email.placeholder'
                    )}
                    required
                    value={formData.email}
                    onChange={handleInputChange('email')}
                />

                <TextInput
                    label={t('user-form.personal-information.phone.label')}
                    type="text"
                    placeholder={t(
                        'user-form.personal-information.phone.placeholder'
                    )}
                    value={formData.phone}
                    onChange={handleInputChange('phone')}
                />

                <SectionTitle>
                    <Building size={20} />
                    {t('user-form.workspace.legend')}
                </SectionTitle>
                <WorkspaceSelectionContainer>
                    <p>{t('user-form.workspace.selection')}</p>
                    {workspaces.map((workspace) => (
                        <CheckboxLabel key={workspace.id}>
                            <input
                                type="checkbox"
                                checked={formData.workspaces.includes(
                                    workspace.id
                                )}
                                onChange={() =>
                                    handleWorkspaceChange(workspace.id)
                                }
                            />
                            {workspace.name}
                        </CheckboxLabel>
                    ))}
                </WorkspaceSelectionContainer>

                <SectionTitle>
                    <Building size={20} />
                    {t('user-form.professional-information.legend')}
                </SectionTitle>

                <FormRow>
                    <FormSelect
                        label={t(
                            'user-form.professional-information.role.label'
                        )}
                        value={formData.role}
                        onChange={handleInputChange('role')}
                    >
                        <option value="">
                            {t(
                                'user-form.professional-information.role.placeholder'
                            )}
                        </option>
                        <option value="admin">
                            {t('user-form.professional-information.role.admin')}
                        </option>
                        <option value="manager">
                            {t(
                                'user-form.professional-information.role.manager'
                            )}
                        </option>
                        <option value="developer">
                            {t(
                                'user-form.professional-information.role.developer'
                            )}
                        </option>
                        <option value="analyst">
                            {t(
                                'user-form.professional-information.role.analyst'
                            )}
                        </option>
                        <option value="user">
                            {t('user-form.professional-information.role.user')}
                        </option>
                    </FormSelect>

                    <FormSelect
                        label={t(
                            'user-form.professional-information.department.label'
                        )}
                        value={formData.department}
                        onChange={handleInputChange('department')}
                    >
                        <option value="">
                            {t(
                                'user-form.professional-information.department.placeholder'
                            )}
                        </option>
                        <option value="it">
                            {t(
                                'user-form.professional-information.department.it'
                            )}
                        </option>
                        <option value="marketing">
                            {t(
                                'user-form.professional-information.department.marketing'
                            )}
                        </option>
                        <option value="sales">
                            {t(
                                'user-form.professional-information.department.sales'
                            )}
                        </option>
                        <option value="hr">
                            {t(
                                'user-form.professional-information.department.hr'
                            )}
                        </option>
                        <option value="finance">
                            {t(
                                'user-form.professional-information.department.finance'
                            )}
                        </option>
                        <option value="operations">
                            {t(
                                'user-form.professional-information.department.operations'
                            )}
                        </option>
                    </FormSelect>
                </FormRow>

                <FormTextArea
                    label={t('user-form.professional-information.bio.label')}
                    placeholder={t(
                        'user-form.professional-information.bio.placeholder'
                    )}
                    rows={4}
                    value={formData.bio}
                    onChange={handleInputChange('bio')}
                />

                <SectionTitle>
                    <Calendar size={20} />
                    {t('user-form.permissions.legend')}
                </SectionTitle>

                <PermissionGrid>
                    <PermissionCard>
                        <h4>
                            {t('user-form.permissions.agent-management.title')}
                        </h4>
                        <p>
                            {t(
                                'user-form.permissions.agent-management.description'
                            )}
                        </p>
                        <CheckboxContainer>
                            <input type="checkbox" id="agent-management" />
                            <label htmlFor="agent-management">
                                {t(
                                    'user-form.permissions.agent-management.active'
                                )}
                            </label>
                        </CheckboxContainer>
                    </PermissionCard>

                    <PermissionCard>
                        <h4>
                            {t('user-form.permissions.user-management.title')}
                        </h4>
                        <p>
                            {t(
                                'user-form.permissions.user-management.description'
                            )}
                        </p>
                        <CheckboxContainer>
                            <input type="checkbox" id="user-management" />
                            <label htmlFor="user-management">
                                {t(
                                    'user-form.permissions.user-management.active'
                                )}
                            </label>
                        </CheckboxContainer>
                    </PermissionCard>

                    <PermissionCard>
                        <h4>{t('user-form.permissions.analytics.title')}</h4>
                        <p>
                            {t('user-form.permissions.analytics.description')}
                        </p>
                        <CheckboxContainer>
                            <input type="checkbox" id="analytics" />
                            <label htmlFor="analytics">
                                {t('user-form.permissions.analytics.active')}
                            </label>
                        </CheckboxContainer>
                    </PermissionCard>

                    <PermissionCard>
                        <h4>
                            {t(
                                'user-form.permissions.system-configuration.title'
                            )}
                        </h4>
                        <p>
                            {t(
                                'user-form.permissions.system-configuration.description'
                            )}
                        </p>
                        <CheckboxContainer>
                            <input type="checkbox" id="system-config" />
                            <label htmlFor="system-config">
                                {t(
                                    'user-form.permissions.system-configuration.active'
                                )}
                            </label>
                        </CheckboxContainer>
                    </PermissionCard>
                </PermissionGrid>

                <ButtonContainer>
                    <CancelButton type="button">
                        {t('user-form.cancel')}
                    </CancelButton>
                    <Button $variants="base" $color="primary">
                        {t('user-form.create-user')}
                    </Button>
                </ButtonContainer>
            </Form>
        </MainContainer>
    );
}

// Styled Components
const MainContainer = styled.main`
    min-height: 100vh;
    padding: 40px;
    background: var(--color-background-primary, #0f1016);
    overflow-y: auto;
`;

const Header = styled.div`
    text-align: center;
    margin-bottom: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;

    svg {
        color: var(--color-primary, #8c52ff);
    }

    h1 {
        font-size: 32px;
        font-weight: 700;
        margin: 0;
        color: var(--color-text-primary, #ffffff);
    }

    p {
        font-size: 18px;
        color: var(--color-text-secondary, #8892b0);
        margin: 0;
        line-height: 1.5;
        max-width: 600px;
    }
`;

const SectionTitle = styled.h3`
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin: 32px 0 24px 0;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);

    svg {
        color: var(--color-primary, #8c52ff);
    }

    &:first-of-type {
        margin-top: 0;
    }
`;

const FormRow = styled.div`
    display: flex;
    gap: 16px;
    width: 100%;
`;

const WorkspaceSelectionContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 24px;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid hsl(var(--border));
    background-color: hsl(var(--input));

    p {
        margin: 0 0 8px 0;
        font-weight: 500;
    }
`;

const CheckboxLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
`;

const PermissionGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 32px;

    @media (max-width: 768px) {
        grid-template-columns: 1fr;
    }
`;

const PermissionCard = styled.div`
    background: var(--color-background-tertiary, #2a3f5f);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s ease;

    &:hover {
        border-color: var(--color-primary, #8c52ff);
        background: rgba(140, 82, 255, 0.05);
    }

    h4 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 8px 0;
        color: var(--color-text-primary, #ffffff);
    }

    p {
        font-size: 14px;
        color: var(--color-text-secondary, #8892b0);
        margin: 0 0 16px 0;
        line-height: 1.4;
    }
`;

const CheckboxContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;

    input[type='checkbox'] {
        width: 16px;
        height: 16px;
        accent-color: var(--color-primary, #8c52ff);
        cursor: pointer;
    }

    label {
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text-primary, #ffffff);
        cursor: pointer;
        margin: 0;
    }
`;

const ButtonContainer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    margin-top: 32px;
    padding-top: 32px;
    border-top: 1px solid var(--color-border-primary, #2a3f5f);
`;

const CancelButton = styled.button`
    padding: 16px 32px;
    background: transparent;
    border: 2px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    color: var(--color-text-secondary, #8892b0);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background: var(--color-background-tertiary, #2a3f5f);
        color: var(--color-text-primary, #ffffff);
        border-color: var(--color-text-secondary, #8892b0);
    }
`;
