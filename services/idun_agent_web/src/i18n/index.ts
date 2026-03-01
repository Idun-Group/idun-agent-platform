import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import de from './locales/de.json';
// New languages (use English as initial fallback until proper translations are added)
import ru from './locales/ru.json';
import pt from './locales/pt.json';
import it from './locales/it.json';

// Language detection: use saved preference from localStorage, otherwise default to English.
// Users can switch language from Settings > Language.
const getInitialLanguage = (): string => {
    const supported = ['en', 'fr', 'es', 'de', 'ru', 'pt', 'it'];
    const saved = localStorage.getItem('i18nextLng');
    if (saved && supported.includes(saved)) {
        return saved;
    }
    return 'en';
};

i18n.use(initReactI18next)
    .init({
        fallbackLng: 'en',
        lng: getInitialLanguage(),

        supportedLngs: ['en', 'fr', 'es', 'de', 'ru', 'pt', 'it'],

        resources: {
            en: { translation: en },
            fr: { translation: fr },
            es: { translation: es },
            de: { translation: de },
            ru: { translation: ru },
            pt: { translation: pt },
            it: { translation: it },
        },

        interpolation: {
            escapeValue: false,
        },

        debug: process.env.NODE_ENV === 'development',
        defaultNS: 'translation',

        react: {
            useSuspense: false,
        },

        saveMissing: false,
    });

i18n.on('languageChanged', (lng) => {
    localStorage.setItem('i18nextLng', lng);
});

export default i18n;
