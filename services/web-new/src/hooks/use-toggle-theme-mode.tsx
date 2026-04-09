import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

type ToggleThemeModeContextType = {
    themeMode: ThemeMode;
    setToggleThemeMode: (value: ThemeMode) => void;
};

const STORAGE_KEY = 'idun-theme-mode';

function getStoredMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
}

function getSystemPreference(): 'light' | 'dark' {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(mode: ThemeMode) {
    const resolved = mode === 'system' ? 'dark' : mode;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
}

const ToggleThemeModeContext = createContext<
    ToggleThemeModeContextType | undefined
>(undefined);

export const ToggleThemeModeProvider = ({
    children,
}: {
    children: ReactNode;
}) => {
    const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredMode);

    const setToggleThemeMode = useCallback((newValue: ThemeMode) => {
        setThemeMode(newValue);
        localStorage.setItem(STORAGE_KEY, newValue);
        applyTheme(newValue);
    }, []);

    // Apply theme on mount
    useEffect(() => {
        applyTheme(themeMode);
    }, [themeMode]);

    // Listen for system preference changes when mode is 'system'
    useEffect(() => {
        if (themeMode !== 'system') return;

        const mq = window.matchMedia('(prefers-color-scheme: light)');
        const handler = () => applyTheme('system');
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [themeMode]);

    return (
        <ToggleThemeModeContext.Provider value={{ themeMode, setToggleThemeMode }}>
            {children}
        </ToggleThemeModeContext.Provider>
    );
};

export const useToggleThemeMode = () => {
    const context = useContext(ToggleThemeModeContext);
    if (!context) {
        throw new Error(
            'useToggleThemeMode must be used within a ToggleThemeModeProvider'
        );
    }
    return context;
};
