import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { LabeledToggleButton } from '../../general/form/component';

const NotificationSettings = () => {
    const { t } = useTranslation();
    return (
        <Container>
            <Title>{t('settings.notifications.title')} </Title>
            <Description>{t('settings.notifications.description')}</Description>

            <LabeledToggleButton
                label={t('settings.notifications.agents-status-changes.label')}
                subLabel={t(
                    'settings.notifications.agents-status-changes.sub-label'
                )}
                isOn={true}
                onToggle={() => {}}
            />

            <LabeledToggleButton
                label={t('settings.notifications.performance-alerts.label')}
                subLabel={t(
                    'settings.notifications.performance-alerts.sub-label'
                )}
                isOn={true}
                onToggle={() => {}}
            />

            <LabeledToggleButton
                label={t('settings.notifications.system-updates.label')}
                subLabel={t('settings.notifications.system-updates.sub-label')}
                isOn={true}
                onToggle={() => {}}
            />

            <LabeledToggleButton
                label={t('settings.notifications.browser-notifications.label')}
                subLabel={t(
                    'settings.notifications.browser-notifications.sub-label'
                )}
                isOn={true}
                onToggle={() => {}}
            />
        </Container>
    );
};
export default NotificationSettings;

const Container = styled.div`
    font-family: 'IBM Plex Sans', sans-serif;
`;

const Title = styled.h1`
    font-size: 20px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 4px 0;
`;

const Description = styled.p`
    font-size: 14px;
    color: #8899a6;
    margin: 0 0 20px 0;
`;
