import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from './browserStorage';

export type ResidentPortalLanguage = 'en' | 'ru';

const RESIDENT_PORTAL_LANGUAGE_KEY = 'resident_portal_lang';

export const getResidentPortalLanguage = (): ResidentPortalLanguage => {
    if (typeof window === 'undefined') {
        return 'en';
    }

    return readBrowserStorage('session', RESIDENT_PORTAL_LANGUAGE_KEY) === 'ru' ? 'ru' : 'en';
};

export const setResidentPortalLanguage = (language: ResidentPortalLanguage) => {
    if (typeof window === 'undefined') {
        return;
    }

    writeBrowserStorage('session', RESIDENT_PORTAL_LANGUAGE_KEY, language);
};

export const clearResidentPortalLanguage = () => {
    if (typeof window === 'undefined') {
        return;
    }

    removeBrowserStorage('session', RESIDENT_PORTAL_LANGUAGE_KEY);
};

export const getResidentPortalDateLocale = (language: ResidentPortalLanguage) => (
    language === 'ru' ? 'ru-RU' : 'en-US'
);
