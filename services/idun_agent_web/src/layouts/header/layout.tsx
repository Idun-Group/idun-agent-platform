import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../components/general/button/component';
import { useNavigate } from 'react-router-dom';
import useWorkspace from '../../hooks/use-workspace';
import { useTranslation } from 'react-i18next';

const Header = () => {
    const [workspaces, setWorkspaces] = useState<
        { id: string; name: string; icon: string; description: string }[]
    >([]);
    const navigate = useNavigate();

    const { setSelectedWorkspaceId, getAllWorkspace } = useWorkspace();

    const { t } = useTranslation();

    useEffect(() => {
        getAllWorkspace().then((data) => setWorkspaces(data));
    }, []);

    // Local state for selected environment in the header
    const [environment, setEnvironment] = useState<string>('');

    return (
        <HeaderContainer>
            <SideContainer>
                <Title>
                    <Logo src="/img/logo/logo.svg" alt="Idun Logo" /> Idun
                    Engine
                </Title>

                <Select
                    defaultValue=""
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setSelectedWorkspaceId(e.target.value || null)
                    }
                >
                    <option value="" disabled>
                        {t('header.workspace.select')}
                    </option>
                    {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                            {workspace.icon} {workspace.name}
                        </option>
                    ))}
                </Select>
            </SideContainer>

            <SideContainer>
                <Select
                    defaultValue=""
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setEnvironment(e.target.value)
                    }
                    style={{ background: '#FD00044D' }}
                >
                    <option value="" disabled>
                        {t('header.environment.select')}
                    </option>
                    <option value="development">
                        {t('header.environment.development')}
                    </option>
                    <option value="staging">
                        {t('header.environment.staging')}
                    </option>
                    <option value="production">
                        {t('header.environment.production')}
                    </option>
                </Select>
                <Button
                    $variants="base"
                    $color="primary"
                    onClick={() => navigate('/settings')}
                >
                    {t('header.settings')}
                </Button>
                <EnvLabel>
                    {environment
                        ? t(`header.environment.${environment}`)
                        : null}
                </EnvLabel>
            </SideContainer>
        </HeaderContainer>
    );
};

export default Header;

const HeaderContainer = styled.header`
    background-color: hsl(var(--header-bg));
    padding: 1rem 1.5rem;
    border-bottom: 1px solid hsl(var(--header-border));
    transition: background-color 0.3s ease, border-color 0.3s ease;
    display: flex;
    justify-content: space-between;
    flex-shrink: 0;
    width: 100%;
`;

const Logo = styled.img`
    height: 40px;
    margin-right: 0.5rem;
    filter: brightness(0) invert(1); /* Rend le logo blanc pour le thème sombre */
`;

const Title = styled.h1`
    font-size: 1.5rem;
    color: hsl(var(--header-text));
    display: flex;
    align-items: center;
    margin: 0;
    font-weight: 600;
`;

const Select = styled.select`
    margin-left: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--border));
    background-color: hsl(var(--background));
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    min-width: 200px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background-color: hsl(var(--accent));
        border-color: hsl(var(--app-purple));
    }

    &:focus {
        border-color: hsl(var(--app-purple));
        outline: none;
        box-shadow: 0 0 0 2px hsl(var(--app-purple) / 0.2);
    }

    option {
        background-color: hsl(var(--background));
        color: hsl(var(--foreground));
        padding: 0.5rem;
    }
`;

const SideContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 1rem;
`;

const EnvLabel = styled.span`
    font-size: 0.875rem;
    color: hsl(var(--header-text));
    opacity: 0.85;
    margin-left: 0.5rem;
`;
