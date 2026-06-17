import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type LoadableComponent<T extends ComponentType<object>> = LazyExoticComponent<T> & {
    preload: () => Promise<{ default: T }>;
};

const RECOVERY_KEY = 'hostel-lazy-route-recovery-attempted';

const isStaleChunkError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return /Failed to fetch dynamically imported module/i.test(message)
        || /Importing a module script failed/i.test(message)
        || /ChunkLoadError/i.test(message)
        || /Loading chunk \d+ failed/i.test(message);
};

const clearBrowserCaches = async () => {
    if (typeof window === 'undefined') return;

    await Promise.allSettled([
        'caches' in window
            ? caches.keys().then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
            : Promise.resolve(),
        'serviceWorker' in navigator
            ? navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.update())))
            : Promise.resolve(),
    ]);
};

const recoverFromStaleChunk = async (error: unknown): Promise<never> => {
    if (typeof window === 'undefined') {
        throw error;
    }

    const recoveryKey = `${RECOVERY_KEY}:${window.location.pathname}`;
    if (window.sessionStorage.getItem(recoveryKey) === '1') {
        throw error;
    }

    window.sessionStorage.setItem(recoveryKey, '1');
    await clearBrowserCaches();
    window.location.reload();
    return new Promise(() => undefined);
};

export const lazyRoute = <T extends ComponentType<object>>(
    load: () => Promise<{ default: T }>
) => {
    const safeLoad = () => load()
        .then((module) => {
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(`${RECOVERY_KEY}:${window.location.pathname}`);
            }
            return module;
        })
        .catch((error) => {
            if (isStaleChunkError(error)) {
                return recoverFromStaleChunk(error);
            }
            throw error;
        });

    const Component = lazy(safeLoad) as LoadableComponent<T>;
    Component.preload = safeLoad;
    return Component;
};
