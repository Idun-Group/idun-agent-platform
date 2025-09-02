import { createContext, useContext, useState, type ReactNode } from 'react';

type ContextType = {
    settingPage: string;
    setSettingPage: (value: string) => void;
};

const Context = createContext<ContextType | undefined>(undefined);

export const SettingPageProvider = ({ children }: { children: ReactNode }) => {
    const [settingPage, setSettingPage] = useState<string>('profile');
    const contextValue = { settingPage, setSettingPage };
    return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

export const useSettingsPage = () => {
    const context = useContext(Context);
    if (!context) {
        throw new Error(
            'useSettingsPage must be used within a SettingPageProvider'
        );
    }
    return context;
};
