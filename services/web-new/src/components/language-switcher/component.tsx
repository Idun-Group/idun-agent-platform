import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const LanguageSwitcher = () => {
    const { i18n } = useTranslation();

    return (
        <Select
            onChange={(e) => {
                i18n.changeLanguage(e.target.value);
            }}
        >
            <Option value="en" selected={i18n.language === 'en'}>
                English
            </Option>
            <Option value="fr" selected={i18n.language === 'fr'}>
                Français
            </Option>
        </Select>
    );
};

export default LanguageSwitcher;

const Select = styled.select`
    background-color: #0a0e17;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 14px;
    color: #e1e4e8;
    cursor: pointer;

    &:focus {
        outline: none;
        border-color: #0C5CAB;
    }
`;

const Option = styled.option`
    background-color: #0a0e17;
    border: none;
    padding: 8px 12px;
    font-size: 14px;
    cursor: pointer;

    &:hover {
        background-color: rgba(255, 255, 255, 0.04);
    }
`;
