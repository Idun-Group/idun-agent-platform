import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import GlobalStyles from './global-styles.tsx';
import { BrowserRouter } from 'react-router-dom';
import './i18n'; // Import i18n configuration
import { ToastContainer, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ToastStyles from './components/toast/toast-styles';
import { WorkspaceProvider } from './hooks/use-workspace.tsx';
import { ToggleThemeModeProvider } from './hooks/use-toggle-theme-mode.tsx';
import { LoaderProvider } from './hooks/use-loader.tsx';
import { AuthProvider } from './hooks/use-auth.tsx';
import { ProjectProvider } from './hooks/use-project.tsx';
import { PostHogProvider } from '@posthog/react';
import { runtimeConfig } from './utils/runtime-config.ts';

const posthogOptions = {
    api_host: runtimeConfig.POSTHOG_HOST,
    person_profiles: 'identified_only' as const,
    capture_pageview: true,
    capture_pageleave: true,
};

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PostHogProvider apiKey={runtimeConfig.POSTHOG_KEY} options={posthogOptions}>
        <BrowserRouter>
            <ToggleThemeModeProvider>
                <WorkspaceProvider>
                    <LoaderProvider>
                        <AuthProvider>
                            <ProjectProvider>
                            <GlobalStyles />
                            <ToastStyles />
                            <App />
                            <ToastContainer
                                position="top-right"
                                autoClose={5000}
                                hideProgressBar={false}
                                newestOnTop
                                closeOnClick
                                rtl={false}
                                pauseOnFocusLoss={false}
                                draggable={false}
                                pauseOnHover
                                theme="dark"
                                transition={Slide}
                                limit={5}
                            />
                            </ProjectProvider>
                        </AuthProvider>
                    </LoaderProvider>
                </WorkspaceProvider>
            </ToggleThemeModeProvider>
        </BrowserRouter>
        </PostHogProvider>
    </StrictMode>

)
