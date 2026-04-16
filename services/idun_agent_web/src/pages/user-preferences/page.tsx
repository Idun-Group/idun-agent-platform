import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import styled from 'styled-components';
import PagedSettingsContainer, {
    type SettingsPage,
} from '../../components/settings/paged-settings-container/component';
import Loader from '../../components/general/loader/component';

const PreferencesGeneralTab = lazy(
    () => import('../../components/settings/preferences-general/component'),
);

const DEFAULT_PAGE = 'general';

const UserPreferencesPage = () => {
    const { page } = useParams<{ page?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const activeSlug = page || DEFAULT_PAGE;

    const pages: SettingsPage[] = [
        {
            title: t('settings.preferences.general', 'General'),
            slug: 'general',
            group: t('settings.group.preferences', 'Preferences'),
            content: (
                <Suspense fallback={<Loader />}>
                    <PreferencesGeneralTab />
                </Suspense>
            ),
        },
    ];

    const handlePageChange = (slug: string) => {
        if (slug === DEFAULT_PAGE) {
            navigate('/preferences');
        } else {
            navigate(`/preferences/${slug}`);
        }
    };

    return (
        <PageContainer>
            <PageHeader>
                <PageTitle>{t('preferences.title', 'Preferences')}</PageTitle>
            </PageHeader>
            <PagedSettingsContainer
                pages={pages}
                activeSlug={activeSlug}
                onPageChange={handlePageChange}
            />
        </PageContainer>
    );
};

export default UserPreferencesPage;

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: #0a0e17;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const PageHeader = styled.div`
    padding: 24px 32px 0;
`;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
`;
