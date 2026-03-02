import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const LANGUAGES = [
    { code: 'en', label: 'English', region: 'English (US)', flag: 'EN' },
    { code: 'fr', label: 'Français', region: 'Français (France)', flag: 'FR' },
    { code: 'es', label: 'Español', region: 'Español (España)', flag: 'ES' },
    { code: 'de', label: 'Deutsch', region: 'Deutsch (Germany)', flag: 'DE' },
    { code: 'it', label: 'Italiano', region: 'Italiano (Italia)', flag: 'IT' },
    { code: 'pt', label: 'Português', region: 'Português (Brasil)', flag: 'PT' },
    { code: 'ru', label: 'Русский', region: 'Русский (Россия)', flag: 'RU' },
] as const;

const LanguageSettings = () => {
    const { i18n } = useTranslation();
    const { language, changeLanguage } = i18n;

    return (
        <Grid>
            {LANGUAGES.map((lang) => (
                <LanguageCard
                    key={lang.code}
                    $isSelected={language === lang.code}
                    onClick={() => changeLanguage(lang.code)}
                >
                    <FlagBadge $isSelected={language === lang.code}>
                        {lang.flag}
                    </FlagBadge>
                    <LangInfo>
                        <LangName>{lang.label}</LangName>
                        <LangRegion>{lang.region}</LangRegion>
                    </LangInfo>
                </LanguageCard>
            ))}
        </Grid>
    );
};

export default LanguageSettings;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
`;

const LanguageCard = styled.button<{ $isSelected: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: ${({ $isSelected }) =>
        $isSelected ? 'rgba(140, 82, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)'};
    border: 1px solid
        ${({ $isSelected }) =>
            $isSelected ? '#8c52ff' : 'rgba(255, 255, 255, 0.1)'};
    border-radius: 8px;
    cursor: pointer;
    color: #ffffff;
    text-align: left;
    transition: all 150ms ease;
    font-family: inherit;

    &:hover {
        border-color: ${({ $isSelected }) =>
            $isSelected ? '#8c52ff' : 'rgba(255, 255, 255, 0.2)'};
    }
`;

const FlagBadge = styled.span<{ $isSelected: boolean }>`
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: ${({ $isSelected }) => ($isSelected ? '#8c52ff' : '#9ca3af')};
    min-width: 24px;
`;

const LangInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
`;

const LangName = styled.span`
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
`;

const LangRegion = styled.span`
    font-size: 12px;
    color: #6b7280;
`;
