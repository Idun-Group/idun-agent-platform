import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import styled from 'styled-components';
import Loader from '../../components/general/loader/component';

const WorkspaceGeneralTab = lazy(
    () => import('../../components/settings/workspace-general/component'),
);
const WorkspaceUsersTab = lazy(
    () => import('../../components/settings/workspace-users/component'),
);

const DEFAULT_TAB = 'workspace-general';

type Tab = {
    label: string;
    slug: string;
};

const SettingsPage = () => {
    const { page } = useParams<{ page?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const activeSlug = page || DEFAULT_TAB;

    const tabs: Tab[] = [
        {
            label: t('settings.workspaces.general', 'General'),
            slug: 'workspace-general',
        },
        {
            label: t('settings.workspaces.users', 'Users'),
            slug: 'workspace-users',
        },
        {
            label: t('settings.appearance', 'Appearance'),
            slug: 'appearance',
        },
        {
            label: t('settings.language', 'Language'),
            slug: 'language',
        },
    ];

    const handleTabChange = (slug: string) => {
        if (slug === DEFAULT_TAB) {
            navigate('/settings');
        } else {
            navigate(`/settings/${slug}`);
        }
    };

    const renderContent = () => {
        switch (activeSlug) {
            case 'workspace-general':
                return (
                    <Suspense fallback={<Loader />}>
                        <WorkspaceGeneralTab />
                    </Suspense>
                );
            case 'workspace-users':
                return (
                    <Suspense fallback={<Loader />}>
                        <WorkspaceUsersTab />
                    </Suspense>
                );
            case 'appearance':
                return (
                    <ContentCard>
                        <SectionTitle>
                            {t('settings.appearance', 'Appearance')}
                        </SectionTitle>
                        <SectionDescription>
                            {t(
                                'settings.appearance.description',
                                'Customize the look and feel of your workspace.',
                            )}
                        </SectionDescription>
                    </ContentCard>
                );
            case 'language':
                return (
                    <ContentCard>
                        <SectionTitle>
                            {t('settings.language', 'Language')}
                        </SectionTitle>
                        <SectionDescription>
                            {t(
                                'settings.language.description',
                                'Choose your preferred language for the interface.',
                            )}
                        </SectionDescription>
                    </ContentCard>
                );
            default:
                return null;
        }
    };

    return (
        <PageContainer>
            <PageHeader>
                <PageTitle>{t('settings.title', 'Settings')}</PageTitle>
                <PageSubtitle>
                    {t(
                        'settings.subtitle',
                        'Manage workspace preferences and configuration',
                    )}
                </PageSubtitle>
            </PageHeader>

            <TabsNav>
                {tabs.map((tab) => (
                    <TabButton
                        key={tab.slug}
                        $active={activeSlug === tab.slug}
                        onClick={() => handleTabChange(tab.slug)}
                    >
                        {tab.label}
                    </TabButton>
                ))}
            </TabsNav>

            <ContentArea>{renderContent()}</ContentArea>
        </PageContainer>
    );
};

export default SettingsPage;

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: #0a0e17;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const PageHeader = styled.div`
    padding: 32px 32px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: #6b7a8d;
    margin: 0;
`;

const TabsNav = styled.div`
    display: flex;
    gap: 32px;
    padding: 0 32px;
    margin-top: 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

const TabButton = styled.button<{ $active: boolean }>`
    display: flex;
    align-items: center;
    background: none;
    border: none;
    padding: 12px 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
    font-family: 'IBM Plex Sans', sans-serif;

    ${(props) =>
        props.$active
            ? `color: #e1e4e8;`
            : `color: #6b7a8d; &:hover { color: #e1e4e8; }`}

    &::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        right: 0;
        height: 2px;
        background-color: #0c5cab;
        opacity: ${(props) => (props.$active ? 1 : 0)};
        transition: opacity 0.2s;
    }
`;

const ContentArea = styled.div`
    padding: 24px 32px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
`;

const ContentCard = styled.div`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 24px;
`;

const SectionTitle = styled.h2`
    font-size: 16px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 8px;
`;

const SectionDescription = styled.p`
    font-size: 14px;
    color: #6b7a8d;
    margin: 0;
`;
