import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore/lite';
import { app } from '../firebaseApp';
import type { Student } from '../types';

const db = getFirestore(app);
const STUDENTS_COL = 'students';
const CACHE_PREFIX = 'hostel-cache:v4';
const STUDENTS_BY_ROOM_MAX_AGE_MS = 15 * 60 * 1000;

type CacheRecord<T> = {
    savedAt: number;
    value: T;
};

const runtimeCache = new Map<string, CacheRecord<unknown>>();

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const getStorageKey = (key: string) => `${CACHE_PREFIX}:${key}`;
const getStudentsRoomCacheKey = (roomNumber: string) => `students:room:${roomNumber.trim().toLowerCase()}`;

const readCache = <T>(key: string, maxAgeMs: number): T | undefined => {
    const now = Date.now();
    const inMemory = runtimeCache.get(key) as CacheRecord<T> | undefined;

    if (inMemory) {
        if (now - inMemory.savedAt <= maxAgeMs) {
            return inMemory.value;
        }
        runtimeCache.delete(key);
    }

    if (!canUseStorage()) return undefined;

    try {
        const raw = window.localStorage.getItem(getStorageKey(key));
        if (!raw) return undefined;

        const parsed = JSON.parse(raw) as CacheRecord<T>;
        if (!parsed || typeof parsed.savedAt !== 'number') {
            window.localStorage.removeItem(getStorageKey(key));
            return undefined;
        }

        if (now - parsed.savedAt > maxAgeMs) {
            window.localStorage.removeItem(getStorageKey(key));
            return undefined;
        }

        runtimeCache.set(key, parsed as CacheRecord<unknown>);
        return parsed.value;
    } catch {
        return undefined;
    }
};

const writeCache = <T>(key: string, value: T) => {
    const record: CacheRecord<T> = { savedAt: Date.now(), value };
    runtimeCache.set(key, record as CacheRecord<unknown>);

    if (!canUseStorage()) return;

    try {
        window.localStorage.setItem(getStorageKey(key), JSON.stringify(record));
    } catch {
        // Keep the in-memory cache if storage writes fail.
    }
};

export const residentRoomLookupService = {
    getCachedStudentsByRoom(roomNumber: string) {
        const normalizedRoom = roomNumber.trim();
        if (!normalizedRoom) return undefined;
        return readCache<Student[]>(getStudentsRoomCacheKey(normalizedRoom), STUDENTS_BY_ROOM_MAX_AGE_MS);
    },

    async getStudentsByRoom(roomNumber: string): Promise<Student[]> {
        const normalizedRoom = roomNumber.trim();
        if (!normalizedRoom) return [];

        const cacheKey = getStudentsRoomCacheKey(normalizedRoom);
        const cached = readCache<Student[]>(cacheKey, STUDENTS_BY_ROOM_MAX_AGE_MS);
        if (cached !== undefined) {
            return cached;
        }

        const roomQuery = query(collection(db, STUDENTS_COL), where('roomNumber', '==', normalizedRoom));
        const snapshot = await getDocs(roomQuery);
        const students = snapshot.docs.map((studentDoc) => studentDoc.data() as Student);
        writeCache(cacheKey, students);
        return students;
    }
};
