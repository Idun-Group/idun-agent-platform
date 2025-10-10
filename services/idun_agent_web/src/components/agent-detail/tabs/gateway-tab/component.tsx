import React, { useState } from 'react';
import styled from 'styled-components';
import type { BackendAgent } from '../../../../services/agents';
import {
    Server,
    Link as LinkIcon,
    CheckCircle,
    Slash,
    Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    FormSelect,
    FormTextArea,
    TextInput,
} from '../../../general/form/component';

interface RouteItem {
    id: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | string;
    path: string;
    title: string;
    description?: string;
    active: boolean;
}

const mockRoutes: RouteItem[] = [
    {
        id: 'r1',
        method: 'GET',
        path: '/api/v1/customer-profile',
        title: 'Get customer profile',
        description: 'Retrieve customer profile data using customer id.',
        active: true,
    },
    {
        id: 'r2',
        method: 'POST',
        path: '/api/v1/tickets',
        title: 'Create ticket',
        description: 'Open a support ticket and return ticket id.',
        active: true,
    },
    {
        id: 'r3',
        method: 'POST',
        path: '/api/v1/feedback',
        title: 'Submit feedback',
        description: 'Send user feedback to the knowledge base.',
        active: false,
    },
];

const GatewayTab: React.FC<{ agent?: BackendAgent | null }> = ({ agent }) => {
    const [routes, setRoutes] = useState<RouteItem[]>(mockRoutes);
    const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { t } = useTranslation();

    const toggleRoute = (id: string) => {
        setRoutes((prev) =>
            prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r))
        );
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const anySelected = Object.values(selectedIds).some(Boolean);

    const batchDelete = () => {
        setRoutes((prev) => prev.filter((r) => !selectedIds[r.id]));
        setSelectedIds({});
    };

    const batchDisable = () => {
        setRoutes((prev) =>
            prev.map((r) => (selectedIds[r.id] ? { ...r, active: false } : r))
        );
        setSelectedIds({});
    };

    const addRoute = (route: Omit<RouteItem, 'id'>) => {
        const newRoute: RouteItem = { ...route, id: Date.now().toString() };
        setRoutes((prev) => [newRoute, ...prev]);
    };

    return (
        <Container>
            <Toolbar>
                <Header>
                    <Server size={20} />
                    <h2>{t('gateway.apiRoutes', 'API Routes')}</h2>
                </Header>

                <Controls>
                    <ActionButton onClick={() => setIsModalOpen(true)}>
                        {t('gateway.newRoute', 'New Route')}
                    </ActionButton>
                    <ActionButton
                        onClick={batchDisable}
                        disabled={!anySelected}
                        $warning
                    >
                        {t('gateway.disableSelected', 'Disable selected')}
                    </ActionButton>
                    <ActionButton
                        onClick={batchDelete}
                        disabled={!anySelected}
                        $danger
                    >
                        {t('gateway.deleteSelected', 'Delete selected')}
                    </ActionButton>
                </Controls>
            </Toolbar>

            {agent?.run_config ? (
                <ConfigBlock>
                    <h3>Run Configuration</h3>
                    <pre>
{JSON.stringify(agent.run_config, null, 2)}
                    </pre>
                </ConfigBlock>
            ) : null}

            <List>
                {routes.map((route) => (
                    <Card key={route.id}>
                        <CardLeft>
                            <CheckboxWrapper>
                                <HiddenCheckbox
                                    type="checkbox"
                                    checked={!!selectedIds[route.id]}
                                    onChange={() => toggleSelect(route.id)}
                                />
                                <StyledCheckbox
                                    $checked={!!selectedIds[route.id]}
                                >
                                    {!!selectedIds[route.id] && (
                                        <Check size={12} />
                                    )}
                                </StyledCheckbox>
                            </CheckboxWrapper>
                            <MethodBadge $method={route.method}>
                                {route.method}
                            </MethodBadge>
                            <RouteInfo>
                                <RouteTitle>{route.title}</RouteTitle>
                                <RoutePath>
                                    <LinkIcon size={14} />
                                    <span>{route.path}</span>
                                </RoutePath>
                                {route.description && (
                                    <RouteDescription>
                                        {route.description}
                                    </RouteDescription>
                                )}
                            </RouteInfo>
                        </CardLeft>

                        <CardRight>
                            <Status $active={route.active}>
                                {route.active ? (
                                    <CheckCircle size={14} />
                                ) : (
                                    <Slash size={14} />
                                )}
                                <span>
                                    {route.active
                                        ? t('gateway.status.active', 'Active')
                                        : t(
                                              'gateway.status.disabled',
                                              'Disabled'
                                          )}
                                </span>
                            </Status>
                            <ToggleButton onClick={() => toggleRoute(route.id)}>
                                {route.active
                                    ? t('gateway.disable', 'Disable')
                                    : t('gateway.enable', 'Enable')}
                            </ToggleButton>
                        </CardRight>
                    </Card>
                ))}
            </List>

            {isModalOpen && (
                <ModalOverlay onClick={() => setIsModalOpen(false)}>
                    <ModalContent onClick={(e) => e.stopPropagation()}>
                        <ModalHeader>
                            <h3>{t('gateway.newRoute', 'New Route')}</h3>
                        </ModalHeader>
                        <NewRouteForm
                            onCancel={() => setIsModalOpen(false)}
                            onCreate={(data) => {
                                addRoute(data);
                                setIsModalOpen(false);
                            }}
                        />
                    </ModalContent>
                </ModalOverlay>
            )}
        </Container>
    );
};

