export type ResidentPortalLanguage = 'en' | 'ru';

const RESIDENT_PORTAL_LANGUAGE_KEY = 'resident_portal_lang';

export const getResidentPortalLanguage = (): ResidentPortalLanguage => {
    if (typeof window === 'undefined') {
        return 'en';
    }

    return window.sessionStorage.getItem(RESIDENT_PORTAL_LANGUAGE_KEY) === 'ru' ? 'ru' : 'en';
};

export const setResidentPortalLanguage = (language: ResidentPortalLanguage) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.setItem(RESIDENT_PORTAL_LANGUAGE_KEY, language);
};

export const clearResidentPortalLanguage = () => {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.removeItem(RESIDENT_PORTAL_LANGUAGE_KEY);
};

export const getResidentPortalDateLocale = (language: ResidentPortalLanguage) => (
    language === 'ru' ? 'ru-RU' : 'en-US'
);
