import type { Student } from '../types';
import { clearResidentPortalLanguage } from '../utils/residentPortalLanguage';

const STORAGE_KEYS = {
    CURRENT_USER: 'hostel_current_user',
    CURRENT_ROOMMATES: 'hostel_current_roommates'
};

/**
 * Legacy BookingService - Now stripped down to handle Session Management only.
 * Data persistence has moved to Firestore.
 */
class BookingService {
    private get<T>(key: string, defaultValue: T): T {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    }

    private set<T>(key: string, value: T) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // --- Session / Auth ---
    setCurrentUser(student: Student) {
        this.set(STORAGE_KEYS.CURRENT_USER, student);
    }

    setCurrentRoommates(students: Student[]) {
        this.set(STORAGE_KEYS.CURRENT_ROOMMATES, students);
    }

    getCurrentUser(): Student | null {
        return this.get(STORAGE_KEYS.CURRENT_USER, null);
    }

    getCurrentRoommates(): Student[] {
        return this.get(STORAGE_KEYS.CURRENT_ROOMMATES, []);
    }

    logout() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_ROOMMATES);
        clearResidentPortalLanguage();
    }
}

export const bookingService = new BookingService();
