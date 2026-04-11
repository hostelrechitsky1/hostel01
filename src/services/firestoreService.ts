import { db } from '../firebase';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import type { AppSettings, Banner, Booking, Feedback, Machine, Student, VipRecurringRule } from '../types';
import { legacyPinMap } from '../data/pinMap';
import { parseRawStudentData } from '../utils/studentParser';
import { normalizeBannerSource } from '../utils/bannerImages';

const STUDENTS_COL = 'students';
const MACHINES_COL = 'machines';
const BOOKINGS_COL = 'bookings';
const BOOKING_LIMITS_COL = 'bookingLimits';
const VIP_RULES_COL = 'vipRecurringRules';
const SETTINGS_DOC = doc(db, 'settings', 'config');

const CACHE_PREFIX = 'hostel-cache:v4';
const CACHE_MAX_AGE_MS = {
    banners: 10 * 60 * 1000,
    bookingsByWeek: 2 * 60 * 1000,
    machines: 5 * 60 * 1000,
    recentAdminBookings: 2 * 60 * 1000,
    recentStudentBookings: 5 * 60 * 1000,
    recentFeedbacks: 2 * 60 * 1000,
    settings: 10 * 60 * 1000,
    studentsAll: 5 * 60 * 1000,
    studentsByRoom: 15 * 60 * 1000,
} as const;

type CacheRecord<T> = {
    savedAt: number;
    value: T;
};

const runtimeCache = new Map<string, CacheRecord<unknown>>();

export const DEFAULT_APP_SETTINGS: AppSettings = {
    forceShowNextWeek: false,
    forceCloseBookings: false,
    maintenanceDay: 3,
    autoOpenWeekday: 6,
    autoOpenTime: '16:00',
    autoOpenDurationHours: 28,
    vipAutoEnabled: true,
    vipLastAppliedWeekId: '',
    topAlert: { message: '', isActive: false, type: 'info' }
};

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getStorageKey = (key: string) => `${CACHE_PREFIX}:${key}`;

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

const writeCache = <T>(key: string, value: T, persist = true) => {
    const record: CacheRecord<T> = { savedAt: Date.now(), value };
    runtimeCache.set(key, record as CacheRecord<unknown>);

    if (!persist || !canUseStorage()) return;

    try {
        window.localStorage.setItem(getStorageKey(key), JSON.stringify(record));
    } catch {
        // Ignore storage write failures and keep the in-memory cache.
    }
};

const clearCache = (key: string) => {
    runtimeCache.delete(key);
    if (canUseStorage()) {
        window.localStorage.removeItem(getStorageKey(key));
    }
};

const clearCacheByPrefix = (prefix: string) => {
    for (const key of Array.from(runtimeCache.keys())) {
        if (key.startsWith(prefix)) {
            runtimeCache.delete(key);
        }
    }

    if (!canUseStorage()) return;

    const storagePrefix = getStorageKey(prefix);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const storageKey = window.localStorage.key(index);
        if (storageKey?.startsWith(storagePrefix)) {
            window.localStorage.removeItem(storageKey);
        }
    }
};

const resolveWithCache = async <T>(
    key: string,
    maxAgeMs: number,
    load: () => Promise<T>,
    options?: { persist?: boolean }
): Promise<T> => {
    const cached = readCache<T>(key, maxAgeMs);
    if (cached !== undefined) {
        return cached;
    }

    const value = await load();
    writeCache(key, value, options?.persist !== false);
    return value;
};

const hydrateFromCache = <T>(
    key: string,
    maxAgeMs: number,
    callback: (value: T) => void
) => {
    const cached = readCache<T>(key, maxAgeMs);
    if (cached !== undefined) {
        callback(cached);
        return true;
    }
    return false;
};

const sortMachines = (machines: Machine[]) => {
    return [...machines].sort((left, right) => left.id.localeCompare(right.id));
};

const sortBookingsChronologically = (bookings: Booking[]) => {
    return [...bookings].sort((left, right) => {
        const leftKey = `${left.date}T${left.startTime}`;
        const rightKey = `${right.date}T${right.startTime}`;
        return leftKey.localeCompare(rightKey);
    });
};

