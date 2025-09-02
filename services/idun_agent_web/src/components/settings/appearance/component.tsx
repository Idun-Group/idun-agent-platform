import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useToggleThemeMode } from '../../../hooks/use-toggle-theme-mode';
import { useState } from 'react';
import { LabeledToggleButton } from '../../general/form/component';

const AppearanceSettings = () => {
    const { themeMode, setToggleThemeMode } = useToggleThemeMode();
    const { t } = useTranslation();
    const [isCompactMode, setIsCompactMode] = useState(false);
    const [isHighContrastMode, setIsHighContrastMode] = useState(false);
    return (
        <section>
            <h1>{t('settings.appearance.title')}</h1>
            <p>{t('settings.appearance.description')}</p>
            <h2>{t('settings.appearance.subtitle')}</h2>

            <ThemeContainer>
                <ThemeCard
                    onClick={() => setToggleThemeMode('system')}
                    $isSelected={themeMode === 'system'}
                >
                    <ThemeShow $typologie="system"></ThemeShow>
                    <p>{t('settings.appearance.theme.system')}</p>
                </ThemeCard>
                <ThemeCard
                    onClick={() => setToggleThemeMode('light')}
                    $isSelected={themeMode === 'light'}
                >
                    <ThemeShow $typologie="light"></ThemeShow>
                    <p>{t('settings.appearance.theme.light')}</p>
                </ThemeCard>
                <ThemeCard
                    onClick={() => setToggleThemeMode('dark')}
                    $isSelected={themeMode === 'dark'}
                >
                    <ThemeShow $typologie="dark"></ThemeShow>
                    <p>{t('settings.appearance.theme.dark')}</p>
                </ThemeCard>
            </ThemeContainer>

            <LabeledToggleButton
                label={t('settings.appearance.compact-mode.label')}
                subLabel={t('settings.appearance.compact-mode.subLabel')}
                isOn={isCompactMode}
                onToggle={() => setIsCompactMode(!isCompactMode)}
            />

            <LabeledToggleButton
                label={t('settings.appearance.high-contrast-mode.label')}
                subLabel={t('settings.appearance.high-contrast-mode.subLabel')}
                isOn={isHighContrastMode}
                onToggle={() => setIsHighContrastMode(!isHighContrastMode)}
            />
        </section>
    );
};

export default AppearanceSettings;

const ThemeContainer = styled.div`
    display: flex;
    gap: 16px;
    justify-content: space-between;
`;

const ThemeShow = styled.div<{ $typologie: 'system' | 'light' | 'dark' }>`
    width: 100%;
    height: 50px;
    border-radius: 8px;
    display: inline-block;
    background-color: ${({ $typologie: typologie }) =>
        typologie === 'dark'
            ? '#333'
            : typologie === 'light'
            ? '#fff'
            : '#f0f0f0'};
`;

const ThemeCard = styled.div<{ $isSelected: boolean }>`
    width: 33%;
    border-radius: 8px;
    display: inline-block;
    padding: 16px;
    border: 1px solid #525252;
    p {
        margin: 8px 0;
        text-align: center;
    }

    &:hover {
        border: 1px solid #8c52ff;
    }

    ${({ $isSelected: isSelected }) =>
        isSelected &&
        `
        border: 1px solid #8c52ff;
    `}
`;
