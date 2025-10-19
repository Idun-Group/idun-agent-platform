import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import GlobalStyles from './global-styles.tsx';
import { BrowserRouter } from 'react-router-dom';
import './i18n'; // Import i18n configuration
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { WorkspaceProvider } from './hooks/use-workspace.tsx';
import { ToggleThemeModeProvider } from './hooks/use-toggle-theme-mode.tsx';
import { LoaderProvider } from './hooks/use-loader.tsx';
import { AuthProvider } from './hooks/use-auth.tsx';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <ToggleThemeModeProvider>
                <WorkspaceProvider>
                    <LoaderProvider>
                        <AuthProvider>
                            <GlobalStyles />
                            <App />
                            <ToastContainer />
                        </AuthProvider>
                    </LoaderProvider>
                </WorkspaceProvider>
            </ToggleThemeModeProvider>
        </BrowserRouter>
    </StrictMode>

)

