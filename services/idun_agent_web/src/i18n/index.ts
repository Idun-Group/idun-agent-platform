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

// Détection simple de la langue depuis localStorage ou navigateur
const getInitialLanguage = (): string => {
    const supported = ['fr', 'en', 'es', 'de', 'ru', 'pt', 'it'];
    const saved = localStorage.getItem('i18nextLng');
    if (saved && supported.includes(saved)) {
        return saved;
    }
    const browserLang = navigator.language.split('-')[0];
    return supported.includes(browserLang) ? browserLang : 'fr';
};

i18n.use(initReactI18next) // React-i18next plugin
    .init({
        // Langue par défaut et initiale
        fallbackLng: 'fr',
        lng: getInitialLanguage(),

        // Langues supportées
        supportedLngs: ['fr', 'en', 'es', 'de', 'ru', 'pt', 'it'],

        // Resources (traductions)
        resources: {
            fr: { translation: fr },
            en: { translation: en },
            es: { translation: es },
            de: { translation: de },
            ru: { translation: ru },
            pt: { translation: pt },
            it: { translation: it },
        },

        // Options d'interpolation
        interpolation: {
            escapeValue: false, // React échappe déjà par défaut
        },

        // Mode debug (à désactiver en production)
        debug: process.env.NODE_ENV === 'development',

        // Namespace par défaut
        defaultNS: 'translation',

        // Configuration pour React
        react: {
            useSuspense: false, // Évite les problèmes avec Suspense
        },

        // Sauvegarde automatique de la langue choisie
        saveMissing: false,
    });

// Sauvegarde de la langue quand elle change
i18n.on('languageChanged', (lng) => {
    localStorage.setItem('i18nextLng', lng);
});

export default i18n;
