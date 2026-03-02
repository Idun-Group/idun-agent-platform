import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useToggleThemeMode } from '../../../hooks/use-toggle-theme-mode';
import { useState } from 'react';

const AppearanceSettings = () => {
    const { themeMode, setToggleThemeMode } = useToggleThemeMode();
    const { t } = useTranslation();
    const [isCompactMode, setIsCompactMode] = useState(false);
    const [isHighContrastMode, setIsHighContrastMode] = useState(false);

    return (
        <div>
            <ThemeContainer>
                <ThemeCard
                    onClick={() => setToggleThemeMode('system')}
                    $isSelected={themeMode === 'system'}
                >
                    <ThemePreview $mode="system" />
                    <ThemeLabel>
                        {t('settings.appearance.theme.system')}
                    </ThemeLabel>
                </ThemeCard>
                <ThemeCard
                    onClick={() => setToggleThemeMode('light')}
                    $isSelected={themeMode === 'light'}
                >
                    <ThemePreview $mode="light" />
                    <ThemeLabel>
                        {t('settings.appearance.theme.light')}
                    </ThemeLabel>
                </ThemeCard>
                <ThemeCard
                    onClick={() => setToggleThemeMode('dark')}
                    $isSelected={themeMode === 'dark'}
                >
                    <ThemePreview $mode="dark" />
                    <ThemeLabel>
                        {t('settings.appearance.theme.dark')}
                    </ThemeLabel>
                </ThemeCard>
            </ThemeContainer>

            <ToggleRow>
                <ToggleInfo>
                    <ToggleLabel>
                        {t('settings.appearance.compact-mode.label')}
                    </ToggleLabel>
                    <ToggleDescription>
                        {t('settings.appearance.compact-mode.subLabel')}
                    </ToggleDescription>
                </ToggleInfo>
                <ToggleTrack
                    $isOn={isCompactMode}
                    onClick={() => setIsCompactMode(!isCompactMode)}
                >
                    <ToggleKnob $isOn={isCompactMode} />
                </ToggleTrack>
            </ToggleRow>

            <ToggleRow>
                <ToggleInfo>
                    <ToggleLabel>
                        {t('settings.appearance.high-contrast-mode.label')}
                    </ToggleLabel>
                    <ToggleDescription>
                        {t('settings.appearance.high-contrast-mode.subLabel')}
                    </ToggleDescription>
                </ToggleInfo>
                <ToggleTrack
                    $isOn={isHighContrastMode}
                    onClick={() => setIsHighContrastMode(!isHighContrastMode)}
                >
                    <ToggleKnob $isOn={isHighContrastMode} />
                </ToggleTrack>
            </ToggleRow>
        </div>
    );
};

export default AppearanceSettings;

const ThemeContainer = styled.div`
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
`;

const ThemePreview = styled.div<{ $mode: 'system' | 'light' | 'dark' }>`
    width: 100%;
    height: 48px;
    border-radius: 6px;
    background: ${({ $mode }) =>
        $mode === 'dark'
            ? 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)'
            : $mode === 'light'
              ? 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'
              : 'linear-gradient(135deg, #1a1a2e 0%, #e9ecef 100%)'};
`;

const ThemeCard = styled.div<{ $isSelected: boolean }>`
    flex: 1;
    border-radius: 8px;
    padding: 10px;
    cursor: pointer;
    border: 1px solid
        ${({ $isSelected }) =>
            $isSelected ? 'hsl(var(--primary))' : 'var(--border-light)'};
    background: ${({ $isSelected }) =>
        $isSelected ? 'hsla(var(--primary) / 0.06)' : 'var(--overlay-subtle)'};
    transition: all 150ms ease;

    &:hover {
        border-color: ${({ $isSelected }) =>
            $isSelected ? 'hsl(var(--primary))' : 'var(--overlay-strong)'};
    }
`;

const ThemeLabel = styled.p`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    text-align: center;
    margin: 8px 0 0 0;
`;

const ToggleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0;
    border-top: 1px solid var(--border-subtle);
`;

const ToggleInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const ToggleLabel = styled.span`
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
`;

const ToggleDescription = styled.span`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
`;

const ToggleTrack = styled.div<{ $isOn: boolean }>`
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: ${({ $isOn }) => ($isOn ? 'hsl(var(--primary))' : 'var(--overlay-medium)')};
    cursor: pointer;
    position: relative;
    transition: background 150ms ease;
    flex-shrink: 0;
`;

const ToggleKnob = styled.div<{ $isOn: boolean }>`
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: hsl(var(--foreground));
    position: absolute;
    top: 3px;
    left: ${({ $isOn }) => ($isOn ? '21px' : '3px')};
    transition: left 150ms ease;
`;
