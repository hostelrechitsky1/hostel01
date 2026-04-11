import { getApp, getApps, initializeApp } from 'firebase/app';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let analyticsWarmPromise: Promise<void> | null = null;

export const warmFirebaseAnalytics = () => {
    if (analyticsWarmPromise) {
        return analyticsWarmPromise;
    }

    if (typeof window === 'undefined' || !firebaseConfig.measurementId) {
        analyticsWarmPromise = Promise.resolve();
        return analyticsWarmPromise;
    }

    analyticsWarmPromise = import('firebase/analytics')
        .then(({ getAnalytics }) => {
            getAnalytics(app);
        })
        .catch(() => {
            // analytics is non-critical, ignore errors
        });

    return analyticsWarmPromise;
};
