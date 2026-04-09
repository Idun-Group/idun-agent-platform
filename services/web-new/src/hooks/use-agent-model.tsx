import { createContext, useContext, useState } from 'react';
import { getJson } from '../utils/api';

const AgentModelContext = createContext<
    | {
          modelId: string | undefined;
          setModelId: (id: string | undefined) => void;
      }
    | undefined
>(undefined);

export const AgentProvider = ({ children }: { children: React.ReactNode }) => {
    const [modelId, setModelId] = useState<string | undefined>(undefined);

    return (
        <AgentModelContext.Provider value={{ modelId, setModelId }}>
            {children}
        </AgentModelContext.Provider>
    );
};

export const useAgentModel = () => {
    const context = useContext(AgentModelContext);
    if (!context) {
        throw new Error('useAgentModel must be used within an AgentProvider');
    }

    const getAllAgentModels = async () => {
        try {
            return await getJson('/api/v1/agent-model');
        } catch (error) {
            console.error('Error fetching agent models:', error);
            return [] as unknown[];
        }
    };

    // const getAgentModelById = async (id: string) => {
    //     try {
    //         const response = await fetch(
    //             `http://localhost:4001/api/v1/agent-model/${id}`
    //         );
    //         if (!response.ok) {
    //             throw new Error('Failed to fetch agent model');
    //         }
    //         const data = await response.json();
    //         return data;
    //     } catch (error) {
    //         console.error('Error fetching agent model:', error);
    //         return null;
    //     }
    // };

    async function handleDownloadAgentModel(sourceUrl: string) {
        console.log(`Téléchargement du modèle...`);
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error('Échec du téléchargement');

        const blob = await res.blob(); // On garde le zip en mémoire

        return blob;
    }

    return {
        getAllAgentModels,
        selectModelId: context.modelId,
        setSelectedModels: context.setModelId,
        handleDownloadAgentModel,
    };
};
