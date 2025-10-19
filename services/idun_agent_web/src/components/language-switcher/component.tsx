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
    background-color: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 8px 14px;
    font-size: 14px;
    cursor: pointer;

    &:focus {
        outline: none;
        border-color: #007bff;
    }
`;

const Option = styled.option`
    background-color: white;
    border: none;
    padding: 8px 12px;
    font-size: 14px;
    cursor: pointer;

    &:hover {
        background-color: #f1f1f1;
    }
`;
