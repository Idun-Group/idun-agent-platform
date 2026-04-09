import useAgentFile from '../../../hooks/use-agent-file';

import { getAllFilePathFromZip } from '../../../utils/zip-session';

import {
    ButtonGroup,
    FileInfo,
    PrimaryButton,
    RecommendedStructure,
    RemoveFileButton,
    SecondaryButton,
    SectionSubtitle,
    SectionTitle,
    UploadArea,
    UploadText,
    WarningIcon,
} from '../popup-styled';
import { Upload } from 'lucide-react';

const SourceSelectorUpload = ({
    onClose,
    onChangeZip,
}: {
    onClose: () => void;
    onChangeZip: (pyFiles: string[]) => void;
}) => {

    const { selectedAgentFile, setSelectedAgentFile } = useAgentFile();

    // Handler for 'Fichier prêt' button
    const handleReady = () => {
        if (selectedAgentFile) {
            onClose();
        }
    };
    return (
        <>
            <SectionTitle>Importer un package d'agent</SectionTitle>
            {selectedAgentFile ? (
                <div
                    style={{
                        textAlign: 'center',
                        marginBottom: 24,
                        color: '#0C5CAB',
                        fontWeight: 500,
                    }}
                >
                    {selectedAgentFile.file.name}
                </div>
            ) : (
                <SectionSubtitle>
                    Téléchargez votre agent sous forme de fichier ZIP contenant
                    tout le code et la configuration nécessaires
                </SectionSubtitle>
            )}

            <UploadArea>
                <Upload size={48} />
                <input
                    type="file"
                    accept=".zip"
                    style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        left: 0,
                        top: 0,
                        cursor: 'pointer',
                    }}

                    onChange={async (e) => {
                        const selected = e.target.files && e.target.files[0];
                        if (selected) {
                            const yamlFiles = await getAllFilePathFromZip(
                                selected,
                                'yaml'
                            );

                            onChangeZip(yamlFiles);

                            setSelectedAgentFile(selected, 'Folder');
                        }
                    }}
                />
                <UploadText>
                    <strong>Déposez votre fichier ZIP ici</strong>
                    <span>ou cliquez pour parcourir</span>
                </UploadText>
            </UploadArea>

            <FileInfo>
                <span>Format supporté : fichiers ZIP uniquement</span>
                {selectedAgentFile && (
                    <>
                        <div
                            style={{
                                marginTop: 8,
                                color: '#0C5CAB',
                            }}
                        >
                            Fichier sélectionné : {selectedAgentFile.file.name}
                        </div>
                        <RemoveFileButton
                            type="button"
                            onClick={() => setSelectedAgentFile(null)}
                        >
                            Supprimer le fichier
                        </RemoveFileButton>
                    </>
                )}
            </FileInfo>

            <RecommendedStructure>
                <WarningIcon>💡</WarningIcon>
                <span>
                    Structure recommandée : agent.py, requirements.txt,
                    config.yaml dans votre ZIP
                </span>
            </RecommendedStructure>

            <ButtonGroup>
                <SecondaryButton onClick={onClose}>
                    {selectedAgentFile ? 'Annuler' : 'Aucun fichier choisi'}
                </SecondaryButton>
                <PrimaryButton
                    disabled={!selectedAgentFile}
                    onClick={handleReady}
                >
                    {selectedAgentFile ? 'Fichier prêt' : 'Choisir un fichier'}
                </PrimaryButton>
            </ButtonGroup>
        </>
    );
};

export default SourceSelectorUpload;
