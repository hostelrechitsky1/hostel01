import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

const createFirestore = () => {
    if (typeof window === 'undefined') {
        return getFirestore(app);
    }

    try {
        return initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
    } catch {
        return getFirestore(app);
    }
};

const db = createFirestore();

try {
    if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
        import('firebase/analytics').then(({ getAnalytics }) => {
            getAnalytics(app);
        }).catch(() => { /* analytics load failed silently */ });
    }
} catch {
    // analytics is non-critical, ignore errors
}

export { db };
