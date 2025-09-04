import type { Preview } from '@storybook/react-vite';
import GlobalStyles from '../src/global-styles';
import { withThemeFromJSXProvider } from '@storybook/addon-themes';
import '../src/i18n'; // Import i18n configuration
import { I18nextProvider } from 'react-i18next';
import i18n from '../src/i18n';

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },

        // Configuration i18n pour Storybook
        i18n: {
            locales: {
                fr: { title: 'Français', left: '🇫🇷' },
                en: { title: 'English', left: '🇺🇸' },
            },
            defaultLocale: 'fr',
        },

        a11y: {
            // 'todo' - show a11y violations in the test UI only
            // 'error' - fail CI on a11y violations
            // 'off' - skip a11y checks entirely
            test: 'todo',
        },
    },
    decorators: [
        withThemeFromJSXProvider({ GlobalStyles }),
        // Décorateur i18n pour Storybook
        (Story, context) => {
            const { locale } = context.globals;

            // Change la langue quand l'utilisateur change dans Storybook
            if (locale && locale !== i18n.language) {
                i18n.changeLanguage(locale);
            }

            return (
                <I18nextProvider i18n={i18n}>
                    <Story />
                </I18nextProvider>
            );
        },
    ],
    globalTypes: {
        locale: {
            description: 'Internationalization locale',
            defaultValue: 'fr',
            toolbar: {
                icon: 'globe',
                items: [
                    { value: 'fr', title: 'Français', left: '🇫🇷' },
                    { value: 'en', title: 'English', left: '🇺🇸' },
                ],
                showName: true,
            },
        },
    },
};

export default preview;
