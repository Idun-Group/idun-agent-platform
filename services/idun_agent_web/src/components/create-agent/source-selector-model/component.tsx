import { useEffect, useState } from 'react';
import {
    ButtonGroup,
    SecondaryButton,
    SectionSubtitle,
    SectionTitle,
    TemplateGrid,
} from '../popup-styled';
import { useAgentModel } from '../../../hooks/use-agent-model';
import styled from 'styled-components';
import { Button } from '../../general/button/component';
import useAgentFile from '../../../hooks/use-agent-file';

export default function SourceSelectorModel({
    onClose,
}: {
    onClose: () => void;
}) {
    const {
        getAllAgentModels,
        selectModelId,
        setSelectedModels,
        handleDownloadAgentModel,
    } = useAgentModel();
    const { setSelectedAgentFile } = useAgentFile();

    const [models, setModels] = useState<
        { id: string; name: string; description: string; url: string }[]
    >([]);

    // Handler for 'Fichier prêt' button
    // const handleReady = () => {
    //     if (selectModelId) {
    //         onClose();
    //     }
    // };

    useEffect(() => {
        const fetchModels = async () => {
            const allModels = await getAllAgentModels();
            setModels(allModels);
        };
        fetchModels();
    }, []);

    return (
        <>
            <SectionTitle>Modèle de projet</SectionTitle>
            <SectionSubtitle>
                Commencez avec un modèle pré-configuré
            </SectionSubtitle>

            <TemplateGrid>
                {models.map((model) => (
                    <TemplateCard
                        key={model.id}
                        onClick={() => {
                            if (selectModelId !== model.id) {
                                setSelectedModels(model.id);
                            } else {
                                setSelectedModels(undefined);
                            }
                        }}
                        isSelected={selectModelId === model.id}
                    >
                        <h3>{model.name}</h3>
                        <p>{model.description}</p>
                    </TemplateCard>
                ))}
            </TemplateGrid>

            <ButtonGroup>
                <SecondaryButton onClick={onClose}>Annuler</SecondaryButton>
                <Button
                    $variants="base"
                    $color="primary"
                    onClick={async () => {
                        if (selectModelId) {
                            const blob = await handleDownloadAgentModel(
                                models.find((m) => m.id === selectModelId)
                                    ?.url || ''
                            );
                            setSelectedAgentFile(blob as File, 'Project');

                            onClose();
                        }
                    }}
                    disabled={!selectModelId}
                >
                    Utiliser ce modèle
                </Button>
            </ButtonGroup>
        </>
    );
}

export const TemplateCard = styled.div<{ isSelected: boolean }>`
    background: var(--color-background-tertiary, #2a3f5f);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    padding: 20px;
    cursor: pointer;

    ${({ isSelected }) =>
        isSelected &&
        `
        border-color: var(--color-primary, #8c52ff);
        background: rgba(140, 82, 255, 0.05);
    `}
    transition: all 0.2s;

    &:hover {
        border-color: var(--color-primary, #8c52ff);
        background: rgba(140, 82, 255, 0.05);
    }

    h4 {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-primary, #ffffff);
    }

    p {
        margin: 0;
        font-size: 14px;
        color: var(--color-text-secondary, #8892b0);
    }
`;
