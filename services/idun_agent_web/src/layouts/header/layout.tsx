import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import useWorkspace from '../../hooks/use-workspace';
import { useProject } from '../../hooks/use-project';
import { useAuth } from '../../hooks/use-auth';
import { useTranslation } from 'react-i18next';
import ProjectManager from '../../components/project-manager/component';

const Header = () => {
    const [workspaces, setWorkspaces] = useState<
        { id: string; name: string; icon: string; description: string }[]
    >([]);
    const navigate = useNavigate();

    const { setSelectedWorkspaceId, getAllWorkspace } = useWorkspace();
    const { selectedProjectId, setSelectedProjectId, projects, refreshProjects } = useProject();
    const { session, isLoading: isAuthLoading } = useAuth();
    const [showProjectManager, setShowProjectManager] = useState(false);

    const { t } = useTranslation();

    useEffect(() => {
        if (isAuthLoading || !session) return;
        getAllWorkspace().then((data) => setWorkspaces(data));
        refreshProjects();
    }, [isAuthLoading, session, getAllWorkspace, refreshProjects]);

    const [workspaceId, setWorkspaceId] = useState<string>('');

    return (
        <HeaderContainer>
            <SideContainer>
                <Title onClick={() => navigate('/agents')} style={{ cursor: 'pointer' }}>
                    <Logo src="/img/logo/favicon.svg" alt="Idun Logo" /> Idun Platform
                </Title>

                {/** Workspace selector temporarily disabled */}
                {false && (
                    <Select
                        value={workspaceId}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const value = e.target.value;
                            setWorkspaceId(value);
                            setSelectedWorkspaceId(value || null);
                        }}
                    >
                        <option value="">
                            {t('header.workspace.select')}
                        </option>
                        {workspaces.length === 0 ? (
                            <option value="" disabled>
                                No workspaces
                            </option>
                        ) : null}
                        {workspaces.map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                                {workspace.icon} {workspace.name}
                            </option>
                        ))}
                    </Select>
                )}

                {session && projects.length > 0 && (
                    <Select
                        value={selectedProjectId || ''}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const value = e.target.value;
                            if (value === '__manage__') {
                                setShowProjectManager(true);
                                return;
                            }
                            setSelectedProjectId(value || null);
                        }}
                    >
                        <option value="">{t('header.project.all')}</option>
                        {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                                {project.name}
                                {project.is_default ? ` (${t('projects.default')})` : ''}
                            </option>
                        ))}
                        <option value="__manage__">{t('header.project.manage')}</option>
                    </Select>
                )}
            </SideContainer>

            {showProjectManager && (
                <ProjectManager onClose={() => setShowProjectManager(false)} />
            )}
        </HeaderContainer>
    );
};

export default Header;

const HeaderContainer = styled.header`
    background-color: hsl(var(--header-bg));
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid hsl(var(--header-border));
    transition: background-color 0.3s ease, border-color 0.3s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: saturate(180%) blur(8px);
    background-color: hsl(var(--header-bg) / 0.9);
`;

const Logo = styled.img`
    height: 28px;
    margin-right: 0.5rem;
`;

const Title = styled.h1`
    font-size: 1.25rem;
    color: hsl(var(--header-text));
    display: flex;
    align-items: center;
    margin: 0;
    font-weight: 600;
    letter-spacing: 0.01em;
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
    gap: 0.75rem;
`;
