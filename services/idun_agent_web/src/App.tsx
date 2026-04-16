import { Route, Routes } from 'react-router-dom';
import AgentDashboardPage from './pages/agent-dashboard/page';
import HomePage from './pages/home/page';
import Header from './layouts/header/layout';
import UserDashboardPage from './pages/user-dashboard/page';
import styled from 'styled-components';
import AgentFormPage from './pages/agent-form/page';
import UserFormPage from './pages/user-form/page';
import AgentDetailPage from './pages/agent-detail/page';

import LoginPage from './pages/login/page';
import SettingsPage from './pages/settings/page';
import UserPreferencesPage from './pages/user-preferences/page';
import SideBar from './layouts/side-bar/dashboard-side-bar/layout';
import SigninPage from './pages/signin/page';
import { useAuth } from './hooks/use-auth';
import ApplicationPage from './pages/application-page/page';
import Loader from './components/general/loader/component';
import { useLoader } from './hooks/use-loader';
import ObservationPage from './pages/observation/page';
import RequireAuth from './components/auth/require-auth';
import MemoryPage from './pages/memory-page/page';
import ObservabilityPage from './pages/observability-page/page';
import MCPPage from './pages/mcp-page/page';
import GuardrailsPage from './pages/guardrails-page/page';
import SSOPage from './pages/sso-page/page';
import IntegrationsPage from './pages/integrations-page/page';
import OnboardingPage from './pages/onboarding/page';
import PromptsPage from './pages/prompts-page/page';
// PLOP_IMPORT

function App() {
    const { isLoading } = useLoader();
    const { isLoading: isAuthLoading } = useAuth();

    return (
        <>
            <Routes>
                {/* Public routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signin" element={<SigninPage />} />


                {/* Protected routes */}
                <Route element={<RequireAuth />}>
                    <Route path="/onboarding" element={<OnboardingPage />} />
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
                                <Header />
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
                        path="/agents/create"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <AgentFormPage />
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
                    <Route
                        path="/preferences/:page?"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <UserPreferencesPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    <Route
                        path="/settings/:page?"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <SettingsPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    <Route
                        path="/observability"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <ObservabilityPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    <Route
                        path="/memory"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <MemoryPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    <Route
                        path="/mcp"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <MCPPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    <Route
                        path="/guardrails"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <GuardrailsPage />
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
                    <Route
                        path="/sso"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <SSOPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    <Route
                        path="/integrations"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <IntegrationsPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    <Route
                        path="/prompts"
                        element={
                            <AppLayout>
                                <Header />
                                <ContentLayout>
                                    <SideBar />
                                    <MainContent>
                                        <PromptsPage />
                                    </MainContent>
                                </ContentLayout>
                            </AppLayout>
                        }
                    />
                    {/* PLOP_ROUTE */}
                </Route>
            </Routes>
            {(isLoading || isAuthLoading) && <Loader />}
        </>
    );
}

const AppLayout = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: #0a0e17;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
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
    background: #0a0e17;
    overflow: auto;
`;

export default App;
