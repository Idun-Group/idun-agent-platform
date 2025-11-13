import { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';
import useWorkspace from '../../hooks/use-workspace';
import { useAuth } from '../../hooks/use-auth';
import { useTranslation } from 'react-i18next';

const Header = () => {
    const [workspaces, setWorkspaces] = useState<
        { id: string; name: string; icon: string; description: string }[]
    >([]);
    const navigate = useNavigate();
    const location = useLocation();

    const { setSelectedWorkspaceId, getAllWorkspace } = useWorkspace();
    const { session, isLoading: isAuthLoading } = useAuth();

    const { t } = useTranslation();

    useEffect(() => {
        if (isAuthLoading || !session) return;
        getAllWorkspace().then((data) => setWorkspaces(data));
    }, [isAuthLoading, session, getAllWorkspace]);

    // Local state for selected environment and workspace in the header
    const [environment, setEnvironment] = useState<string>('');
    const [workspaceId, setWorkspaceId] = useState<string>('');

    // Sync environment with URL param on mount and when URL changes
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const env = params.get('env') || '';
        setEnvironment(env);
    }, [location.search]);

    // Auto-size env select to selected option text
    const envSelectRef = useRef<HTMLSelectElement>(null);
    const updateEnvWidth = useCallback(() => {
        const el = envSelectRef.current;
        if (!el) return;
        const selectedText = el.options[el.selectedIndex]?.text || '';
        const span = document.createElement('span');
        const cs = getComputedStyle(el);
        span.style.position = 'fixed';
        span.style.visibility = 'hidden';
        span.style.whiteSpace = 'pre';
        span.style.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
        span.textContent = selectedText;
        document.body.appendChild(span);
        const textWidth = span.getBoundingClientRect().width;
        document.body.removeChild(span);
        const padding = 32; // left+right padding from styled Select
        const arrowRoom = 20; // dropdown arrow space
        el.style.width = `${Math.ceil(textWidth + padding + arrowRoom)}px`;
    }, []);

    useEffect(() => {
        updateEnvWidth();
        const onResize = () => updateEnvWidth();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [environment, updateEnvWidth]);

    return (
        <HeaderContainer>
            <SideContainer>
                <Title>
                    <Logo src="/img/logo/logo.svg" alt="Idun Logo" /> Idun
                    Engine
                </Title>

                {/** Workspace selector temporarily disabled */}
                {false && (
                    <Select
                        value={workspaceId}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const value = e.target.value;
                            setWorkspaceId(value);
                            setSelectedWorkspaceId(value || null);
                        }}
                    >
                        <option value="">
                            {t('header.workspace.select')}
                        </option>
                        {workspaces.length === 0 ? (
                            <option value="" disabled>
                                {/* Avoid i18n missingKey spam until translation is added */}
                                No workspaces
                            </option>
                        ) : null}
                        {workspaces.map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                                {workspace.icon} {workspace.name}
                            </option>
                        ))}
                    </Select>
                )}
            </SideContainer>

            {location.pathname !== '/agents/create' && (
                <SideContainer>
                    <EnvSelect
                        ref={envSelectRef}
                        value={environment}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const value = e.target.value;
                            setEnvironment(value);
                            const params = new URLSearchParams(location.search);
                            if (!value) {
                                params.delete('env');
                            } else {
                                params.set('env', value);
                            }
                            navigate(
                                {
                                    pathname: location.pathname,
                                    search: params.toString()
                                        ? `?${params.toString()}`
                                        : '',
                                },
                                { replace: true }
                            );
                            // update width after change
                            requestAnimationFrame(updateEnvWidth);
                        }}
                    >
                        <option value="">
                            {t('header.environment.select')}
                        </option>
                        <option value="development">
                            {t('header.environment.development')}
                        </option>
                        <option value="staging">
                            {t('header.environment.staging')}
                        </option>
                        <option value="production">
                            {t('header.environment.production')}
                        </option>
                    </EnvSelect>
                </SideContainer>
            )}
        </HeaderContainer>
    );
};

export default Header;

const HeaderContainer = styled.header`
    background-color: hsl(var(--header-bg));
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid hsl(var(--header-border));
    transition: background-color 0.3s ease, border-color 0.3s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: saturate(180%) blur(8px);
    background-color: hsl(var(--header-bg) / 0.9);
`;

const Logo = styled.img`
    height: 28px;
    margin-right: 0.5rem;
`;

const Title = styled.h1`
    font-size: 1.25rem;
    color: hsl(var(--header-text));
    display: flex;
    align-items: center;
    margin: 0;
    font-weight: 600;
    letter-spacing: 0.01em;
`;

const Select = styled.select`
    margin-left: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--border));
    background-color: hsl(var(--background));
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    min-width: 200px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background-color: hsl(var(--accent));
        border-color: hsl(var(--app-purple));
    }

    &:focus {
        border-color: hsl(var(--app-purple));
        outline: none;
        box-shadow: 0 0 0 2px hsl(var(--app-purple) / 0.2);
    }

    option {
        background-color: hsl(var(--background));
        color: hsl(var(--foreground));
        padding: 0.5rem;
    }
`;

const EnvSelect = styled(Select)`
    background: hsl(var(--accent));
    color: hsl(var(--header-text));
    border-color: hsl(var(--header-border));
    min-width: unset;
    width: auto;
    display: inline-block;

    &:hover {
        background: hsl(var(--accent));
        border-color: hsl(var(--app-purple));
    }
`;

const SideContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
`;

// Removed EnvLabel badge for environment selection
