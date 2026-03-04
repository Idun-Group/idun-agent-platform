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
import { ProjectProvider } from './hooks/use-project.tsx';
import { ToggleThemeModeProvider } from './hooks/use-toggle-theme-mode.tsx';
import { LoaderProvider } from './hooks/use-loader.tsx';
import { AuthProvider } from './hooks/use-auth.tsx';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <ToggleThemeModeProvider>
                <WorkspaceProvider>
                    <ProjectProvider>
                        <LoaderProvider>
                            <AuthProvider>
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
                            </AuthProvider>
                        </LoaderProvider>
                    </ProjectProvider>
                </WorkspaceProvider>
            </ToggleThemeModeProvider>
        </BrowserRouter>
    </StrictMode>

)
