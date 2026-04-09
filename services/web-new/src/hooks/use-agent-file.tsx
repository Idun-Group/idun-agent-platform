import { createContext, useContext, useState, type ReactNode } from 'react';

const AgentFileContext = createContext<
    | {
          agentFile: {
              file: File;
              source: 'Folder' | 'Git' | 'Remote' | 'Project';
          } | null;
          setAgentFile: (
              file: File | null,
              source?: 'Folder' | 'Git' | 'Remote' | 'Project'
          ) => void;
      }
    | undefined
>(undefined);

export const AgentFileProvider = ({ children }: { children: ReactNode }) => {
    const [agentFile, setAgentFile] = useState<{
        file: File;
        source: 'Folder' | 'Git' | 'Remote' | 'Project';
    } | null>(null);
    // Custom setter to match context signature
    const handleSetAgentFile = (
        file: File | null,
        source?: 'Folder' | 'Git' | 'Remote' | 'Project'
    ) => {
        if (file === null) {
            setAgentFile(null);
        } else if (source !== undefined) {
            setAgentFile({ file, source });
        } else {
            throw new Error(
                'Source must be provided when setting an agent file.'
            );
        }
    };

    return (
        <AgentFileContext.Provider
            value={{
                agentFile,
                setAgentFile: handleSetAgentFile,
            }}
        >
            {children}
        </AgentFileContext.Provider>
    );
};

const useAgentFile = () => {
    const context = useContext(AgentFileContext);
    if (!context) {
        throw new Error(
            'useAgentFile must be used within an AgentFileProvider'
        );
    }

    return {
        selectedAgentFile: context.agentFile,
        setSelectedAgentFile: context.setAgentFile,
    };
};

export default useAgentFile;
