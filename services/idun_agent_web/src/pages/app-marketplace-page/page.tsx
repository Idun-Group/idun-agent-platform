import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import AppCard from '../../components/app-market-place/app-card/component';
import { TextInput } from '../../components/general/form/component';

export type AppType = {
    id: number;
    name: string;
    by: string;
    urlConnector: string;
    description: string;
    imageUrl: string;
    tag: string;
};

const AppMarketplacePage = () => {
    const { t } = useTranslation();
    const [search, setSearch] = React.useState('');

    const AppList = [
        {
            id: 1,
            name: 'Github',
            by: 'Github',
            urlConnector: 'https://www.github.com',
            description:
                "Importez directement des agents dans l'application depuis des dépôts Github.",
            imageUrl:
                'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Github-desktop-logo-symbol.svg/2048px-Github-desktop-logo-symbol.svg.png',
            tag: 'Repository',
        },
        {
            id: 2,
            name: 'Gitlab',
            by: 'Gitlab',
            urlConnector: 'https://www.gitlab.com',
            description:
                "Importez directement des agents dans l'application depuis des dépôts Gitlab.",
            imageUrl:
                'https://images.icon-icons.com/2699/PNG/512/gitlab_logo_icon_169112.png',
            tag: 'Repository',
        },
        {
            id: 3,
            name: 'Bitbucket',
            by: 'Atlassian',
            urlConnector: 'https://www.bitbucket.org',
            description:
                "Importez directement des agents dans l'application depuis des dépôts Bitbucket.",
            imageUrl:
                'https://cdn4.iconfinder.com/data/icons/logos-and-brands/512/44_Bitbucket_logo_logos-512.png',
            tag: 'Repository',
        },
        {
            id: 4,
            name: 'Azure Devops',
            by: 'Microsoft',
            urlConnector: 'https://www.azure.com',
            description:
                "Importez directement des agents dans l'application depuis des dépôts Azure Devops.",
            imageUrl:
                'https://www.datocms-assets.com/15783/1714031179-azure-devops-icon.svg?auto=format&fit=max&w=1200',
            tag: 'Repository',
        },
        {
            id: 5,
            name: 'Google Cloud Plateform',
            by: 'Google',
            urlConnector: 'https://www.google.com/cloud',
            description:
                'Deployer vos agents directement sur votre Google Cloud Plateform.',
            imageUrl:
                'https://heroiclabs.com/images/pages/gcp/gcp-logo_hu408519032331794749.webp',
            tag: 'Cloud',
        },
        {
            id: 6,
            name: 'Microsoft Azure',
            by: 'Microsoft',
            urlConnector: 'https://www.microsoft.com/en-us/azure',
            description:
                'Deployer vos agents directement sur votre Microsoft Azure.',
            imageUrl:
                'https://upload.wikimedia.org/wikipedia/fr/b/b6/Microsoft-Azure.png',
            tag: 'Cloud',
        },
        {
            id: 7,
            name: 'Amazon Web Services',
            by: 'Amazon',
            urlConnector: 'https://aws.amazon.com/',
            description:
                'Deployer vos agents directement sur votre Amazon Web Services.',
            imageUrl:
                'https://logos-world.net/wp-content/uploads/2021/08/Amazon-Web-Services-AWS-Logo.png',
            tag: 'Cloud',
        },
    ];

    // Filtrage des applications selon la recherche
    const filteredApps = AppList.filter((app) => {
        const query = search.toLowerCase();
        return (
            app.name.toLowerCase().includes(query) ||
            app.by.toLowerCase().includes(query) ||
            app.description.toLowerCase().includes(query)
        );
    });

    return (
        <Main>
            <Header>
                <h1>{t('connected-app.marketplace.title')}</h1>
                <h2>{t('connected-app.marketplace.subtitle')}</h2>
                <SearchInput
                    type="text"
                    placeholder={t(
                        'connected-app.marketplace.search.placeholder'
                    )}
                    name="app-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                        marginBottom: '16px',
                        width: '60%',
                    }}
                />
            </Header>
            <ResultSection>
                <AppListTitle>
                    {t('connected-app.marketplace.all-apps')}
                </AppListTitle>
                <ResultList>
                    {filteredApps.length > 0 ? (
                        filteredApps.map((app) => (
                            <AppCard key={app.id} app={app} />
                        ))
                    ) : (
                        <div
                            style={{
                                color: '#fff',
                                fontSize: '18px',
                                gridColumn: '1/-1',
                                textAlign: 'center',
                                padding: '32px 0',
                            }}
                        >
                            {t(
                                'connected-app.marketplace.search.noResults',
                                'Aucune application trouvée.'
                            )}
                        </div>
                    )}
                </ResultList>
            </ResultSection>
        </Main>
    );
};
export default AppMarketplacePage;

const Main = styled.main`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
`;

const Header = styled.header`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 0;
    background-color: #5050501c;
`;

const SearchInput = styled(TextInput)`
    width: 60%;
    margin-bottom: 16px;

    @media (max-width: 768px) {
        width: 90%;
    }
`;
const ResultSection = styled.section`
    width: 70%;
    margin-top: 32px;
    padding: 16px;

    @media (max-width: 768px) {
        width: 95%;
    }
`;

const ResultList = styled.ul`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    list-style: none;
    padding: 0;
    margin: 0;

    @media (max-width: 768px) {
        grid-template-columns: repeat(2, 1fr);
    }
    @media (max-width: 480px) {
        grid-template-columns: 1fr;
    }
`;

const AppListTitle = styled.h3`
    font-size: 24px;
    font-weight: 600;
    color: #ffffff;
    margin-bottom: 18px;
`;
