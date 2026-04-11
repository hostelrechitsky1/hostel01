import type { AppSettings, Banner, Booking, Feedback, Machine, Student } from '../types';
import { normalizeBannerRecord } from '../utils/bannerImages';
import {
    CACHE_MAX_AGE_MS,
    DEFAULT_APP_SETTINGS,
    filterFeedbacksForResident,
    getBookingsByDateCacheKey,
    getBookingsByWeeksCacheKey,
    getCachedResidentBanners,
    getCachedResidentMachines,
    getCachedResidentSettings,
    getResidentFeedbacksCacheKey,
    getStudentBookingsCacheKey,
    normalizeWeekIdsForResidentCache,
    readResidentCache,
    residentCacheKeys,
    resolveResidentCache,
    sortBookingsChronologically,
    sortMachines,
    sortStudentBookingsByRecent,
} from './residentCache';
import {
    decodeFirestoreDocument,
    getFirestoreDocument,
    listFirestoreCollectionDocuments,
    runFirestoreQueryDocuments,
} from './residentFirestoreRest';
import { residentRoomLookupService } from './residentRoomLookupService';

const MACHINES_COL = 'machines';
const BOOKINGS_COL = 'bookings';
const FEEDBACKS_COL = 'feedbacks';
const BANNERS_COL = 'banners';
const SETTINGS_COL = 'settings';
const SETTINGS_DOC_ID = 'config';

const DEFAULT_MACHINES: Machine[] = [
    { id: '1', name: 'Machine 1', status: 'available' },
    { id: '2', name: 'Machine 2', status: 'available' },
    { id: '3', name: 'Machine 3', status: 'available' },
    { id: '4', name: 'Machine 4', status: 'available' }
];

type FirestoreLiteModule = typeof import('firebase/firestore/lite');
type FirestoreLiteClient = FirestoreLiteModule & {
    db: ReturnType<FirestoreLiteModule['getFirestore']>;
};

let firestoreLiteClientPromise: Promise<FirestoreLiteClient> | null = null;

const loadFirestoreLiteClient = () => {
    firestoreLiteClientPromise ??= Promise.all([
        import('firebase/firestore/lite'),
        import('../firebaseApp'),
    ]).then(([firestoreLite, { app }]) => ({
        ...firestoreLite,
        db: firestoreLite.getFirestore(app),
    }));

    return firestoreLiteClientPromise;
};

const normalizeAppSettings = (settings: Partial<AppSettings> | null | undefined): AppSettings => {
    const data = settings ?? {};

    return {
        ...DEFAULT_APP_SETTINGS,
        ...data,
        maintenanceDay: typeof data.maintenanceDay !== 'undefined' ? Number(data.maintenanceDay) : DEFAULT_APP_SETTINGS.maintenanceDay,
        autoOpenWeekday: typeof data.autoOpenWeekday !== 'undefined' ? Number(data.autoOpenWeekday) : DEFAULT_APP_SETTINGS.autoOpenWeekday,
        autoOpenDurationHours: typeof data.autoOpenDurationHours !== 'undefined' ? Number(data.autoOpenDurationHours) : DEFAULT_APP_SETTINGS.autoOpenDurationHours,
        autoOpenTime: typeof data.autoOpenTime === 'string' && /^\d{2}:\d{2}$/.test(data.autoOpenTime)
            ? data.autoOpenTime
            : DEFAULT_APP_SETTINGS.autoOpenTime,
        vipAutoEnabled: typeof data.vipAutoEnabled === 'boolean' ? data.vipAutoEnabled : DEFAULT_APP_SETTINGS.vipAutoEnabled,
        vipLastAppliedWeekId: typeof data.vipLastAppliedWeekId === 'string' ? data.vipLastAppliedWeekId : DEFAULT_APP_SETTINGS.vipLastAppliedWeekId,
        topAlert: data.topAlert
            ? {
                ...DEFAULT_APP_SETTINGS.topAlert,
                ...data.topAlert,
            }
            : DEFAULT_APP_SETTINGS.topAlert,
    };
};

const normalizeBanner = (banner: Banner): Banner => normalizeBannerRecord(banner);

const sortBanners = (banners: Banner[]) => (
    [...banners].sort((left, right) => (left.priority || 99) - (right.priority || 99))
);

const seedDefaultMachinesViaLiteFallback = async () => {
    const { db, doc, setDoc } = await loadFirestoreLiteClient();

    for (const machine of DEFAULT_MACHINES) {
        await setDoc(doc(db, MACHINES_COL, machine.id), machine);
    }

    return sortMachines(DEFAULT_MACHINES);
};

const fetchMachinesViaLiteFallback = async () => {
    const { db, collection, getDocs } = await loadFirestoreLiteClient();
    const snapshot = await getDocs(collection(db, MACHINES_COL));
    let machines = snapshot.docs.map((machineDoc) => machineDoc.data() as Machine);

    if (machines.length === 0) {
        machines = await seedDefaultMachinesViaLiteFallback();
    }

    return sortMachines(machines);
};

