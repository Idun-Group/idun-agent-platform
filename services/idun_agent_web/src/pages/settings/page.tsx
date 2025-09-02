import { Button } from '../../components/general/button/component';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettingsPage } from '../../hooks/use-settings-page';
import { lazy, Suspense } from 'react';
import Loader from '../../components/general/loader/component';
const ProfileSettings = lazy(
    () => import('../../components/settings/profile/component')
);
const LanguageSettings = lazy(
    () => import('../../components/settings/language/component')
);
const AppearanceSettings = lazy(
    () => import('../../components/settings/appearance/component')
);
const NotificationSettings = lazy(
    () => import('../../components/settings/notification/component')
);
const SecuritySettings = lazy(
    () => import('../../components/settings/security/component')
);

const SettingsPage = () => {
    const navigate = useNavigate();
    const { settingPage } = useSettingsPage();
    const { t } = useTranslation();

    return (
        <main style={{ padding: '16px' }}>
            <Button $variants="transparent" onClick={() => navigate('/agents')}>
                <ArrowLeft /> {t('settings.back_to_dashboard')}
            </Button>

            <Suspense fallback={<Loader />}>
                {
                    {
                        profile: <ProfileSettings />,
                        appearance: <AppearanceSettings />,
                        language: <LanguageSettings />,
                        notifications: <NotificationSettings />,
                        security: <SecuritySettings />,
                    }[settingPage]
                }
            </Suspense>
        </main>
    );
};
export default SettingsPage;
