import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    where,
} from 'firebase/firestore/lite';
import { dbLite } from '../firebaseLite';
import type { AppSettings, Banner, Booking, Feedback, Machine, Student } from '../types';
import { normalizeBannerSource } from '../utils/bannerImages';
import {
    CACHE_MAX_AGE_MS,
    DEFAULT_APP_SETTINGS,
    filterFeedbacksForResident,
    getBookingsByWeeksCacheKey,
    getCachedResidentBanners,
    getCachedResidentMachines,
    getCachedResidentSettings,
    getResidentFeedbacksCacheKey,
    getStudentBookingsCacheKey,
    getStudentsRoomCacheKey,
    normalizeWeekIdsForResidentCache,
    readResidentCache,
    residentCacheKeys,
    resolveResidentCache,
    sortBookingsChronologically,
    sortMachines,
    sortStudentBookingsByRecent,
} from './residentCache';

const STUDENTS_COL = 'students';
const MACHINES_COL = 'machines';
const BOOKINGS_COL = 'bookings';
const SETTINGS_DOC = doc(dbLite, 'settings', 'config');

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
        const normalizedRoom = roomNumber.trim();
        if (!normalizedRoom) return [];

        return resolveResidentCache(getStudentsRoomCacheKey(normalizedRoom), CACHE_MAX_AGE_MS.studentsByRoom, async () => {
            const roomQuery = query(collection(dbLite, STUDENTS_COL), where('roomNumber', '==', normalizedRoom));
            const snapshot = await getDocs(roomQuery);
            return snapshot.docs.map((studentDoc) => studentDoc.data() as Student);
        });
    },

    async getMachines(): Promise<Machine[]> {
        return resolveResidentCache(residentCacheKeys.machines, CACHE_MAX_AGE_MS.machines, async () => {
            const snapshot = await getDocs(collection(dbLite, MACHINES_COL));
            let machines = snapshot.docs.map((machineDoc) => machineDoc.data() as Machine);

            if (machines.length === 0) {
                const defaults: Machine[] = [
                    { id: '1', name: 'Machine 1', status: 'available' },
                    { id: '2', name: 'Machine 2', status: 'available' },
                    { id: '3', name: 'Machine 3', status: 'available' },
                    { id: '4', name: 'Machine 4', status: 'available' }
                ];

                for (const machine of defaults) {
                    await setDoc(doc(dbLite, MACHINES_COL, machine.id), machine);
                }
                machines = defaults;
            }

            return sortMachines(machines);
        });
    },

    async getBookingsForWeekIds(weekIds: string[]): Promise<Booking[]> {
        const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
        if (normalizedWeekIds.length === 0) return [];

        return resolveResidentCache(getBookingsByWeeksCacheKey(normalizedWeekIds), CACHE_MAX_AGE_MS.bookingsByWeek, async () => {
            const bookingsQuery = query(collection(dbLite, BOOKINGS_COL), where('weekId', 'in', normalizedWeekIds));
            const snapshot = await getDocs(bookingsQuery);
            return sortBookingsChronologically(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking));
        });
    },

    async getRecentBookingsForStudent(studentId: string, limitCount = 12): Promise<Booking[]> {
        if (!studentId) return [];

        return resolveResidentCache(getStudentBookingsCacheKey(studentId, limitCount), CACHE_MAX_AGE_MS.recentStudentBookings, async () => {
            const studentBookingsQuery = query(collection(dbLite, BOOKINGS_COL), where('studentId', '==', studentId));
            const snapshot = await getDocs(studentBookingsQuery);
            return sortStudentBookingsByRecent(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking), limitCount);
        });
    },

    async getSettings(): Promise<AppSettings> {
        return resolveResidentCache(residentCacheKeys.settings, CACHE_MAX_AGE_MS.settings, async () => {
            const configDoc = await getDoc(SETTINGS_DOC);
            if (!configDoc.exists()) {
                return DEFAULT_APP_SETTINGS;
            }

            const data = configDoc.data() as Partial<AppSettings>;
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
                vipLastAppliedWeekId: typeof data.vipLastAppliedWeekId === 'string' ? data.vipLastAppliedWeekId : DEFAULT_APP_SETTINGS.vipLastAppliedWeekId
            };
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
                const residentFeedbackQuery = query(collection(dbLite, 'feedbacks'), where('roomNumber', '==', normalizedRoom));
                const snapshot = await getDocs(residentFeedbackQuery);
                return filterFeedbacksForResident(
                    snapshot.docs.map((feedbackDoc) => feedbackDoc.data() as Feedback),
                    studentId,
                    studentName,
                    normalizedRoom,
                    limitCount
                );
            }
        );
    },

    async getBanners(): Promise<Banner[]> {
        return resolveResidentCache(residentCacheKeys.banners, CACHE_MAX_AGE_MS.banners, async () => {
            const snapshot = await getDocs(collection(dbLite, 'banners'));
            return snapshot.docs
                .map((bannerDoc) => {
                    const banner = bannerDoc.data() as Banner;
                    return {
                        ...banner,
                        imageUrl: normalizeBannerSource(banner.imageUrl)
                    };
                })
                .sort((left, right) => (left.priority || 99) - (right.priority || 99));
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
