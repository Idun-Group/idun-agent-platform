import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import styled from 'styled-components';
import { Settings as SettingsIcon, Users, FolderOpen, UserPlus } from 'lucide-react';
import PagedSettingsContainer, {
    type SettingsPage as SettingsPageConfig,
} from '../../components/settings/paged-settings-container/component';
import Loader from '../../components/general/loader/component';

const WorkspaceGeneralTab = lazy(
    () => import('../../components/settings/workspace-general/component'),
);
const WorkspaceUsersTab = lazy(
    () => import('../../components/settings/workspace-users/component'),
);
const WorkspaceProjectsTab = lazy(
    () => import('../../components/settings/workspace-projects/component'),
);
const ProjectMembersTab = lazy(
    () => import('../../components/settings/project-members/component'),
);

const DEFAULT_PAGE = 'workspace-general';

const SettingsPage = () => {
    const { page } = useParams<{ page?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();

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
        {
            title: t('settings.tabs.projectMembers', 'Project Members'),
            slug: 'project-members',
            group: t('settings.groups.projects', 'Projects'),
            icon: <UserPlus size={14} />,
            content: (
                <Suspense fallback={<Loader />}>
                    <ProjectMembersTab />
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
