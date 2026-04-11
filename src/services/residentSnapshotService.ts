import type { AppSettings, Banner, Booking, Machine } from '../types';
import { DEFAULT_APP_SETTINGS, residentFirestoreService } from './residentFirestoreService';
import {
    getBookingsByDateCacheKey,
    CACHE_MAX_AGE_MS,
    getBookingsByWeeksCacheKey,
    getStudentBookingsCacheKey,
    normalizeWeekIdsForResidentCache,
    readResidentCache,
    residentCacheKeys,
    writeResidentCache,
} from './residentCache';
import { residentBootstrapService } from './residentBootstrapService';

export type ResidentCoreSnapshot = {
    settings: AppSettings;
    machines: Machine[];
    weekBookings: Booking[];
    banners?: Banner[];
    recentBookings?: Booking[];
};

const inFlightResidentSnapshots = new Map<string, Promise<ResidentCoreSnapshot>>();
const RESIDENT_SNAPSHOT_CACHE_PREFIX = 'resident:snapshot';

const getResidentSnapshotMaxAge = (includeBanners: boolean, includeRecentBookings: boolean) => {
    const cacheCandidates = [
        CACHE_MAX_AGE_MS.settings,
        CACHE_MAX_AGE_MS.machines,
        CACHE_MAX_AGE_MS.bookingsByWeek,
    ];

    if (includeBanners) {
        cacheCandidates.push(CACHE_MAX_AGE_MS.banners);
    }

    if (includeRecentBookings) {
        cacheCandidates.push(CACHE_MAX_AGE_MS.recentStudentBookings);
    }

    return Math.min(...cacheCandidates);
};

const buildSnapshotKey = ({
    weekIds,
    includeBanners,
    includeRecentBookings,
    studentId,
}: {
    weekIds: string[];
    includeBanners: boolean;
    includeRecentBookings: boolean;
    studentId?: string;
}) => {
    const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
    return [
        RESIDENT_SNAPSHOT_CACHE_PREFIX,
        normalizedWeekIds.join('|'),
        includeBanners ? 'banners' : 'no-banners',
        includeRecentBookings ? `recent:${studentId ?? 'anon'}` : 'no-recent',
    ].join('::');
};

const buildCachedResidentSnapshot = ({
    weekIds,
    includeBanners,
    includeRecentBookings,
    studentId,
}: {
    weekIds: string[];
    includeBanners: boolean;
    includeRecentBookings: boolean;
    studentId?: string;
}): ResidentCoreSnapshot | undefined => {
    const settings = residentFirestoreService.getCachedSettings();
    const machines = residentFirestoreService.getCachedMachines();
    const weekBookings = residentFirestoreService.getCachedBookingsForWeekIds(weekIds);

    if (!settings || !machines || !weekBookings) {
        return undefined;
    }

    const snapshot: ResidentCoreSnapshot = {
        settings,
        machines,
        weekBookings,
    };

    if (includeBanners) {
        const cachedBanners = residentFirestoreService.getCachedBanners();
        if (cachedBanners === undefined) {
            return undefined;
        }

        snapshot.banners = cachedBanners;
    }

    if (includeRecentBookings && studentId) {
        const cachedRecentBookings = residentFirestoreService.getCachedRecentBookingsForStudent(studentId, 12);
        if (cachedRecentBookings === undefined) {
            return undefined;
        }

        snapshot.recentBookings = cachedRecentBookings;
    }

    return snapshot;
};

