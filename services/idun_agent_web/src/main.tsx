/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect } from 'react';
import type { ReactNode } from 'react';
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
import { PostHogProvider, usePostHog } from '@posthog/react';
import { runtimeConfig } from './utils/runtime-config.ts';
import { getDeploymentType } from './utils/deployment.ts';

const posthogOptions = {
    api_host: runtimeConfig.POSTHOG_HOST,
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only' as const,
    capture_pageview: true,
    capture_pageleave: true,
};

/**
 * Registers global PostHog super properties attached to every event.
 * Must be rendered inside PostHogProvider.
 */
function DeploymentSuperProperties() {
    const posthog = usePostHog();

    useEffect(() => {
        if (!posthog) return;
        posthog.register({ deployment_type: getDeploymentType() });
    }, [posthog]);

    return null;
}

function Analytics({ children }: { children: ReactNode }) {
    if (runtimeConfig.POSTHOG_ENABLED === 'false') {
        return <>{children}</>;
    }
    return (
        <PostHogProvider apiKey={runtimeConfig.POSTHOG_KEY} options={posthogOptions}>
            <DeploymentSuperProperties />
            {children}
        </PostHogProvider>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Analytics>
        <BrowserRouter>
            <ToggleThemeModeProvider>
                <AuthProvider>
                    <WorkspaceProvider>
                        <ProjectProvider>
                            <LoaderProvider>
                            <GlobalStyles />
                            <ToastStyles />
                            <App />
                            <ToastContainer
                                position="top-right"
                                autoClose={5000}
                                hideProgressBar
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
                            </LoaderProvider>
                        </ProjectProvider>
                    </WorkspaceProvider>
                </AuthProvider>
            </ToggleThemeModeProvider>
        </BrowserRouter>
        </Analytics>
    </StrictMode>

)
