import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import PagedSettingsContainer, {
    type SettingsPage,
} from '../../components/settings/paged-settings-container/component';
import Loader from '../../components/general/loader/component';
import { useProject } from '../../hooks/use-project';

const WorkspaceGeneralTab = lazy(
    () => import('../../components/settings/workspace-general/component'),
);
const WorkspaceUsersTab = lazy(
    () => import('../../components/settings/workspace-users/component'),
);
const WorkspaceProjectsTab = lazy(
    () => import('../../components/settings/workspace-projects/component'),
);

const SettingsPage = () => {
    const { page } = useParams<{ page?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { canAccessSettings, isWorkspaceOwner, isProjectDataLoaded } = useProject();

    // Route guard: redirect users without settings access (only after data is loaded)
    useEffect(() => {
        if (isProjectDataLoaded && !canAccessSettings) {
            navigate('/agents', { replace: true });
        }
    }, [canAccessSettings, isProjectDataLoaded, navigate]);

    const defaultPage = isWorkspaceOwner ? 'workspace-general' : 'workspace-projects';
    const activeSlug = page || defaultPage;

    const pages = useMemo((): SettingsPage[] => {
        if (isWorkspaceOwner) {
            return [
                {
                    title: t('settings.workspaces.general', 'General'),
                    slug: 'workspace-general',
                    group: t('settings.group.workspaces', 'Workspace'),
                    content: (
                        <Suspense fallback={<Loader />}>
                            <WorkspaceGeneralTab />
                        </Suspense>
                    ),
                },
                {
                    title: t('settings.workspaces.users', 'Members'),
                    slug: 'workspace-users',
                    group: t('settings.group.workspaces', 'Workspace'),
                    content: (
                        <Suspense fallback={<Loader />}>
                            <WorkspaceUsersTab />
                        </Suspense>
                    ),
                },
                {
                    title: t('settings.workspaces.projects', 'Projects'),
                    slug: 'workspace-projects',
                    group: t('settings.group.workspaces', 'Workspace'),
                    content: (
                        <Suspense fallback={<Loader />}>
                            <WorkspaceProjectsTab />
                        </Suspense>
                    ),
                },
            ];
        }

        // Non-owner project admins: only show projects tab
        return [
            {
                title: t('settings.workspaces.projects', 'Projects'),
                slug: 'workspace-projects',
                group: t('settings.group.projectSettings', 'Project Settings'),
                content: (
                    <Suspense fallback={<Loader />}>
                        <WorkspaceProjectsTab />
                    </Suspense>
                ),
            },
        ];
    }, [isWorkspaceOwner, t]);

    const handlePageChange = (slug: string) => {
        if (slug === defaultPage) {
            navigate('/settings');
        } else {
            navigate(`/settings/${slug}`);
        }
    };

    // Show loader while project data is loading, hide if user shouldn't be here
    if (!isProjectDataLoaded) return <Loader />;
    if (!canAccessSettings) return null;

    return (
        <PageContainer>
            <PageHeader>
                <PageTitle>{t('settings.title', 'Settings')}</PageTitle>
            </PageHeader>
            <PagedSettingsContainer
                pages={pages}
                activeSlug={activeSlug}
                onPageChange={handlePageChange}
            />
        </PageContainer>
    );
};

export default SettingsPage;

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
`;

const PageHeader = styled.div`
    padding: 24px 32px 0;
`;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
`;
