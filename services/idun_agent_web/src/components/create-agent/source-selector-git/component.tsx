// import useAgentFile from '../../../hook/use-agent-file';
import { useEffect, useState } from 'react';
import {
    ButtonGroup,
    PrimaryButton,
    SecondaryButton,
    SectionSubtitle,
    SectionTitle,
} from '../popup-styled';
import { Button } from '../../general/button/component';

const SourceSelectorGithub = ({
    onClose,
    selectedGitProvider,
}: {
    onClose: () => void;
    selectedGitProvider: 'github' | 'gitlab' | 'bitbucket' | 'azureDevOps';
}) => {
    // const { selectedAgentFile } = useAgentFile();

    // // Handler for 'Fichier prêt' button
    // const handleReady = () => {
    //     if (selectedAgentFile) {
    //         onClose();
    //     }
    // };

    const [tryInstallation, setTryInstallation] = useState(false);

    const [providerIsInstalled, setProviderIsInstalled] = useState(false);

    useEffect(() => {
        (async () => {
            const responseInstalled = await fetch(
                `/api/git/${selectedGitProvider}/installed`
            );

            const responseJson = await responseInstalled.json();

            setProviderIsInstalled(responseJson as boolean);
        })();
    }, [selectedGitProvider]);

    useEffect(() => {
        if (tryInstallation) {
            (async () => {
                const responseInstalled = await fetch(
                    `/api/git/${selectedGitProvider}/installed`
                );

                const responseJson = await responseInstalled.json();

                setProviderIsInstalled(responseJson as boolean);
            })();
        }
    }, [tryInstallation]);
    return (
        <>
            <SectionTitle>Importer depuis {selectedGitProvider}</SectionTitle>
            <SectionSubtitle>
                Connectez un dépôt {selectedGitProvider} existant pour créer
                votre agent
            </SectionSubtitle>

            {providerIsInstalled ? (
                <p>Le fournisseur est installé.</p>
            ) : (
                <>
                    <p>
                        github n'est pas installer sur votre Idun Engine,
                        veuillez l'installer ou contacter votre administrateur
                    </p>
                    <Button
                        type="button"
                        $variants="base"
                        onClick={() => {
                            const width = window.innerWidth;
                            setTryInstallation(true);
                            const popup = window.open(
                                '/apps/marketplace',
                                'popup',
                                `width=${width * 0.8},height=${
                                    width * 0.6
                                },left=${width * 0.2},top=${width * 0.2}`
                            );

                            if (popup) {
                                const timer = setInterval(() => {
                                    if (popup.closed) {
                                        clearInterval(timer);
                                        setTryInstallation(false);
                                    }
                                }, 500);
                            } else {
                                setTryInstallation(false);
                            }
                        }}
                    >
                        Installer
                    </Button>
                </>
            )}

            <ButtonGroup>
                <SecondaryButton type="button" onClick={onClose}>
                    Annuler
                </SecondaryButton>
                <PrimaryButton type="button">Importer</PrimaryButton>
            </ButtonGroup>
        </>
    );
};

export default SourceSelectorGithub;
