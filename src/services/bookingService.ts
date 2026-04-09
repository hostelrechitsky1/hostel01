import type { Student } from '../types';

const STORAGE_KEYS = {
    CURRENT_USER: 'hostel_current_user'
};

/**
 * Legacy BookingService - Now stripped down to handle Session Management only.
 * Data persistence has moved to Firestore.
 */
class BookingService {
    private get<T>(key: string, defaultValue: T): T {
        const data = localStorage.getItem(key);
        if (!data) return defaultValue;

        try {
            return JSON.parse(data) as T;
        } catch (error) {
            console.warn(`Corrupted localStorage key "${key}" was reset.`, error);
            localStorage.removeItem(key);
            return defaultValue;
        }
    }

    private set(key: string, value: any) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // --- Session / Auth ---
    setCurrentUser(student: Student) {
        this.set(STORAGE_KEYS.CURRENT_USER, student);
    }

    getCurrentUser(): Student | null {
        return this.get(STORAGE_KEYS.CURRENT_USER, null);
    }

    logout() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
}

export const bookingService = new BookingService();
