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
    font-family: 'IBM Plex Sans', sans-serif;
`;

const Card = styled.div`
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 24px;
    backdrop-filter: blur(12px);
`;

const CardTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 4px 0;
`;

const CardDescription = styled.p`
    font-size: 14px;
    color: #8899a6;
    margin: 0 0 20px 0;
`;