const getCachedResidentSnapshot = ({
    weekIds,
    includeBanners,
    includeRecentBookings,
    studentId,
}: {
    weekIds: string[];
    includeBanners: boolean;
    includeRecentBookings: boolean;
    studentId?: string;
}) => {
    const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
    if (normalizedWeekIds.length === 0) {
        return undefined;
    }

    const cacheKey = buildSnapshotKey({
        weekIds: normalizedWeekIds,
        includeBanners,
        includeRecentBookings,
        studentId,
    });
    const maxAgeMs = getResidentSnapshotMaxAge(includeBanners, includeRecentBookings);
    const cachedSnapshot = readResidentCache<ResidentCoreSnapshot>(cacheKey, maxAgeMs);
    if (cachedSnapshot) {
        return cachedSnapshot;
    }

    const derivedSnapshot = buildCachedResidentSnapshot({
        weekIds: normalizedWeekIds,
        includeBanners,
        includeRecentBookings,
        studentId,
    });

    if (derivedSnapshot) {
        writeResidentCache(cacheKey, derivedSnapshot);
    }

    return derivedSnapshot;
};

const persistResidentSnapshot = ({
    weekIds,
    includeBanners,
    includeRecentBookings,
    studentId,
    snapshot,
}: {
    weekIds: string[];
    includeBanners: boolean;
    includeRecentBookings: boolean;
    studentId?: string;
    snapshot: ResidentCoreSnapshot;
}) => {
    const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
    if (normalizedWeekIds.length === 0) {
        return;
    }

    writeResidentCache(
        buildSnapshotKey({
            weekIds: normalizedWeekIds,
            includeBanners,
            includeRecentBookings,
            studentId,
        }),
        snapshot
    );

    writeResidentCache(residentCacheKeys.settings, snapshot.settings);
    writeResidentCache(residentCacheKeys.machines, snapshot.machines);
    writeResidentCache(getBookingsByWeeksCacheKey(normalizedWeekIds), snapshot.weekBookings);
    const bookingsByDate = snapshot.weekBookings.reduce<Record<string, Booking[]>>((accumulator, booking) => {
        if (!accumulator[booking.date]) {
            accumulator[booking.date] = [];
        }

        accumulator[booking.date].push(booking);
        return accumulator;
    }, {});

    Object.entries(bookingsByDate).forEach(([date, dateBookings]) => {
        writeResidentCache(getBookingsByDateCacheKey(date), dateBookings);
    });

    if (includeBanners && snapshot.banners) {
        writeResidentCache(residentCacheKeys.banners, snapshot.banners);
    }

    if (includeRecentBookings && studentId && snapshot.recentBookings) {
        writeResidentCache(getStudentBookingsCacheKey(studentId, 12), snapshot.recentBookings);
    }
};

const resolveRequiredSnapshotValue = <T>(
    result: PromiseSettledResult<T>,
    fallbackValue: T | undefined,
    label: string
) => {
    if (result.status === 'fulfilled') {
        return result.value;
    }

    if (typeof fallbackValue !== 'undefined') {
        return fallbackValue;
    }

    throw result.reason instanceof Error ? result.reason : new Error(`Failed to load ${label}`);
};

const resolveOptionalSnapshotValue = <T>(
    result: PromiseSettledResult<T>,
    fallbackValue: T
) => {
    if (result.status === 'fulfilled') {
        return result.value;
    }

    return fallbackValue;
};

