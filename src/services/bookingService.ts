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
        if (!data) {
            return defaultValue;
        }
        try {
            return JSON.parse(data) as T;
        } catch (error) {
            console.warn(`Failed to parse stored value for ${key}. Clearing.`, error);
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
        const user = this.get<Student | null>(STORAGE_KEYS.CURRENT_USER, null);
        if (!user) {
            return null;
        }
        if (typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.roomNumber !== 'string') {
            console.warn('Invalid stored user session. Clearing.');
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
            return null;
        }
        return user;
    }

    logout() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
}

export const bookingService = new BookingService();
