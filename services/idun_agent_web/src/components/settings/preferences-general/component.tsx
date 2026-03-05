import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import AppearanceSettings from '../appearance/component';
import LanguageSettings from '../language/component';

const PreferencesGeneralTab = () => {
    const { t } = useTranslation();

    return (
        <Container>
            <Card>
                <CardTitle>
                    {t('settings.preferences.appearance', 'Appearance')}
                </CardTitle>
                <CardDescription>
                    {t(
                        'settings.preferences.appearance.description',
                        'Customize how the application looks and feels.',
                    )}
                </CardDescription>
                <AppearanceSettings />
            </Card>

            <Card>
                <CardTitle>
                    {t('settings.preferences.language', 'Language')}
                </CardTitle>
                <CardDescription>
                    {t(
                        'settings.preferences.language.description',
                        'Choose your preferred language for the interface.',
                    )}
                </CardDescription>
                <LanguageSettings />
            </Card>
        </Container>
    );
};

export default PreferencesGeneralTab;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const Card = styled.div`
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 24px;
`;

const CardTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px 0;
`;

const CardDescription = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 20px 0;
`;