const getResidentCoreSnapshot = async ({
    weekIds,
    includeBanners = false,
    includeRecentBookings = false,
    studentId,
}: {
    weekIds: string[];
    includeBanners?: boolean;
    includeRecentBookings?: boolean;
    studentId?: string;
}): Promise<ResidentCoreSnapshot> => {
    const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
    const cachedSnapshot = getCachedResidentSnapshot({
        weekIds: normalizedWeekIds,
        includeBanners,
        includeRecentBookings,
        studentId,
    });
    if (cachedSnapshot) {
        return cachedSnapshot;
    }

    const snapshotKey = buildSnapshotKey({ weekIds: normalizedWeekIds, includeBanners, includeRecentBookings, studentId });
    const existingSnapshot = inFlightResidentSnapshots.get(snapshotKey);
    if (existingSnapshot) {
        return existingSnapshot;
    }

    const bootstrapSnapshotPromise = residentBootstrapService.getSnapshot({
        weekIds: normalizedWeekIds,
        studentId,
        includeBanners,
        includeRecentBookings,
    }).then((snapshot) => {
        persistResidentSnapshot({
            weekIds: normalizedWeekIds,
            includeBanners,
            includeRecentBookings,
            studentId,
            snapshot,
        });

        return snapshot;
    });

    const snapshotTasks = [
        residentFirestoreService.getSettings(),
        residentFirestoreService.getMachines(),
        residentFirestoreService.getBookingsForWeekIds(normalizedWeekIds),
        includeBanners ? residentFirestoreService.getBanners() : Promise.resolve([] as Banner[]),
        includeRecentBookings && studentId
            ? residentFirestoreService.getRecentBookingsForStudent(studentId, 12)
            : Promise.resolve([] as Booking[]),
    ] as const;

    const fallbackSnapshotPromise = Promise.allSettled(snapshotTasks).then(([settingsResult, machinesResult, bookingsResult, bannersResult, recentBookingsResult]) => {
        const settings = resolveRequiredSnapshotValue(
            settingsResult,
            residentFirestoreService.getCachedSettings() ?? DEFAULT_APP_SETTINGS,
            'resident settings'
        );
        const machines = resolveRequiredSnapshotValue(
            machinesResult,
            residentFirestoreService.getCachedMachines(),
            'resident machines'
        );
        const weekBookings = resolveRequiredSnapshotValue(
            bookingsResult,
            residentFirestoreService.getCachedBookingsForWeekIds(normalizedWeekIds),
            'resident week bookings'
        );
        const banners = includeBanners
            ? resolveOptionalSnapshotValue(
                bannersResult,
                residentFirestoreService.getCachedBanners() ?? []
            )
            : undefined;
        const recentBookings = includeRecentBookings && studentId
            ? resolveOptionalSnapshotValue(
                recentBookingsResult,
                residentFirestoreService.getCachedRecentBookingsForStudent(studentId, 12) ?? []
            )
            : undefined;

        const snapshot: ResidentCoreSnapshot = {
            settings,
            machines,
            weekBookings,
            banners,
            recentBookings,
        };

        persistResidentSnapshot({
            weekIds: normalizedWeekIds,
            includeBanners,
            includeRecentBookings,
            studentId,
            snapshot,
        });

        return snapshot;
    });

    const snapshotPromise = bootstrapSnapshotPromise
        .catch((error) => {
            console.warn('Resident bootstrap API fetch failed, falling back to client snapshot loaders.', error);
            return fallbackSnapshotPromise;
        })
        .finally(() => {
        inFlightResidentSnapshots.delete(snapshotKey);
    });

    inFlightResidentSnapshots.set(snapshotKey, snapshotPromise);
    return snapshotPromise;
};

export const residentSnapshotService = {
    getCachedDashboardSnapshot(weekIds: string[]) {
        return getCachedResidentSnapshot({
            weekIds,
            includeBanners: true,
            includeRecentBookings: false,
        });
    },

    getCachedBookingSnapshot(weekIds: string[]) {
        return getCachedResidentSnapshot({
            weekIds,
            includeBanners: false,
            includeRecentBookings: false,
        });
    },

    getCachedWarmSnapshot(weekIds: string[], studentId?: string, includeRecentBookings = false) {
        return getCachedResidentSnapshot({
            weekIds,
            includeBanners: true,
            includeRecentBookings,
            studentId,
        });
    },

    getDashboardSnapshot(weekIds: string[]) {
        return getResidentCoreSnapshot({
            weekIds,
            includeBanners: true,
        });
    },

    getBookingSnapshot(weekIds: string[]) {
        return getResidentCoreSnapshot({
            weekIds,
            includeBanners: false,
        });
    },

    getWarmSnapshot(weekIds: string[], studentId?: string, includeRecentBookings = false) {
        return getResidentCoreSnapshot({
            weekIds,
            includeBanners: true,
            includeRecentBookings,
            studentId,
        });
    },
};
