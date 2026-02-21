import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
const db = getFirestore(app);

// Analytics is optional - only initialize if we're in a browser and have a measurementId
try {
    if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
        import("firebase/analytics").then(({ getAnalytics }) => {
            getAnalytics(app);
        }).catch(() => {/* analytics load failed silently */ });
    }
} catch {
    // analytics is non-critical, ignore errors
}

export { db };

