import type { AppSettings, Banner, Booking, Feedback, Machine } from '../types';

const CACHE_PREFIX = 'hostel-cache:v4';

export const CACHE_MAX_AGE_MS = {
    banners: 10 * 60 * 1000,
    bookingsByWeek: 2 * 60 * 1000,
    machines: 5 * 60 * 1000,
    recentFeedbacks: 2 * 60 * 1000,
    recentStudentBookings: 5 * 60 * 1000,
    settings: 10 * 60 * 1000,
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

export const readResidentCache = <T>(key: string, maxAgeMs: number): T | undefined => {
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

export const writeResidentCache = <T>(key: string, value: T, persist = true) => {
    const record: CacheRecord<T> = { savedAt: Date.now(), value };
    runtimeCache.set(key, record as CacheRecord<unknown>);

    if (!persist || !canUseStorage()) return;

    try {
        window.localStorage.setItem(getStorageKey(key), JSON.stringify(record));
    } catch {
        // Keep the in-memory cache if storage writes fail.
    }
};

export const clearResidentCacheByPrefix = (prefix: string) => {
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

export const resolveResidentCache = async <T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> => {
    const cached = readResidentCache<T>(key, maxAgeMs);
    if (cached !== undefined) {
        return cached;
    }

    const value = await load();
    writeResidentCache(key, value);
    return value;
};

export const hydrateResidentCache = <T>(key: string, maxAgeMs: number, callback: (value: T) => void) => {
    const cached = readResidentCache<T>(key, maxAgeMs);
    if (cached !== undefined) {
        callback(cached);
        return true;
    }
    return false;
};

export const sortMachines = (machines: Machine[]) => [...machines].sort((left, right) => left.id.localeCompare(right.id));

export const sortBookingsChronologically = (bookings: Booking[]) => {
    return [...bookings].sort((left, right) => {
        const leftKey = `${left.date}T${left.startTime}`;
        const rightKey = `${right.date}T${right.startTime}`;
        return leftKey.localeCompare(rightKey);
    });
};

export const sortStudentBookingsByRecent = (bookings: Booking[], limitCount?: number) => {
    const sorted = [...bookings].sort((left, right) => right.createdAt - left.createdAt);
    return typeof limitCount === 'number' ? sorted.slice(0, limitCount) : sorted;
};

export const sortFeedbacksByRecent = (feedbacks: Feedback[]) => {
    return [...feedbacks].sort((left, right) => right.timestamp - left.timestamp);
};

const normalizeFeedbackIdentity = (studentId: string, studentName: string, roomNumber: string) => ({
    studentId: studentId.trim(),
    studentName: studentName.trim().toLowerCase(),
    roomNumber: roomNumber.trim().toLowerCase(),
});

export const filterFeedbacksForResident = (
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

const normalizeWeekIds = (weekIds: string[]) => Array.from(new Set(weekIds.filter(Boolean))).sort();

export const getStudentsRoomCacheKey = (roomNumber: string) => `students:room:${roomNumber.trim().toLowerCase()}`;
export const getBookingsByWeeksCacheKey = (weekIds: string[]) => `bookings:weeks:${normalizeWeekIds(weekIds).join('|')}`;
export const getBookingsByDateCacheKey = (date: string) => `bookings:date:${date.trim()}`;
export const getStudentBookingsCacheKey = (studentId: string, limitCount: number) => `bookings:student:${studentId}:recent:${limitCount}`;
export const getResidentFeedbacksCacheKey = (studentId: string, studentName: string, roomNumber: string, limitCount: number) => {
    const identity = normalizeFeedbackIdentity(studentId, studentName, roomNumber);
    return `feedbacks:resident:${identity.studentId || 'legacy'}:${identity.roomNumber}:${identity.studentName}:recent:${limitCount}`;
};

export const residentCacheKeys = {
    banners: 'banners:all',
    machines: 'machines:all',
    settings: 'settings:config',
};

export const normalizeWeekIdsForResidentCache = normalizeWeekIds;

export const getCachedResidentSettings = () => readResidentCache<AppSettings>(residentCacheKeys.settings, CACHE_MAX_AGE_MS.settings);
export const getCachedResidentBanners = () => readResidentCache<Banner[]>(residentCacheKeys.banners, CACHE_MAX_AGE_MS.banners);
export const getCachedResidentMachines = () => readResidentCache<Machine[]>(residentCacheKeys.machines, CACHE_MAX_AGE_MS.machines);
