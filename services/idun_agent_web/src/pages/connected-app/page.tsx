import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Overview = lazy(
    () => import('../../components/connected-app/overview/component')
);

const ConnectedApp = () => {
    const [currentPage, setCurrentPage] = useState('overview');
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <Page>
            <Header>
                <TopContainer>
                    <h1>{t('connected-app.title')}</h1>

                    <Button
                        $variants="base"
                        onClick={() => navigate('/apps/marketplace')}
                    >
                        {t('connected-app.button-marketplace')}
                    </Button>
                </TopContainer>
                <Nav>
                    <NavButton
                        isSelected={currentPage === 'overview'}
                        onClick={() => setCurrentPage('overview')}
                        $variants="transparent"
                    >
                        {t('connected-app.navigation.overview')}
                    </NavButton>
                    <NavButton
                        isSelected={currentPage === 'applications'}
                        onClick={() => setCurrentPage('applications')}
                        $variants="transparent"
                    >
                        {t('connected-app.navigation.applications')}
                    </NavButton>
                </Nav>
            </Header>

            {
                {
                    overview: <Overview />,
                    applications: <></>,
                }[currentPage]
            }
        </Page>
    );
};
export default ConnectedApp;

const Page = styled.main`
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    gap: 20px;
`;

const Header = styled.header`
    padding: 16px 24px;
    width: 100%;
    padding-bottom: 0;
    background: #5050501c;
    border-bottom: 1px solid var(--color-border-primary);
    box-shadow: 0 0 10px #8c52ff61;
`;

const Nav = styled.nav`
    display: flex;
    gap: 4px;
`;

const TopContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const NavButton = styled(Button)<{ isSelected: boolean }>`
    padding: 12px 24px;
    position: relative;
    &:hover {
        background: transparent !important;
    }

    ${({ isSelected }) =>
        isSelected &&
        `
        &::after {
            content: '';
            display: block;
            height: 4px;
            background: #007bff;
            border-radius: 4px;
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
       }
    `}
`;
