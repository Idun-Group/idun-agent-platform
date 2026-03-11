import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import styled from 'styled-components';
import PagedSettingsContainer, {
    type SettingsPage,
} from '../../components/settings/paged-settings-container/component';
import Loader from '../../components/general/loader/component';

const WorkspaceGeneralTab = lazy(
    () => import('../../components/settings/workspace-general/component'),
);
const WorkspaceUsersTab = lazy(
    () => import('../../components/settings/workspace-users/component'),
);

const DEFAULT_PAGE = 'workspace-general';

const SettingsPage = () => {
    const { page } = useParams<{ page?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const activeSlug = page || DEFAULT_PAGE;

    const pages: SettingsPage[] = [
        {
            title: t('settings.workspaces.general', 'General'),
            slug: 'workspace-general',
            group: t('settings.group.workspaces', 'Workspaces'),
            content: (
                <Suspense fallback={<Loader />}>
                    <WorkspaceGeneralTab />
                </Suspense>
            ),
        },
        {
            title: t('settings.workspaces.users', 'Users'),
            slug: 'workspace-users',
            group: t('settings.group.workspaces', 'Workspaces'),
            content: (
                <Suspense fallback={<Loader />}>
                    <WorkspaceUsersTab />
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
    color: #ffffff;
    margin: 0;
`;
