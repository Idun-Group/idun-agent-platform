import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AgentDashboardPage from './pages/agent-dashboard/page';
import HomePage from './pages/home/page';
import Header from './layouts/header/layout';
import UserDashboardPage from './pages/user-dashboard/page';
import styled from 'styled-components';
import AgentFormPage from './pages/agent-form/page';
import UserFormPage from './pages/user-form/page';
import AgentDetailPage from './pages/agent-detail/page';
import { AgentFileProvider } from './hooks/use-agent-file';
import { AgentProvider } from './hooks/use-agent-model';
import LoginPage from './pages/login/page';
import SettingsPage from './pages/settings/page';
import SideBar from './layouts/side-bar/dashboard-side-bar/layout';
import SettingSideBar from './layouts/side-bar/setting-side-bar/layout';
import { SettingPageProvider } from './hooks/use-settings-page';
import SigninPage from './pages/signin/page';
import { useEffect } from 'react';
import AppMarketplacePage from './pages/app-marketplace-page/page';
import ConnectedApp from './pages/connected-app/page';
import Loader from './components/general/loader/component';
import { useLoader } from './hooks/use-loader';
import ObservationPage from './pages/observation/page';
// PLOP_IMPORT

function App() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLoading } = useLoader();

    useEffect(() => {
        const token = localStorage.getItem('token');

        if (
            !token &&
            location.pathname !== '/login' &&
            location.pathname !== '/signin'
        ) {
            navigate('/login');
        }
    }, [navigate]);

    return (
        <>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route
                    path="/agents"
                    element={
                        <AppLayout>
                            <Header />
                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <AgentDashboardPage />
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                <Route
                    path="/agents/:id"
                    element={
                        <AppLayout>
                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <AgentDetailPage />
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                <Route
                    path="/users"
                    element={
                        <AppLayout>
                            <Header />
                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <UserDashboardPage />
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                <Route
                    path="/agents/create"
                    element={
                        <AppLayout>

                            <Header />

                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <AgentFileProvider>
                                        <AgentProvider>
                                            <AgentFormPage />
                                        </AgentProvider>
                                    </AgentFileProvider>
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                <Route
                    path="/users/create"
                    element={
                        <AppLayout>
                            <Header />
                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <UserFormPage />
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                <Route path="/agent/:id" element={<AgentDetailPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route
                    path="/settings"
                    element={
                        <SettingPageProvider>
                            <AppLayout>
                                <ContentLayout>
                                    <SettingSideBar />
                                    <MainContent>
                                        <SettingsPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        </SettingPageProvider>
                    }
                />
                <Route path="/signin" element={<SigninPage />} />
                <Route
                    path="/apps"
                    element={
                        <AppLayout>
                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <ConnectedApp />
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                <Route
                    path="/apps/marketplace"
                    element={
                        <AppLayout>
                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <AppMarketplacePage />
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                <Route
                    path="/observation"
                    element={
                        <AppLayout>
                            <Header />
                            <ContentLayout>
                                <SideBar />
                                <MainContent>
                                    <ObservationPage />
                                </MainContent>
                            </ContentLayout>
                        </AppLayout>
                    }
                />
                {/* PLOP_ROUTE */}
            </Routes>
            {isLoading && <Loader />}
        </>
    );
}

// Styled Components pour le layout principal
const AppLayout = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
`;

const ContentLayout = styled.div`
    display: flex;
    flex: 1;
    overflow: hidden;
`;

const MainContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--color-background-primary);
    overflow: scroll;
`;

export default App;