const fetchBookingsForWeekIdsViaLiteFallback = async (weekIds: string[]) => {
    const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
    if (normalizedWeekIds.length === 0) return [];

    const { db, collection, getDocs, query, where } = await loadFirestoreLiteClient();
    const bookingsQuery = query(collection(db, BOOKINGS_COL), where('weekId', 'in', normalizedWeekIds));
    const snapshot = await getDocs(bookingsQuery);
    return sortBookingsChronologically(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking));
};

const fetchBookingsForDateViaLiteFallback = async (date: string) => {
    if (!date) return [];

    const { db, collection, getDocs, query, where } = await loadFirestoreLiteClient();
    const bookingsQuery = query(collection(db, BOOKINGS_COL), where('date', '==', date));
    const snapshot = await getDocs(bookingsQuery);
    return sortBookingsChronologically(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking));
};

const fetchRecentBookingsForStudentViaLiteFallback = async (studentId: string, limitCount: number) => {
    if (!studentId) return [];

    const { db, collection, getDocs, query, where } = await loadFirestoreLiteClient();
    const studentBookingsQuery = query(collection(db, BOOKINGS_COL), where('studentId', '==', studentId));
    const snapshot = await getDocs(studentBookingsQuery);
    return sortStudentBookingsByRecent(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking), limitCount);
};

const fetchSettingsViaLiteFallback = async () => {
    const { db, doc, getDoc } = await loadFirestoreLiteClient();
    const configDoc = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC_ID));
    if (!configDoc.exists()) {
        return DEFAULT_APP_SETTINGS;
    }

    return normalizeAppSettings(configDoc.data() as Partial<AppSettings>);
};

const fetchFeedbacksForResidentViaLiteFallback = async (
    studentId: string,
    studentName: string,
    roomNumber: string,
    limitCount: number
) => {
    const normalizedRoom = roomNumber.trim();
    if (!normalizedRoom) return [];

    const { db, collection, getDocs, query, where } = await loadFirestoreLiteClient();
    const residentFeedbackQuery = query(collection(db, FEEDBACKS_COL), where('roomNumber', '==', normalizedRoom));
    const snapshot = await getDocs(residentFeedbackQuery);

    return filterFeedbacksForResident(
        snapshot.docs.map((feedbackDoc) => feedbackDoc.data() as Feedback),
        studentId,
        studentName,
        normalizedRoom,
        limitCount
    );
};

const fetchBannersViaLiteFallback = async () => {
    const { db, collection, getDocs } = await loadFirestoreLiteClient();
    const snapshot = await getDocs(collection(db, BANNERS_COL));

    return sortBanners(
        snapshot.docs.map((bannerDoc) => normalizeBanner(bannerDoc.data() as Banner))
    );
};

export { DEFAULT_APP_SETTINGS } from './residentCache';