const sortStudentBookingsByRecent = (bookings: Booking[], limitCount?: number) => {
    const sorted = [...bookings].sort((left, right) => right.createdAt - left.createdAt);
    return typeof limitCount === 'number' ? sorted.slice(0, limitCount) : sorted;
};

const sortFeedbacksByRecent = (feedbacks: Feedback[]) => {
    return [...feedbacks].sort((left, right) => right.timestamp - left.timestamp);
};

const normalizeFeedbackIdentity = (studentId: string, studentName: string, roomNumber: string) => ({
    studentId: studentId.trim(),
    studentName: studentName.trim().toLowerCase(),
    roomNumber: roomNumber.trim().toLowerCase(),
});

const filterFeedbacksForResident = (
    feedbacks: Feedback[],
    studentId: string,
    studentName: string,
    roomNumber: string,
    limitCount?: number
) => {
    const identity = normalizeFeedbackIdentity(studentId, studentName, roomNumber);
    const filtered = feedbacks.filter((feedback) => {
        const feedbackRoom = feedback.roomNumber?.trim().toLowerCase();
        const feedbackName = feedback.studentName?.trim().toLowerCase();

        if (feedback.studentId && identity.studentId) {
            return feedback.studentId === identity.studentId;
        }

        return feedbackRoom === identity.roomNumber && feedbackName === identity.studentName;
    });

    const sorted = sortFeedbacksByRecent(filtered);
    return typeof limitCount === 'number' ? sorted.slice(0, limitCount) : sorted;
};

const normalizeWeekIds = (weekIds: string[]) => {
    return Array.from(new Set(weekIds.filter(Boolean))).sort();
};

const getStudentsRoomCacheKey = (roomNumber: string) => `students:room:${roomNumber.trim().toLowerCase()}`;
const getBookingsByWeeksCacheKey = (weekIds: string[]) => `bookings:weeks:${normalizeWeekIds(weekIds).join('|')}`;
const getStudentBookingsCacheKey = (studentId: string, limitCount: number) => `bookings:student:${studentId}:recent:${limitCount}`;
const getRecentAdminBookingsCacheKey = (limitCount: number) => `bookings:admin:recent:${limitCount}`;
const getFeedbacksCacheKey = (limitCount?: number) => `feedbacks:${typeof limitCount === 'number' ? `recent:${limitCount}` : 'all'}`;
const getResidentFeedbacksCacheKey = (studentId: string, studentName: string, roomNumber: string, limitCount: number) => {
    const identity = normalizeFeedbackIdentity(studentId, studentName, roomNumber);
    return `feedbacks:resident:${identity.studentId || 'legacy'}:${identity.roomNumber}:${identity.studentName}:recent:${limitCount}`;
};

const cacheKeys = {
    banners: 'banners:all',
    machines: 'machines:all',
    settings: 'settings:config',
    students: 'students:all',
};

