import type { Student } from '../types';
import { clearResidentPortalLanguage } from '../utils/residentPortalLanguage';
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from '../utils/browserStorage';

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

const isStudent = (value: unknown): value is Student => {
    if (!value || typeof value !== 'object') return false;
    const student = value as Partial<Student>;
    return typeof student.id === 'string' && Boolean(student.id)
        && typeof student.name === 'string' && typeof student.roomNumber === 'string';
};

/**
 * Legacy BookingService - Now stripped down to handle Session Management only.
 * Data persistence has moved to Firestore.
 */
class BookingService {
    private memoryFallback = new Map<string, unknown>();

    private get<T>(key: string, defaultValue: T): T {
        if (this.memoryFallback.has(key)) return this.memoryFallback.get(key) as T;
        try {
            const data = readBrowserStorage('local', key);
            return data ? JSON.parse(data) : defaultValue;
        } catch {
            removeBrowserStorage('local', key);
            return defaultValue;
        }
    }

    private set<T>(key: string, value: T) {
        if (writeBrowserStorage('local', key, JSON.stringify(value))) this.memoryFallback.delete(key);
        else this.memoryFallback.set(key, value);
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
        const student = this.get<unknown>(STORAGE_KEYS.CURRENT_USER, null);
        return isStudent(student) ? student : null;
    }

    getCurrentRoommates(): Student[] {
        const students = this.get<unknown>(STORAGE_KEYS.CURRENT_ROOMMATES, []);
        return Array.isArray(students) ? students.filter(isStudent) : [];
    }

    getSavedAccounts(): Student[] {
        const students = this.get<unknown>(STORAGE_KEYS.SAVED_ACCOUNTS, []);
        return dedupeStudents(Array.isArray(students) ? students.filter(isStudent) : []);
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
        this.memoryFallback.clear();
        Object.values(STORAGE_KEYS).forEach((key) => removeBrowserStorage('local', key));
        clearResidentPortalLanguage();
    }
}

export const bookingService = new BookingService();
