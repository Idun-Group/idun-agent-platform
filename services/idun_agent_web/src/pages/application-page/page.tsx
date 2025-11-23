import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useState, useEffect } from 'react';
import AppMarketplacePage from '../app-marketplace-page/page';
import ApplicationModal from '../../components/applications/application-modal/component';
import ConfiguredAppCard from '../../components/connected-app/configured-app-card/component';
import { fetchApplications } from '../../services/applications';
import type { ApplicationConfig, MarketplaceApp, AppCategory } from '../../types/application.types';
import { Loader } from 'lucide-react';

// Define props to make the component reusable for different categories
interface ApplicationPageProps {
    category: AppCategory;
}

const ApplicationPage = ({ category }: ApplicationPageProps) => {
    const { t } = useTranslation();
    const [currentPage, setCurrentPage] = useState<'configurations' | 'add'>('configurations');

    // Data State
    const [myApps, setMyApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [appToCreate, setAppToCreate] = useState<MarketplaceApp | undefined>(undefined);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | undefined>(undefined);

    const loadApps = async () => {
        setIsLoading(true);
        try {
            const apps = await fetchApplications();
            setMyApps(apps);
        } catch (error) {
            console.error("Failed to fetch apps", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentPage === 'configurations') {
            loadApps();
        }
    }, [currentPage]);

    const handleMarketplaceAppClick = (app: MarketplaceApp) => {
        setAppToCreate(app);
        setAppToEdit(undefined);
        setIsModalOpen(true);
    };

    const handleConfiguredAppClick = (app: ApplicationConfig) => {
        setAppToEdit(app);
        setAppToCreate(undefined);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setAppToCreate(undefined);
        setAppToEdit(undefined);
    };

    const handleSuccess = () => {
        loadApps();
        if (appToCreate) {
            setCurrentPage('configurations');
        }
    };

    // Filter apps by the current page's category
    const filteredApps = myApps.filter(app => app.category === category);

    // Render content based on current tab
    const renderContent = () => {
        if (currentPage === 'configurations') {
            return (
                <DashboardContainer>
                    {isLoading ? (
                        <LoaderContainer>
                            <Loader size={32} className="animate-spin" />
                        </LoaderContainer>
                    ) : filteredApps.length > 0 ? (
                        <AppsGrid>
                            {filteredApps.map(app => (
                                <ConfiguredAppCard 
                                    key={app.id} 
                                    app={app} 
                                    onClick={() => handleConfiguredAppClick(app)} 
                                />
                            ))}
                        </AppsGrid>
                    ) : (
                        <EmptyState>
                            <p>{t('connected-app.dataBoard.emptyState', 'No configurations found.')}</p>
                            <Button $variants="base" onClick={() => setCurrentPage('add')}>
                                {t('connected-app.navigation.add', 'Add Configuration')}
                            </Button>
                        </EmptyState>
                    )}
                </DashboardContainer>
            );
        }

        if (currentPage === 'add') {
            return (
                <AppMarketplacePage 
                    onAppClick={handleMarketplaceAppClick} 
                    category={category}
                />
            );
        }
    };

    // Get localized title
    const pageTitle = category === 'Observability' 
        ? t('connected-app.categories.observability', 'Observability')
        : t('connected-app.categories.memory', 'Memory');

    return (
        <Page>
            <SubHeader>
                <TopContainer>
                    <h1>{pageTitle}</h1>
                </TopContainer>
                <Nav>
                    <NavButton
                        isSelected={currentPage === 'configurations'}
                        onClick={() => setCurrentPage('configurations')}
                        $variants="transparent"
                    >
                        {t('connected-app.navigation.applications', 'Configurations')}
                    </NavButton>
                    <NavButton
                        isSelected={currentPage === 'add'}
                        onClick={() => setCurrentPage('add')}
                        $variants="transparent"
                    >
                        {t('connected-app.navigation.add', 'Add Configuration')}
                    </NavButton>
                </Nav>
            </SubHeader>

            <Content>
                {renderContent()}
            </Content>

            <ApplicationModal 
                isOpen={isModalOpen}
                onClose={handleModalClose}
                onSuccess={handleSuccess}
                appToCreate={appToCreate}
                appToEdit={appToEdit}
            />
        </Page>
    );
};

export default ApplicationPage;

const Page = styled.main`
    display: flex;
    width: 100%;
    height: 100%;
    flex-direction: column;
    flex: 1;
    background: hsl(var(--background));
    overflow: hidden;
`;

const SubHeader = styled.header`
    padding: 2rem 2rem 0 2rem;
    width: 100%;
    background: hsl(var(--background));
    border-bottom: 1px solid var(--color-border-primary);
    flex-shrink: 0;
`;

const Content = styled.div`
    flex: 1;
    padding: 24px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
`;

const Nav = styled.nav`
    display: flex;
    gap: 4px;
    margin-top: 16px;
`;

const TopContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    h1 {
        font-size: 24px;
        font-weight: 600;
        color: #fff;
        margin: 0;
    }
`;

const NavButton = styled(Button)<{ isSelected: boolean }>`
    padding: 12px 24px;
    position: relative;
    border-radius: 0;
    color: ${props => props.isSelected ? '#fff' : '#a0a0a0'};
    background: transparent !important;
    
    &:hover {
        color: #fff;
    }

    ${({ isSelected }) =>
        isSelected &&
        `
        color: #fff;
        &::after {
            content: '';
            display: block;
            height: 2px;
            background: #8c52ff;
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
       }
    `}
`;

const DashboardContainer = styled.div`
    width: 100%;
    max-width: 1400px;
`;

const AppsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 24px;
    justify-items: start;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 400px;
    gap: 20px;
    color: #a0a0a0;
    font-size: 18px;
`;

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    padding: 40px;
    
    .animate-spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

