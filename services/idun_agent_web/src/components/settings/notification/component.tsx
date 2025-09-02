import { useTranslation } from 'react-i18next';
import { LabeledToggleButton } from '../../general/form/component';

const NotificationSettings = () => {
    const { t } = useTranslation();
    return (
        <div>
            {/* Your component implementation here */}
            <h1>{t('settings.notifications.title')} </h1>
            <p>{t('settings.notifications.description')}</p>

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
        </div>
    );
};
export default NotificationSettings;
