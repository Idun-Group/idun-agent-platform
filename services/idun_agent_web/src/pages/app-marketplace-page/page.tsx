import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import AppCard from '../../components/app-market-place/app-card/component';
import { TextInput } from '../../components/general/form/component';
import { MARKETPLACE_APPS } from '../../services/applications';
import type { MarketplaceApp, AppCategory } from '../../types/application.types';

interface AppMarketplaceProps {
    onAppClick: (app: MarketplaceApp) => void;
    category?: AppCategory; // Optional category filter
}

const AppMarketplacePage = ({ onAppClick, category }: AppMarketplaceProps) => {
    const { t } = useTranslation();
    const [search, setSearch] = React.useState('');

    // If a category prop is provided, use it to filter. Otherwise, default to showing all or a default tab if we had tabs.
    // Since the UI for tabs was removed based on previous instructions, we essentially filter by the passed category if present.

    const filteredApps = MARKETPLACE_APPS.filter((app) => {
        const matchesSearch = app.name.toLowerCase().includes(search.toLowerCase()) ||
                              app.description.toLowerCase().includes(search.toLowerCase());
        
        // If category is provided, filter by it. If not, show all (or handle as needed).
        // The previous logic used an internal activeTab state which forced 'Observability'.
        // We now respect the passed category prop.
        const matchesCategory = category ? app.category === category : true;
        
        return matchesSearch && matchesCategory;
    });

    return (
        <Container>
            <MainLayout>
                <ContentArea>
            <Header>
                        <Title>{t('connected-app.marketplace.title', 'Add New Configuration')}</Title>
                        <Subtitle>{t('connected-app.marketplace.subtitle', 'Create persisted configurations to reuse across your agents')}</Subtitle>
                <SearchInput
                    type="text"
                            placeholder={t('connected-app.marketplace.search.placeholder', 'Search apps...')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </Header>

                    <Grid>
                        {filteredApps.map((app) => (
                            <CardWrapper key={app.id} onClick={() => onAppClick(app)}>
                                <AppCard app={app} />
                            </CardWrapper>
                        ))}
                        {filteredApps.length === 0 && (
                            <NoResults>No applications found.</NoResults>
                    )}
                    </Grid>
                </ContentArea>
            </MainLayout>
        </Container>
    );
};

export default AppMarketplacePage;

const Container = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    max-width: 1400px;
    margin: 0; /* Removed auto margins to align left */
`;

const MainLayout = styled.div`
    display: flex;
    flex: 1;
    gap: 32px;
    width: 100%;
`;

const Sidebar = styled.aside`
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
    border-right: 1px solid #25325a;
    padding-right: 24px;
`;

const ContentArea = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
`;

const Title = styled.h1`
    font-size: 28px;
    font-weight: 600;
    color: #fff;
    margin: 0;
`;

const Subtitle = styled.h2`
    font-size: 14px;
    color: #a0a0a0;
    font-weight: normal;
    margin: 0;
`;

const SearchInput = styled(TextInput)`
    width: 100%;
    
    input {
        background: #0f1016;
    }
`;

const FilterSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const FilterTitle = styled.h3`
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: #64748b;
    margin: 0;
    padding-left: 8px;
`;

const FilterList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const FilterItem = styled.button<{ $isActive: boolean }>`
    background: ${props => props.$isActive ? '#8c52ff' : 'transparent'};
    color: ${props => props.$isActive ? '#fff' : '#a0a0a0'};
    border: none;
    border-radius: 6px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;

    &:hover {
        background: ${props => props.$isActive ? '#8c52ff' : '#1a1a2e'};
        color: #fff;
    }
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px;
    width: 100%;
    margin-bottom: 24px;
`;

const CardWrapper = styled.div`
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
        transform: translateY(-4px);
    }

    & > * {
        pointer-events: none;
    }
`;

const NoResults = styled.div`
    grid-column: 1 / -1;
    text-align: center;
    color: #a0a0a0;
    padding: 40px;
    background: #1a1a2e;
    border-radius: 8px;
    border: 1px dashed #25325a;
`;
