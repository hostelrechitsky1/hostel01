import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from 'firebase/firestore';
import { app, warmFirebaseAnalytics } from './firebaseApp';

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

void warmFirebaseAnalytics();

export { db };
