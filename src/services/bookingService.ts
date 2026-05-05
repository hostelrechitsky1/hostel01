import type { Student } from '../types';
import { clearResidentPortalLanguage } from '../utils/residentPortalLanguage';

const STORAGE_KEYS = {
    CURRENT_USER: 'hostel_current_user',
    CURRENT_ROOMMATES: 'hostel_current_roommates',
    SAVED_ACCOUNTS: 'hostel_saved_accounts'
};

const dedupeStudents = (students: Student[]) => {
    const seenIds = new Set<string>();

    return students.filter((student) => {
        const identity = student.id || `${student.roomNumber}:${student.name.trim().toLowerCase()}`;
        if (seenIds.has(identity)) {
            return false;
        }

        seenIds.add(identity);
        return true;
    });
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
        const previousUser = this.getCurrentUser();
        this.set(STORAGE_KEYS.CURRENT_USER, student);
        this.setSavedAccounts(previousUser ? [...this.getSavedAccounts(), previousUser, student] : [...this.getSavedAccounts(), student]);
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

    getSavedAccounts(): Student[] {
        return dedupeStudents(this.get(STORAGE_KEYS.SAVED_ACCOUNTS, []));
    }

    setSavedAccounts(students: Student[]) {
        this.set(STORAGE_KEYS.SAVED_ACCOUNTS, dedupeStudents(students));
    }

    addSavedAccount(student: Student) {
        this.setSavedAccounts([...this.getSavedAccounts(), student]);
    }

    removeSavedAccount(studentId: string) {
        this.setSavedAccounts(this.getSavedAccounts().filter((student) => student.id !== studentId));
    }

    logout() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_ROOMMATES);
        localStorage.removeItem(STORAGE_KEYS.SAVED_ACCOUNTS);
        clearResidentPortalLanguage();
    }
}

export const bookingService = new BookingService();
