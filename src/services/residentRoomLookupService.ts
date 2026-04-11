import type { Student } from '../types';

const STUDENTS_COL = 'students';
const CACHE_PREFIX = 'hostel-cache:v4';
const STUDENTS_BY_ROOM_MAX_AGE_MS = 15 * 60 * 1000;
const FIRESTORE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const FIRESTORE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;

type CacheRecord<T> = {
    savedAt: number;
    value: T;
};

type FirestoreValue =
    | { stringValue: string }
    | { integerValue: string }
    | { doubleValue: number }
    | { booleanValue: boolean }
    | { nullValue: null }
    | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
    name: string;
    fields?: Record<string, FirestoreValue>;
};

type FirestoreRunQueryResult = {
    document?: FirestoreDocument;
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

const decodeFirestoreValue = (value?: FirestoreValue): unknown => {
    if (!value) return undefined;

    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('mapValue' in value) {
        const fields = value.mapValue.fields ?? {};
        return Object.fromEntries(
            Object.entries(fields).map(([fieldName, fieldValue]) => [fieldName, decodeFirestoreValue(fieldValue)])
        );
    }

    return undefined;
};

const mapFirestoreStudent = (document: FirestoreDocument): Student => {
    const fields = document.fields ?? {};
    const fallbackId = document.name.split('/').pop() ?? '';
    const id = decodeFirestoreValue(fields.id) ?? fallbackId;
    const name = decodeFirestoreValue(fields.name) ?? '';
    const roomNumber = decodeFirestoreValue(fields.roomNumber) ?? '';
    const pin = decodeFirestoreValue(fields.pin);

    return {
        id: String(id),
        name: String(name),
        roomNumber: String(roomNumber),
        pin: typeof pin === 'string' ? pin : undefined,
    };
};

const fetchStudentsByRoomViaRest = async (roomNumber: string): Promise<Student[]> => {
    if (!FIRESTORE_PROJECT_ID || !FIRESTORE_API_KEY) {
        throw new Error('Missing Firebase REST configuration');
    }

    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: STUDENTS_COL }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'roomNumber' },
                            op: 'EQUAL',
                            value: { stringValue: roomNumber },
                        },
                    },
                    limit: 8,
                },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Firestore REST room lookup failed with ${response.status}`);
    }

    const results = await response.json() as FirestoreRunQueryResult[];
    return results
        .flatMap((result) => result.document ? [mapFirestoreStudent(result.document)] : [])
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
