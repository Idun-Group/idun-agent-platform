import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useState, useEffect } from 'react';
import AppMarketplacePage from '../app-marketplace-page/page';
import ApplicationModal from '../../components/applications/application-modal/component';
import ConfiguredAppCard from '../../components/connected-app/configured-app-card/component';
import { fetchApplications, MARKETPLACE_APPS } from '../../services/applications';
import type { ApplicationConfig, MarketplaceApp, AppCategory } from '../../types/application.types';
import { Loader, Plus, Wrench } from 'lucide-react';
import { toast } from 'react-toastify';

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
                            <Button
                                $variants="base"
                                onClick={() => {
                                    setCurrentPage('add');
                                }}
                            >
                                {t('connected-app.navigation.add', 'Add Configuration')}
                            </Button>
                        </EmptyState>
                    )}
                </DashboardContainer>
            );
        }

        if (currentPage === 'add') {
            if (category === 'MCP') {
                const mcpTemplate = MARKETPLACE_APPS.find(app => app.category === 'MCP');
                return (
                    <MCPAddContainer>
                        <MCPCard onClick={() => mcpTemplate && handleMarketplaceAppClick(mcpTemplate)}>
                            <IconWrapper>
                                <Wrench size={40} color="#8c52ff" />
                            </IconWrapper>
                            <CardTitle>Configure New MCP Server</CardTitle>
                            <CardDescription>
                                Connect to an existing Model Context Protocol (MCP) server to extend your agent's capabilities.
                            </CardDescription>
                            <Button $variants="base" style={{ marginTop: 'auto', width: '100%' }}>
                                <Plus size={16} style={{ marginRight: '8px' }} />
                                Configure Server
                            </Button>
                        </MCPCard>
                    </MCPAddContainer>
                );
            }

            return (
                <AppMarketplacePage 
                    onAppClick={handleMarketplaceAppClick} 
                    category={category}
                />
            );
        }
    };

    // Get localized title
    const pageTitleMap: Record<AppCategory, string> = {
        Observability: t('connected-app.categories.observability', 'Observability'),
        Memory: t('connected-app.categories.memory', 'Memory'),
        MCP: t('connected-app.categories.mcp', 'MCP'),
        Guardrails: t('connected-app.categories.guard', 'Guardrails')
    };
    const pageTitle = pageTitleMap[category] ?? '';

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

const MCPAddContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 40px;
    width: 100%;
`;

const MCPCard = styled.div`
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 16px;
    padding: 32px;
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        transform: translateY(-4px);
        border-color: var(--color-primary, #8c52ff);
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
    }
`;

const IconWrapper = styled.div`
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: rgba(140, 82, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
`;

const CardTitle = styled.h3`
    font-size: 20px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 12px;
`;

const CardDescription = styled.p`
    font-size: 14px;
    color: var(--color-text-secondary, #8892b0);
    margin-bottom: 32px;
    line-height: 1.5;
`;
