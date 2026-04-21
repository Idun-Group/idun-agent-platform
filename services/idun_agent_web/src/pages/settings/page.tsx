import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import styled from 'styled-components';
import { Settings as SettingsIcon, Users, FolderOpen } from 'lucide-react';
import PagedSettingsContainer, {
    type SettingsPage as SettingsPageConfig,
} from '../../components/settings/paged-settings-container/component';
import Loader from '../../components/general/loader/component';
import useWorkspace from '../../hooks/use-workspace';

const WorkspaceGeneralTab = lazy(
    () => import('../../components/settings/workspace-general/component'),
);
const WorkspaceUsersTab = lazy(
    () => import('../../components/settings/workspace-users/component'),
);
const WorkspaceProjectsTab = lazy(
    () => import('../../components/settings/workspace-projects/component'),
);

const DEFAULT_PAGE = 'workspace-general';

const SettingsPage = () => {
    const { page } = useParams<{ page?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { isCurrentWorkspaceOwner } = useWorkspace();

    // Every tab on this page is a workspace-admin surface. Non-owners have no
    // reason to be here — bounce them back to the agents dashboard.
    if (!isCurrentWorkspaceOwner) {
        return <Navigate to="/agents" replace />;
    }

    const activeSlug = page || DEFAULT_PAGE;

    const pages: SettingsPageConfig[] = [
        {
            title: t('settings.tabs.workspaceGeneral', 'General'),
            slug: 'workspace-general',
            group: t('settings.groups.workspace', 'Workspace'),
            icon: <SettingsIcon size={14} />,
            content: (
                <Suspense fallback={<Loader />}>
                    <WorkspaceGeneralTab />
                </Suspense>
            ),
        },
        {
            title: t('settings.tabs.workspaceUsers', 'Members'),
            slug: 'workspace-users',
            group: t('settings.groups.workspace', 'Workspace'),
            icon: <Users size={14} />,
            content: (
                <Suspense fallback={<Loader />}>
                    <WorkspaceUsersTab />
                </Suspense>
            ),
        },
        {
            title: t('settings.tabs.workspaceProjects', 'All Projects'),
            slug: 'workspace-projects',
            group: t('settings.groups.projects', 'Projects'),
            icon: <FolderOpen size={14} />,
            content: (
                <Suspense fallback={<Loader />}>
                    <WorkspaceProjectsTab />
                </Suspense>
            ),
        },
    ];

    const handlePageChange = (slug: string) => {
        if (slug === DEFAULT_PAGE) {
            navigate('/settings');
        } else {
            navigate(`/settings/${slug}`);
        }
    };

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
    color: hsl(var(--foreground));
    margin: 0;
`;