export const residentFirestoreService = {
    getCachedSettings() {
        return getCachedResidentSettings();
    },

    getCachedBanners() {
        return getCachedResidentBanners();
    },

    getCachedMachines() {
        return getCachedResidentMachines();
    },

    getCachedBookingsForWeekIds(weekIds: string[]) {
        return readResidentCache<Booking[]>(getBookingsByWeeksCacheKey(weekIds), CACHE_MAX_AGE_MS.bookingsByWeek);
    },

    getCachedRecentBookingsForStudent(studentId: string, limitCount = 12) {
        if (!studentId) return undefined;
        return getCachedResidentRecentBookingsForStudent(studentId, limitCount);
    },

    getCachedFeedbacksForResident(studentId: string, studentName: string, roomNumber: string, limitCount = 8) {
        if (!roomNumber.trim()) return undefined;
        return getCachedResidentFeedbacks(studentId, studentName, roomNumber, limitCount);
    },

    async getStudentsByRoom(roomNumber: string): Promise<Student[]> {
        return residentRoomLookupService.getStudentsByRoom(roomNumber);
    },

    async getMachines(): Promise<Machine[]> {
        return resolveResidentCache(residentCacheKeys.machines, CACHE_MAX_AGE_MS.machines, async () => {
            try {
                const documents = await listFirestoreCollectionDocuments(MACHINES_COL);
                const machines = sortMachines(documents.map((document) => decodeFirestoreDocument<Machine>(document)));

                if (machines.length > 0) {
                    return machines;
                }

                return seedDefaultMachinesViaLiteFallback();
            } catch (error) {
                console.warn('REST machine fetch failed, falling back to Firestore Lite.', error);
                return fetchMachinesViaLiteFallback();
            }
        });
    },

    async getBookingsForWeekIds(weekIds: string[]): Promise<Booking[]> {
        const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
        if (normalizedWeekIds.length === 0) return [];

        return resolveResidentCache(getBookingsByWeeksCacheKey(normalizedWeekIds), CACHE_MAX_AGE_MS.bookingsByWeek, async () => {
            try {
                const documents = await runFirestoreQueryDocuments({
                    collectionId: BOOKINGS_COL,
                    filters: [{
                        fieldPath: 'weekId',
                        op: 'IN',
                        value: {
                            arrayValue: {
                                values: normalizedWeekIds.map((weekId) => ({ stringValue: weekId }))
                            }
                        },
                    }],
                });

                return sortBookingsChronologically(documents.map((document) => decodeFirestoreDocument<Booking>(document)));
            } catch (error) {
                console.warn('REST week bookings fetch failed, falling back to Firestore Lite.', error);
                return fetchBookingsForWeekIdsViaLiteFallback(normalizedWeekIds);
            }
        });
    },

    async getBookingsForDate(date: string): Promise<Booking[]> {
        const normalizedDate = date.trim();
        if (!normalizedDate) return [];

        return resolveResidentCache(getBookingsByDateCacheKey(normalizedDate), CACHE_MAX_AGE_MS.bookingsByWeek, async () => {
            try {
                const documents = await runFirestoreQueryDocuments({
                    collectionId: BOOKINGS_COL,
                    filters: [{
                        fieldPath: 'date',
                        op: 'EQUAL',
                        value: { stringValue: normalizedDate },
                    }],
                });

                return sortBookingsChronologically(documents.map((document) => decodeFirestoreDocument<Booking>(document)));
            } catch (error) {
                console.warn('REST date bookings fetch failed, falling back to Firestore Lite.', error);
                return fetchBookingsForDateViaLiteFallback(normalizedDate);
            }
        });
    },

    async getRecentBookingsForStudent(studentId: string, limitCount = 12): Promise<Booking[]> {
        if (!studentId) return [];

        return resolveResidentCache(getStudentBookingsCacheKey(studentId, limitCount), CACHE_MAX_AGE_MS.recentStudentBookings, async () => {
            try {
                const documents = await runFirestoreQueryDocuments({
                    collectionId: BOOKINGS_COL,
                    filters: [{
                        fieldPath: 'studentId',
                        op: 'EQUAL',
                        value: { stringValue: studentId },
                    }],
                });

                return sortStudentBookingsByRecent(
                    documents.map((document) => decodeFirestoreDocument<Booking>(document)),
                    limitCount
                );
            } catch (error) {
                console.warn('REST student bookings fetch failed, falling back to Firestore Lite.', error);
                return fetchRecentBookingsForStudentViaLiteFallback(studentId, limitCount);
            }
        });
    },

    async getSettings(): Promise<AppSettings> {
        return resolveResidentCache(residentCacheKeys.settings, CACHE_MAX_AGE_MS.settings, async () => {
            try {
                const configDoc = await getFirestoreDocument(SETTINGS_COL, SETTINGS_DOC_ID);
                if (!configDoc) {
                    return DEFAULT_APP_SETTINGS;
                }

                return normalizeAppSettings(decodeFirestoreDocument<Partial<AppSettings>>(configDoc, false));
            } catch (error) {
                console.warn('REST settings fetch failed, falling back to Firestore Lite.', error);
                return fetchSettingsViaLiteFallback();
            }
        });
    },

    async getFeedbacksForResident(
        studentId: string,
        studentName: string,
        roomNumber: string,
        limitCount = 8
    ): Promise<Feedback[]> {
        const normalizedRoom = roomNumber.trim();
        if (!normalizedRoom) return [];

        return resolveResidentCache(
            getResidentFeedbacksCacheKey(studentId, studentName, normalizedRoom, limitCount),
            CACHE_MAX_AGE_MS.recentFeedbacks,
            async () => {
                try {
                    const documents = await runFirestoreQueryDocuments({
                        collectionId: FEEDBACKS_COL,
                        filters: [{
                            fieldPath: 'roomNumber',
                            op: 'EQUAL',
                            value: { stringValue: normalizedRoom },
                        }],
                    });

                    return filterFeedbacksForResident(
                        documents.map((document) => decodeFirestoreDocument<Feedback>(document)),
                        studentId,
                        studentName,
                        normalizedRoom,
                        limitCount
                    );
                } catch (error) {
                    console.warn('REST resident feedback fetch failed, falling back to Firestore Lite.', error);
                    return fetchFeedbacksForResidentViaLiteFallback(studentId, studentName, normalizedRoom, limitCount);
                }
            }
        );
    },

    async getBanners(): Promise<Banner[]> {
        return resolveResidentCache(residentCacheKeys.banners, CACHE_MAX_AGE_MS.banners, async () => {
            try {
                const documents = await listFirestoreCollectionDocuments(BANNERS_COL);
                return sortBanners(
                    documents.map((document) => normalizeBanner(decodeFirestoreDocument<Banner>(document)))
                );
            } catch (error) {
                console.warn('REST banners fetch failed, falling back to Firestore Lite.', error);
                return fetchBannersViaLiteFallback();
            }
        });
    },
};

const getCachedResidentRecentBookingsForStudent = (studentId: string, limitCount: number) => (
    readResidentCache<Booking[]>(getStudentBookingsCacheKey(studentId, limitCount), CACHE_MAX_AGE_MS.recentStudentBookings)
);

const getCachedResidentFeedbacks = (studentId: string, studentName: string, roomNumber: string, limitCount: number) => (
    readResidentCache<Feedback[]>(
        getResidentFeedbacksCacheKey(studentId, studentName, roomNumber, limitCount),
        CACHE_MAX_AGE_MS.recentFeedbacks
    )
);
