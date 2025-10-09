import { createContext, useContext, useState, type ReactNode } from 'react';

type LoaderContextType = {
    isLoading: boolean;
    setIsLoading: (value: boolean) => void;
};

const LoaderContext = createContext<LoaderContextType | undefined>(undefined);

export const LoaderProvider = ({ children }: { children: ReactNode }) => {
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const setLoader = (newValue: boolean) => {
        setIsLoading(newValue);
    };

    const contextValue: LoaderContextType = {
        isLoading,
        setIsLoading: setLoader,
    };

    return (
        <LoaderContext.Provider value={contextValue}>
            {children}
        </LoaderContext.Provider>
    );
};

export const useLoader = () => {
    const context = useContext(LoaderContext);
    if (!context) {
        throw new Error('useLoader must be used within a LoaderProvider');
    }
    return context;
};
