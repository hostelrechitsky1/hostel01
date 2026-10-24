type BrowserStorageKind = 'local' | 'session';

export const getBrowserStorage = (kind: BrowserStorageKind): Storage | null => {
    try {
        if (typeof window === 'undefined') return null;
        return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
        return null;
    }
};

export const readBrowserStorage = (kind: BrowserStorageKind, key: string): string | null => {
    try { return getBrowserStorage(kind)?.getItem(key) ?? null; } catch { return null; }
};

export const writeBrowserStorage = (kind: BrowserStorageKind, key: string, value: string): boolean => {
    try {
        const storage = getBrowserStorage(kind);
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

export const removeBrowserStorage = (kind: BrowserStorageKind, key: string): void => {
    try { getBrowserStorage(kind)?.removeItem(key); } catch { /* Storage is optional. */ }
};
