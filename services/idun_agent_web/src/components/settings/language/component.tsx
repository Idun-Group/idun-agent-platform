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
    font-family: 'IBM Plex Sans', sans-serif;
`;

const LanguageCard = styled.button<{ $isSelected: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: ${({ $isSelected }) =>
        $isSelected ? 'rgba(12, 92, 171, 0.06)' : 'rgba(255, 255, 255, 0.03)'};
    border: 1px solid
        ${({ $isSelected }) =>
            $isSelected ? '#0C5CAB' : 'rgba(255, 255, 255, 0.06)'};
    border-radius: 8px;
    cursor: pointer;
    color: #e1e4e8;
    text-align: left;
    transition: all 150ms ease;
    font-family: 'IBM Plex Sans', sans-serif;
    backdrop-filter: blur(12px);

    &:hover {
        border-color: ${({ $isSelected }) =>
            $isSelected ? '#0C5CAB' : 'rgba(255, 255, 255, 0.1)'};
    }
`;

const FlagBadge = styled.span<{ $isSelected: boolean }>`
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: ${({ $isSelected }) => ($isSelected ? '#0C5CAB' : '#8899a6')};
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
    color: #e1e4e8;
`;

const LangRegion = styled.span`
    font-size: 12px;
    color: #8899a6;
`;
