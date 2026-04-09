import {
    ButtonGroup,
    FormGroup,
    Input,
    Label,
    PrimaryButton,
    SecondaryButton,
    SectionSubtitle,
    SectionTitle,
} from '../popup-styled';

const SourceSelectorDistant = ({ onClose }: { onClose: () => void }) => {
    // Handler for 'Fichier prêt' button

    return (
        <>
            <SectionTitle>Source API distante</SectionTitle>
            <SectionSubtitle>
                Configurez une connexion à une API distante pour votre agent
            </SectionSubtitle>

            <FormGroup>
                <Label>URL de l'API</Label>
                <Input type="url" placeholder="https://api.example.com" />
            </FormGroup>

            <FormGroup>
                <Label>Clé d'API (optionnel)</Label>
                <Input type="password" placeholder="Votre clé d'API" />
            </FormGroup>

            <ButtonGroup>
                <SecondaryButton onClick={onClose}>Annuler</SecondaryButton>
                <PrimaryButton>Connecter</PrimaryButton>
            </ButtonGroup>
        </>
    );
};

export default SourceSelectorDistant;
