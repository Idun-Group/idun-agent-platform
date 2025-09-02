import { createContext, useContext, useState, type ReactNode } from 'react';

type ToggleThemeModeContextType = {
    themeMode: string;
    setToggleThemeMode: (value: string) => void;
};

const ToggleThemeModeContext = createContext<
    ToggleThemeModeContextType | undefined
>(undefined);

export const ToggleThemeModeProvider = ({
    children,
}: {
    children: ReactNode;
}) => {
    const [value, setValue] = useState<string>('system');

    const setToggleThemeMode = (newValue: string) => {
        setValue(newValue);
    };

    const contextValue: ToggleThemeModeContextType = {
        themeMode: value,
        setToggleThemeMode,
    };

    return (
        <ToggleThemeModeContext.Provider value={contextValue}>
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
