import type { AppSettings, Banner, Booking, Machine } from '../types';
import { DEFAULT_APP_SETTINGS, residentFirestoreService } from './residentFirestoreService';
import { normalizeWeekIdsForResidentCache } from './residentCache';

type ResidentCoreSnapshot = {
    settings: AppSettings;
    machines: Machine[];
    weekBookings: Booking[];
    banners?: Banner[];
    recentBookings?: Booking[];
};

const inFlightResidentSnapshots = new Map<string, Promise<ResidentCoreSnapshot>>();

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
        normalizedWeekIds.join('|'),
        includeBanners ? 'banners' : 'no-banners',
        includeRecentBookings ? `recent:${studentId ?? 'anon'}` : 'no-recent',
    ].join('::');
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
    const snapshotKey = buildSnapshotKey({ weekIds: normalizedWeekIds, includeBanners, includeRecentBookings, studentId });
    const existingSnapshot = inFlightResidentSnapshots.get(snapshotKey);
    if (existingSnapshot) {
        return existingSnapshot;
    }

    const snapshotTasks = [
        residentFirestoreService.getSettings(),
        residentFirestoreService.getMachines(),
        residentFirestoreService.getBookingsForWeekIds(normalizedWeekIds),
        includeBanners ? residentFirestoreService.getBanners() : Promise.resolve([] as Banner[]),
        includeRecentBookings && studentId
            ? residentFirestoreService.getRecentBookingsForStudent(studentId, 12)
            : Promise.resolve([] as Booking[]),
    ] as const;

    const snapshotPromise = Promise.allSettled(snapshotTasks).then(([settingsResult, machinesResult, bookingsResult, bannersResult, recentBookingsResult]) => {
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

        return {
            settings,
            machines,
            weekBookings,
            banners,
            recentBookings,
        };
    }).finally(() => {
        inFlightResidentSnapshots.delete(snapshotKey);
    });

    inFlightResidentSnapshots.set(snapshotKey, snapshotPromise);
    return snapshotPromise;
};

export const residentSnapshotService = {
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
