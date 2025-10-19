import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const LanguageSettings = () => {
    const { t, i18n } = useTranslation();

    const { language, changeLanguage } = i18n;

    return (
        <section>
            <h1>{t('settings.language.title')}</h1>
            <p>{t('settings.language.description')}</p>

            <h2>{t('settings.language.subtitle')}</h2>
            <SelectLanguageContainer>
                <LanguageButton
                    onClick={() => changeLanguage('en')}
                    $selected={language === 'en'}
                >
                    <h3>US</h3>
                    <div>
                        <LanguageTitle>English</LanguageTitle>
                        <LanguageDescription>English (US)</LanguageDescription>
                    </div>
                </LanguageButton>

                <LanguageButton
                    onClick={() => changeLanguage('fr')}
                    $selected={language === 'fr'}
                >
                    <h3>FR</h3>
                    <div>
                        <LanguageTitle>Français</LanguageTitle>
                        <LanguageDescription>
                            Français (France)
                        </LanguageDescription>
                    </div>
                </LanguageButton>
                <LanguageButton
                    onClick={() => changeLanguage('es')}
                    $selected={language === 'es'}
                >
                    <h3>es</h3>
                    <div>
                        <LanguageTitle>Spanish</LanguageTitle>
                        <LanguageDescription>Spanish (es)</LanguageDescription>
                    </div>
                </LanguageButton>

                <LanguageButton
                    onClick={() => changeLanguage('de')}
                    $selected={language === 'de'}
                >
                    <h3>DE</h3>
                    <div>
                        <LanguageTitle>Deutsch</LanguageTitle>
                        <LanguageDescription>
                            Deutsch (Germany)
                        </LanguageDescription>
                    </div>
                </LanguageButton>
                <LanguageButton
                    onClick={() => changeLanguage('it')}
                    $selected={language === 'it'}
                >
                    <h3>IT</h3>
                    <div>
                        <LanguageTitle>Italiano</LanguageTitle>
                        <LanguageDescription>
                            Italiano (Italia)
                        </LanguageDescription>
                    </div>
                </LanguageButton>

                <LanguageButton
                    onClick={() => changeLanguage('pt')}
                    $selected={language === 'pt'}
                >
                    <h3>PT</h3>
                    <div>
                        <LanguageTitle>Português</LanguageTitle>
                        <LanguageDescription>
                            Português (Brasil)
                        </LanguageDescription>
                    </div>
                </LanguageButton>
                <LanguageButton
                    onClick={() => changeLanguage('ru')}
                    $selected={language === 'ru'}
                >
                    <h3>RU</h3>
                    <div>
                        <LanguageTitle>Русский</LanguageTitle>
                        <LanguageDescription>
                            Русский (Россия)
                        </LanguageDescription>
                    </div>
                </LanguageButton>
            </SelectLanguageContainer>
        </section>
    );
};
export default LanguageSettings;

const LanguageButton = styled.button<{ $selected: boolean }>`
    background: transparent;
    border: none;
    text-align: left;
    padding: 12px 16px;
    border-radius: 14px;
    width: 20%;
    cursor: pointer;
    color: white;
    display: flex;
    gap: 16px;
    align-items: center;
    border: 1px solid grey;
    &:hover {
        border: 3px solid #8c52ff;
    }

    ${(props) =>
        props.$selected &&
        `
        border: 3px solid #8c52ff;
        background: rgba(140, 82, 255, 0.1);
    `}

    h3 {
        font-size: 1.5rem;
        font-weight: 600;
    }

    p {
        margin: 0;
    }
`;

const LanguageTitle = styled.h4`
    font-size: 1.25rem;
    font-weight: 600;
`;

const LanguageDescription = styled.p`
    margin: 0;
`;
const SelectLanguageContainer = styled.article`
    display: flex;
    gap: 12px;
    margin-top: 12px;
`;
