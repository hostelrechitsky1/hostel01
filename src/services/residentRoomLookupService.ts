import type { Student } from '../types';
import { decodeFirestoreDocument, runFirestoreQueryDocuments } from './residentFirestoreRest';

const STUDENTS_COL = 'students';
const CACHE_PREFIX = 'hostel-cache:v4';
const STUDENTS_BY_ROOM_MAX_AGE_MS = 15 * 60 * 1000;
const STUDENT_ROOM_FIELDS = ['id', 'name', 'roomNumber', 'pin'];

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

const fetchStudentsByRoomViaRest = async (roomNumber: string): Promise<Student[]> => {
    const documents = await runFirestoreQueryDocuments({
        collectionId: STUDENTS_COL,
        fieldPaths: STUDENT_ROOM_FIELDS,
        filters: [{
            fieldPath: 'roomNumber',
            op: 'EQUAL',
            value: { stringValue: roomNumber },
        }],
        limit: 8,
    });

    return documents
        .map((document) => decodeFirestoreDocument<Student>(document))
        .filter((student) => student.roomNumber === roomNumber);
};

const fetchStudentsByRoomViaLiteFallback = async (roomNumber: string): Promise<Student[]> => {
    const [{ collection, getDocs, getFirestore, query, where }, { app }] = await Promise.all([
        import('firebase/firestore/lite'),
        import('../firebaseApp'),
    ]);

    const db = getFirestore(app);
    const roomQuery = query(collection(db, STUDENTS_COL), where('roomNumber', '==', roomNumber));
    const snapshot = await getDocs(roomQuery);

    return snapshot.docs.map((studentDoc) => studentDoc.data() as Student);
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

        let students: Student[];

        try {
            students = await fetchStudentsByRoomViaRest(normalizedRoom);
        } catch (error) {
            console.warn('REST room lookup failed, falling back to Firestore Lite.', error);
            students = await fetchStudentsByRoomViaLiteFallback(normalizedRoom);
        }

        writeCache(cacheKey, students);
        return students;
    },
};