export default GatewayTab;

// Styled
const Container = styled.div`
    flex: 1;
    padding: 0 40px;
`;

const ConfigBlock = styled.div`
    margin-bottom: 16px;
    background: var(--color-background-secondary, #0f1724);
    border: 1px solid var(--color-border-primary, #213047);
    border-radius: 8px;
    padding: 12px 16px;
    pre { color: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;

    h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
    }
`;

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const Card = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    background: var(--color-background-secondary, #0f1724);
    border: 1px solid var(--color-border-primary, #213047);
    border-radius: 8px;
`;

const CardLeft = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex: 1;
`;

const MethodBadge = styled.span<{ $method?: string }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 56px;
    padding: 6px 8px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 12px;
    color: var(--color-background-primary, #0f1016);
    background: ${({ $method }) =>
        $method === 'GET'
            ? '#34d399'
            : $method === 'POST'
            ? '#60a5fa'
            : '#f59e0b'};
`;

const RouteInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const RouteTitle = styled.h3`
    margin: 0;
    font-size: 14px;
    color: var(--color-text-primary, #ffffff);
`;

const RoutePath = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-secondary, #8892b0);

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const RouteDescription = styled.div`
    font-size: 13px;
    color: var(--color-text-secondary, #8892b0);
`;

const CardRight = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const Status = styled.div<{ $active: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: ${({ $active }) => ($active ? '#05603a' : '#7f1d1d')};
    background: ${({ $active }) =>
        $active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.08)'};

    span {
        line-height: 1;
    }
`;

const ToggleButton = styled.button`
    background: transparent;
    border: 1px solid var(--color-border-primary, #213047);
    color: var(--color-text-secondary, #8892b0);
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;

    &:hover {
        color: var(--color-text-primary, #ffffff);
        border-color: var(--color-primary, #8c52ff);
    }
`;

// Toolbar and controls
const Toolbar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
`;

const Controls = styled.div`
    display: flex;
    gap: 8px;
`;

const ActionButton = styled.button<{ $danger?: boolean; $warning?: boolean }>`
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-border-primary, #213047);
    background: ${({ $danger, $warning }) =>
        $danger
            ? 'rgba(239,68,68,0.06)'
            : $warning
            ? 'rgba(250,204,21,0.06)'
            : 'transparent'};
    color: var(--color-text-secondary, #8892b0);
    cursor: pointer;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const CheckboxWrapper = styled.label`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    cursor: pointer;
`;

const HiddenCheckbox = styled.input`
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
`;

const StyledCheckbox = styled.span<{ $checked?: boolean }>`
    width: 18px;
    height: 18px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border-primary, #213047);
    background: ${({ $checked }) =>
        $checked ? 'var(--color-primary, #8c52ff)' : 'transparent'};
    color: ${({ $checked }) =>
        $checked
            ? 'var(--color-background-primary, #fff)'
            : 'var(--color-text-secondary, #8892b0)'};
    transition: all 120ms ease;
`;

// Modal
const ModalOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
`;

const ModalContent = styled.div`
    width: 480px;
    background: var(--color-background-primary, #0f1016);
    border: 1px solid var(--color-border-primary, #213047);
    border-radius: 12px;
    padding: 16px;
`;

const ModalHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
`;

// NewRouteForm (inline small component)
const FormRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
`;

// (using project's TextInput and FormTextArea instead of custom Input/TextArea)

const ModalActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
`;

type NewRouteFormProps = {
    onCancel: () => void;
    onCreate: (data: Omit<RouteItem, 'id'>) => void;
};

const NewRouteForm: React.FC<NewRouteFormProps> = ({ onCancel, onCreate }) => {
    const [method, setMethod] = useState<string>('GET');
    const [path, setPath] = useState<string>('');
    const [title, setTitle] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [active, setActive] = useState<boolean>(true);
    const { t } = useTranslation();

    return (
        <div>
            <FormRow>
                <FormSelect
                    label={t('gateway.field.method', 'Method')}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                </FormSelect>
            </FormRow>
            <FormRow>
                <TextInput
                    label={t('gateway.field.path', 'Path')}
                    placeholder="/api/v1/new-route"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                />
            </FormRow>
            <FormRow>
                <TextInput
                    label={t('gateway.field.title', 'Title')}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </FormRow>
            <FormRow>
                <FormTextArea
                    label={t('gateway.field.description', 'Description')}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </FormRow>
            <FormRow>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckboxWrapper>
                        <HiddenCheckbox
                            type="checkbox"
                            checked={active}
                            onChange={() => setActive((s) => !s)}
                        />
                        <StyledCheckbox $checked={active}>
                            {active && <Check size={12} />}
                        </StyledCheckbox>
                    </CheckboxWrapper>
                    <span>{t('gateway.field.active', 'Active')}</span>
                </div>
            </FormRow>
            <ModalActions>
                <ActionButton onClick={onCancel}>
                    {t('gateway.cancel', 'Cancel')}
                </ActionButton>
                <ActionButton
                    onClick={() =>
                        onCreate({
                            method: method as any,
                            path,
                            title,
                            description,
                            active,
                        })
                    }
                >
                    {t('gateway.create', 'Create')}
                </ActionButton>
            </ModalActions>
        </div>
    );
};