export const firestoreService = {
    getCachedSettings() {
        return readCache<AppSettings>(cacheKeys.settings, CACHE_MAX_AGE_MS.settings);
    },

    getCachedBanners() {
        return readCache<Banner[]>(cacheKeys.banners, CACHE_MAX_AGE_MS.banners);
    },

    getCachedMachines() {
        return readCache<Machine[]>(cacheKeys.machines, CACHE_MAX_AGE_MS.machines);
    },

    getCachedStudents() {
        return readCache<Student[]>(cacheKeys.students, CACHE_MAX_AGE_MS.studentsAll);
    },

    getCachedBookingsForWeekIds(weekIds: string[]) {
        return readCache<Booking[]>(getBookingsByWeeksCacheKey(weekIds), CACHE_MAX_AGE_MS.bookingsByWeek);
    },

    getCachedRecentAdminBookings(limitCount = 80) {
        return readCache<Booking[]>(getRecentAdminBookingsCacheKey(limitCount), CACHE_MAX_AGE_MS.recentAdminBookings);
    },

    getCachedRecentBookingsForStudent(studentId: string, limitCount = 12) {
        if (!studentId) return undefined;
        return readCache<Booking[]>(getStudentBookingsCacheKey(studentId, limitCount), CACHE_MAX_AGE_MS.recentStudentBookings);
    },

    getCachedFeedbacks(limitCount?: number) {
        return readCache<Feedback[]>(getFeedbacksCacheKey(limitCount), CACHE_MAX_AGE_MS.recentFeedbacks);
    },

    getCachedFeedbacksForResident(studentId: string, studentName: string, roomNumber: string, limitCount = 8) {
        if (!roomNumber.trim()) return undefined;
        return readCache<Feedback[]>(
            getResidentFeedbacksCacheKey(studentId, studentName, roomNumber, limitCount),
            CACHE_MAX_AGE_MS.recentFeedbacks
        );
    },

    async getAllStudents(): Promise<Student[]> {
        return resolveWithCache(cacheKeys.students, CACHE_MAX_AGE_MS.studentsAll, async () => {
            const snapshot = await getDocs(collection(db, STUDENTS_COL));
            return snapshot.docs.map((studentDoc) => studentDoc.data() as Student);
        });
    },

    async getStudentsByRoom(roomNumber: string): Promise<Student[]> {
        const normalizedRoom = roomNumber.trim();
        if (!normalizedRoom) return [];

        return resolveWithCache(getStudentsRoomCacheKey(normalizedRoom), CACHE_MAX_AGE_MS.studentsByRoom, async () => {
            const roomQuery = query(collection(db, STUDENTS_COL), where('roomNumber', '==', normalizedRoom));
            const snapshot = await getDocs(roomQuery);
            return snapshot.docs.map((studentDoc) => studentDoc.data() as Student);
        });
    },

    async seedStudents(rawData: string) {
        const students = parseRawStudentData(rawData);
        const roomPins = new Map<string, string>();

        Object.entries(legacyPinMap).forEach(([room, pin]) => {
            roomPins.set(room, pin);
        });
        console.log(`Loaded ${roomPins.size} legacy PINs from backup.`);

        const generatePin = () => Math.floor(100 + Math.random() * 900).toString();

        for (const student of students) {
            if (!roomPins.has(student.roomNumber)) {
                const newPin = generatePin();
                roomPins.set(student.roomNumber, newPin);
                console.log(`New room ${student.roomNumber}, assigned PIN ${newPin}`);
            }
            student.pin = roomPins.get(student.roomNumber);
            await setDoc(doc(db, STUDENTS_COL, student.id), student);
        }

        clearCacheByPrefix('students:');
        console.log(`Seeded ${students.length} students with preserved PINs`);
    },

    async addStudent(student: Student) {
        await setDoc(doc(db, STUDENTS_COL, student.id), student);
        clearCacheByPrefix('students:');
    },

    async updateStudent(student: Student) {
        await updateDoc(doc(db, STUDENTS_COL, student.id), { ...student });
        clearCacheByPrefix('students:');
    },

    async deleteStudent(id: string) {
        await deleteDoc(doc(db, STUDENTS_COL, id));
        clearCacheByPrefix('students:');
    },

    async getMachines(): Promise<Machine[]> {
        return resolveWithCache(cacheKeys.machines, CACHE_MAX_AGE_MS.machines, async () => {
            const snapshot = await getDocs(collection(db, MACHINES_COL));
            let machines = snapshot.docs.map((machineDoc) => machineDoc.data() as Machine);

            if (machines.length === 0) {
                const defaults: Machine[] = [
                    { id: '1', name: 'Machine 1', status: 'available' },
                    { id: '2', name: 'Machine 2', status: 'available' },
                    { id: '3', name: 'Machine 3', status: 'available' },
                    { id: '4', name: 'Machine 4', status: 'available' }
                ];
                for (const machine of defaults) {
                    await setDoc(doc(db, MACHINES_COL, machine.id), machine);
                }
                machines = defaults;
            }

            return sortMachines(machines);
        });
    },

    subscribeToMachines(callback: (machines: Machine[]) => void, onError?: (error: unknown) => void): () => void {
        hydrateFromCache(cacheKeys.machines, CACHE_MAX_AGE_MS.machines, callback);

        const machinesQuery = collection(db, MACHINES_COL);
        return onSnapshot(machinesQuery, (snapshot) => {
            const machines = sortMachines(snapshot.docs.map((machineDoc) => machineDoc.data() as Machine));
            writeCache(cacheKeys.machines, machines);
            callback(machines);
        }, (error) => {
            console.error('Error subscribing to machines:', error);
            onError?.(error);
        });
    },

    async updateMachineStatus(id: string, status: 'available' | 'maintenance') {
        await updateDoc(doc(db, MACHINES_COL, id), { status });
        clearCache(cacheKeys.machines);
    },

    async addMachine(name: string) {
        const id = Date.now().toString();
        const newMachine: Machine = { id, name, status: 'available' };
        await setDoc(doc(db, MACHINES_COL, id), newMachine);
        clearCache(cacheKeys.machines);
    },

    async deleteMachine(id: string) {
        await deleteDoc(doc(db, MACHINES_COL, id));
        clearCache(cacheKeys.machines);
    },

    async getBookings(): Promise<Booking[]> {
        return resolveWithCache('bookings:all', CACHE_MAX_AGE_MS.bookingsByWeek, async () => {
            const snapshot = await getDocs(collection(db, BOOKINGS_COL));
            return snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking);
        }, { persist: false });
    },

    async getRecentAdminBookings(limitCount = 80): Promise<Booking[]> {
        return resolveWithCache(getRecentAdminBookingsCacheKey(limitCount), CACHE_MAX_AGE_MS.recentAdminBookings, async () => {
            const bookingsQuery = query(collection(db, BOOKINGS_COL), orderBy('createdAt', 'desc'), limit(limitCount));
            const snapshot = await getDocs(bookingsQuery);
            return snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking);
        });
    },

    subscribeToBookings(callback: (bookings: Booking[]) => void, onError?: (error: unknown) => void): () => void {
        hydrateFromCache('bookings:all', CACHE_MAX_AGE_MS.bookingsByWeek, callback);

        const bookingsQuery = collection(db, BOOKINGS_COL);
        return onSnapshot(bookingsQuery, (snapshot) => {
            const bookings = snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking);
            writeCache('bookings:all', bookings, false);
            callback(bookings);
        }, (error) => {
            console.error('Error subscribing to bookings:', error);
            onError?.(error);
        });
    },

    async getBookingsForWeekIds(weekIds: string[]): Promise<Booking[]> {
        const normalizedWeekIds = normalizeWeekIds(weekIds);
        if (normalizedWeekIds.length === 0) return [];

        return resolveWithCache(getBookingsByWeeksCacheKey(normalizedWeekIds), CACHE_MAX_AGE_MS.bookingsByWeek, async () => {
            const bookingsQuery = query(collection(db, BOOKINGS_COL), where('weekId', 'in', normalizedWeekIds));
            const snapshot = await getDocs(bookingsQuery);
            return sortBookingsChronologically(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking));
        });
    },

    subscribeToBookingsForWeekIds(
        weekIds: string[],
        callback: (bookings: Booking[]) => void,
        onError?: (error: unknown) => void
    ): () => void {
        const normalizedWeekIds = normalizeWeekIds(weekIds);
        if (normalizedWeekIds.length === 0) {
            callback([]);
            return () => { /* noop */ };
        }

        const cacheKey = getBookingsByWeeksCacheKey(normalizedWeekIds);
        hydrateFromCache(cacheKey, CACHE_MAX_AGE_MS.bookingsByWeek, callback);

        const bookingsQuery = query(collection(db, BOOKINGS_COL), where('weekId', 'in', normalizedWeekIds));
        return onSnapshot(bookingsQuery, (snapshot) => {
            const bookings = sortBookingsChronologically(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking));
            writeCache(cacheKey, bookings);
            callback(bookings);
        }, (error) => {
            console.error('Error subscribing to week bookings:', error);
            onError?.(error);
        });
    },

    async getRecentBookingsForStudent(studentId: string, limitCount = 12): Promise<Booking[]> {
        if (!studentId) return [];

        return resolveWithCache(getStudentBookingsCacheKey(studentId, limitCount), CACHE_MAX_AGE_MS.recentStudentBookings, async () => {
            const studentBookingsQuery = query(collection(db, BOOKINGS_COL), where('studentId', '==', studentId));
            const snapshot = await getDocs(studentBookingsQuery);
            return sortStudentBookingsByRecent(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking), limitCount);
        });
    },

    subscribeToRecentBookingsForStudent(
        studentId: string,
        limitCount = 12,
        callback: (bookings: Booking[]) => void,
        onError?: (error: unknown) => void
    ): () => void {
        if (!studentId) {
            callback([]);
            return () => { /* noop */ };
        }

        const cacheKey = getStudentBookingsCacheKey(studentId, limitCount);
        hydrateFromCache(cacheKey, CACHE_MAX_AGE_MS.recentStudentBookings, callback);

        const studentBookingsQuery = query(collection(db, BOOKINGS_COL), where('studentId', '==', studentId));
        return onSnapshot(studentBookingsQuery, (snapshot) => {
            const bookings = sortStudentBookingsByRecent(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking), limitCount);
            writeCache(cacheKey, bookings);
            callback(bookings);
        }, (error) => {
            console.error('Error subscribing to student bookings:', error);
            onError?.(error);
        });
    },

    async createBooking(booking: Booking): Promise<{ success: boolean; error?: string }> {
        const slotId = `${booking.date}_${booking.machineId}_${booking.startTime.replace(':', '-')}`;
        const slotRef = doc(db, BOOKINGS_COL, slotId);
        const limitId = `${booking.studentId}_${booking.weekId}`;
        const limitRef = doc(db, BOOKING_LIMITS_COL, limitId);
        const bookingRecord = { ...booking, id: slotId };

        const result = await runTransaction(db, async (transaction) => {
            const slotSnapshot = await transaction.get(slotRef);
            if (slotSnapshot.exists()) {
                return { success: false, error: 'Slot already booked by another student. Please try a different time.' };
            }

            const limitSnapshot = await transaction.get(limitRef);
            if (limitSnapshot.exists()) {
                return { success: false, error: 'You have already booked a slot for this week.' };
            }

            transaction.set(slotRef, bookingRecord);
            transaction.set(limitRef, { studentId: booking.studentId, weekId: booking.weekId, bookingId: slotId });
            return { success: true };
        });

        if (result.success) {
            clearCacheByPrefix('bookings:');
        }

        return result;
    },

    async cancelBooking(id: string) {
        const bookingRef = doc(db, BOOKINGS_COL, id);
        const bookingSnapshot = await getDoc(bookingRef);
        if (bookingSnapshot.exists()) {
            const booking = bookingSnapshot.data() as Booking;
            const limitId = `${booking.studentId}_${booking.weekId}`;
            await deleteDoc(doc(db, BOOKING_LIMITS_COL, limitId));
        }

        await deleteDoc(bookingRef);
        clearCacheByPrefix('bookings:');
    },

    async getSettings(): Promise<AppSettings> {
        return resolveWithCache(cacheKeys.settings, CACHE_MAX_AGE_MS.settings, async () => {
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

    async updateSettings(settings: Partial<AppSettings>) {
        const cleanSettings = { ...settings };
        if (cleanSettings.maintenanceDay !== undefined) {
            cleanSettings.maintenanceDay = Number(cleanSettings.maintenanceDay);
        }
        if (cleanSettings.autoOpenWeekday !== undefined) {
            cleanSettings.autoOpenWeekday = Number(cleanSettings.autoOpenWeekday);
        }
        if (cleanSettings.autoOpenDurationHours !== undefined) {
            cleanSettings.autoOpenDurationHours = Number(cleanSettings.autoOpenDurationHours);
        }

        await setDoc(SETTINGS_DOC, cleanSettings, { merge: true });
        clearCache(cacheKeys.settings);
    },

    async clearAllBookings() {
        const snapshot = await getDocs(collection(db, BOOKINGS_COL));
        const batch = writeBatch(db);
        snapshot.docs.forEach((bookingDoc) => {
            batch.delete(bookingDoc.ref);
        });

        const limitsSnapshot = await getDocs(collection(db, BOOKING_LIMITS_COL));
        limitsSnapshot.docs.forEach((limitDoc) => {
            batch.delete(limitDoc.ref);
        });

        await batch.commit();
        clearCacheByPrefix('bookings:');
    },

    async addFeedback(feedback: Feedback) {
        await setDoc(doc(db, 'feedbacks', feedback.id), feedback);
        clearCacheByPrefix('feedbacks:');
    },

    async getFeedbacks(limitCount?: number): Promise<Feedback[]> {
        return resolveWithCache(getFeedbacksCacheKey(limitCount), CACHE_MAX_AGE_MS.recentFeedbacks, async () => {
            const feedbacksRef = collection(db, 'feedbacks');
            const feedbacksQuery = typeof limitCount === 'number'
                ? query(feedbacksRef, orderBy('timestamp', 'desc'), limit(limitCount))
                : query(feedbacksRef, orderBy('timestamp', 'desc'));
            const snapshot = await getDocs(feedbacksQuery);
            return sortFeedbacksByRecent(snapshot.docs.map((feedbackDoc) => feedbackDoc.data() as Feedback));
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

        return resolveWithCache(
            getResidentFeedbacksCacheKey(studentId, studentName, normalizedRoom, limitCount),
            CACHE_MAX_AGE_MS.recentFeedbacks,
            async () => {
                const residentFeedbackQuery = query(collection(db, 'feedbacks'), where('roomNumber', '==', normalizedRoom));
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

    subscribeToFeedbacksForResident(
        studentId: string,
        studentName: string,
        roomNumber: string,
        limitCount = 8,
        callback: (feedbacks: Feedback[]) => void,
        onError?: (error: unknown) => void
    ): () => void {
        const normalizedRoom = roomNumber.trim();
        if (!normalizedRoom) {
            callback([]);
            return () => { /* noop */ };
        }

        const cacheKey = getResidentFeedbacksCacheKey(studentId, studentName, normalizedRoom, limitCount);
        hydrateFromCache(cacheKey, CACHE_MAX_AGE_MS.recentFeedbacks, callback);

        const residentFeedbackQuery = query(collection(db, 'feedbacks'), where('roomNumber', '==', normalizedRoom));
        return onSnapshot(residentFeedbackQuery, (snapshot) => {
            const feedbacks = filterFeedbacksForResident(
                snapshot.docs.map((feedbackDoc) => feedbackDoc.data() as Feedback),
                studentId,
                studentName,
                normalizedRoom,
                limitCount
            );
            writeCache(cacheKey, feedbacks);
            callback(feedbacks);
        }, (error) => {
            console.error('Error subscribing to resident feedback:', error);
            onError?.(error);
        });
    },

    async updateFeedbackReply(id: string, text: string, repliedBy = 'Hostel Team') {
        await updateDoc(doc(db, 'feedbacks', id), {
            adminReply: {
                text,
                repliedAt: Date.now(),
                repliedBy
            },
            read: true
        });
        clearCacheByPrefix('feedbacks:');
    },

    async deleteFeedback(id: string) {
        await deleteDoc(doc(db, 'feedbacks', id));
        clearCacheByPrefix('feedbacks:');
    },

    async getBanners(): Promise<Banner[]> {
        return resolveWithCache(cacheKeys.banners, CACHE_MAX_AGE_MS.banners, async () => {
            const snapshot = await getDocs(collection(db, 'banners'));
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

    async addBanner(banner: Banner) {
        await setDoc(doc(db, 'banners', banner.id), banner);
        clearCache(cacheKeys.banners);
    },

    async deleteBanner(id: string) {
        await deleteDoc(doc(db, 'banners', id));
        clearCache(cacheKeys.banners);
    },

    async toggleBannerStatus(id: string, isActive: boolean) {
        await updateDoc(doc(db, 'banners', id), { isActive });
        clearCache(cacheKeys.banners);
    },

    async getVipRecurringRules(): Promise<VipRecurringRule[]> {
        const snapshot = await getDocs(collection(db, VIP_RULES_COL));
        return snapshot.docs
            .map((ruleDoc) => ruleDoc.data() as VipRecurringRule)
            .sort((left, right) => right.createdAt - left.createdAt);
    },

    async addVipRecurringRule(rule: VipRecurringRule) {
        await setDoc(doc(db, VIP_RULES_COL, rule.id), rule);
    },

    async toggleVipRecurringRule(id: string, isActive: boolean) {
        await updateDoc(doc(db, VIP_RULES_COL, id), { isActive });
    },

    async deleteVipRecurringRule(id: string) {
        await deleteDoc(doc(db, VIP_RULES_COL, id));
    },
};
