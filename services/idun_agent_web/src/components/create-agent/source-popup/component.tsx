import { GithubIcon, GitlabIcon, Upload, X } from 'lucide-react';
import styled from 'styled-components';
import SourceSelectorModel from '../source-selector-model/component';
import SourceSelectorGit from '../source-selector-git/component';
import SourceSelectorDistant from '../source-selector-distant/component';
import SourceSelectorUpload from '../source-selector-upload/component';
import type { SourceType } from '../../../types/agent.types';
import { useState } from 'react';

type SourcePopupProps = {
    isOpen: boolean;
    onClose: () => void;
    sourceType: 'upload' | 'Git' | 'remote' | 'project';
};

export default function SourcePopup({
    isOpen,
    onClose,
    sourceType,
}: SourcePopupProps) {
    if (!isOpen) return null;
    const [selectedRepoType, setSelectedRepoType] = useState<
        'github' | 'gitlab' | 'bitbucket' | 'azureDevOps'
    >('github');

    const getTitle = () => {
        switch (sourceType) {
            case 'upload':
                return 'Importer des fichiers';
            case 'Git':
                return 'Importer depuis Git';
            case 'remote':
                return 'Source distante';
            case 'project':
                return 'Modèle de projet';
            default:
                return 'Importer des fichiers';
        }
    };

    const getSubtitle = () => {
        switch (sourceType) {
            case 'upload':
                return 'Configurez votre source importer des fichiers';
            case 'Git':
                return 'Configurez votre source Git';
            case 'remote':
                return 'Configurez votre source distante';
            case 'project':
                return 'Configurez votre modèle de projet';
            default:
                return 'Configurez votre source importer des fichiers';
        }
    };

    return (
        <PopupOverlay onClick={onClose}>
            <PopupContainer
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                <PopupHeader sourceType="Git">
                    <PopupTitleContainer>
                        <HeaderContent>
                            <Upload size={24} />
                            <HeaderText>
                                <h2>{getTitle()}</h2>
                                <p>{getSubtitle()}</p>
                            </HeaderText>
                        </HeaderContent>
                        <CloseButton onClick={onClose}>
                            <X size={20} />
                        </CloseButton>
                    </PopupTitleContainer>

                    {sourceType === 'Git' && (
                        <GitNavContainer>
                            <GitNavButton
                                isOpen={selectedRepoType === 'github'}
                                onClick={() => setSelectedRepoType('github')}
                            >
                                <GithubIcon /> Github
                            </GitNavButton>
                            <GitNavButton
                                isOpen={selectedRepoType === 'gitlab'}
                                onClick={() => setSelectedRepoType('gitlab')}
                            >
                                <GitlabIcon /> Gitlab
                            </GitNavButton>
                            <GitNavButton
                                isOpen={selectedRepoType === 'bitbucket'}
                                onClick={() => setSelectedRepoType('bitbucket')}
                            >
                                Bitbucket
                            </GitNavButton>
                            <GitNavButton
                                isOpen={selectedRepoType === 'azureDevOps'}
                                onClick={() =>
                                    setSelectedRepoType('azureDevOps')
                                }
                            >
                                Azure DevOps
                            </GitNavButton>
                        </GitNavContainer>
                    )}
                </PopupHeader>

                <PopupContent>
                    {sourceType === 'upload' && (
                        <SourceSelectorUpload onClose={onClose} />
                    )}

                    {sourceType === 'Git' && (
                        <SourceSelectorGit
                            selectedGitProvider={selectedRepoType}
                            onClose={onClose}
                        />
                    )}

                    {sourceType === 'remote' && (
                        <SourceSelectorDistant onClose={onClose} />
                    )}

                    {sourceType === 'project' && (
                        <SourceSelectorModel onClose={onClose} />
                    )}
                </PopupContent>
            </PopupContainer>
        </PopupOverlay>
    );
}

// Styled Components
const PopupOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
`;

const PopupContainer = styled.div`
    background: var(--color-background-secondary, #1a1a2e);
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
`;

const PopupHeader = styled.div<{ sourceType: SourceType }>`
    background: var(--color-background-primary, #16213e);
    padding: 24px;
    ${({ sourceType }) =>
        sourceType === 'Git' &&
        `
        padding-bottom: 0;
    `}
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
`;

const GitNavContainer = styled.div`
    margin-top: 16px;
`;

const GitNavButton = styled.button<{ isOpen: boolean }>`
    background: transparent;
    border: none;
    color: var(--color-text-secondary, #8892b0);
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
        background: var(--color-background-tertiary, #2a3f5f);
        color: var(--color-text-primary, #ffffff);
    }

    ${({ isOpen }) =>
        isOpen &&
        `
        border-bottom: 2px solid #8C52fF
    `}
`;

const PopupTitleContainer = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
`;

const HeaderContent = styled.div`
    display: flex;
    gap: 16px;
    align-items: flex-start;
`;

const HeaderText = styled.div`
    h2 {
        margin: 0 0 8px 0;
        font-size: 20px;
        font-weight: 600;
        color: var(--color-text-primary, #ffffff);
    }

    p {
        margin: 0;
        font-size: 14px;
        color: var(--color-text-secondary, #8892b0);
    }
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    color: var(--color-text-secondary, #8892b0);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
        background: var(--color-background-tertiary, #2a3f5f);
        color: var(--color-text-primary, #ffffff);
    }
`;

const PopupContent = styled.div`
    padding: 32px;
    max-height: 60vh;
    overflow-y: auto;
`;
