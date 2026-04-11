import type { AppSettings, Banner, Booking, Machine } from '../types';
import { normalizeBannerRecord } from '../utils/bannerImages';
import {
    normalizeWeekIdsForResidentCache,
    sortBookingsChronologically,
    sortMachines,
    sortStudentBookingsByRecent,
} from './residentCache';

export interface ResidentBootstrapSnapshot {
    settings: AppSettings;
    machines: Machine[];
    weekBookings: Booking[];
    banners?: Banner[];
    recentBookings?: Booking[];
}

const sortBanners = (banners: Banner[]) => (
    [...banners].sort((left, right) => (left.priority || 99) - (right.priority || 99))
);

const normalizeResidentBootstrapSnapshot = (payload: Partial<ResidentBootstrapSnapshot>, options: {
    includeBanners: boolean;
    includeRecentBookings: boolean;
}) => {
    const snapshot: ResidentBootstrapSnapshot = {
        settings: payload.settings as AppSettings,
        machines: sortMachines((payload.machines ?? []) as Machine[]),
        weekBookings: sortBookingsChronologically((payload.weekBookings ?? []) as Booking[]),
    };

    if (options.includeBanners) {
        snapshot.banners = sortBanners(
            ((payload.banners ?? []) as Banner[]).map((banner) => normalizeBannerRecord(banner))
        );
    }

    if (options.includeRecentBookings) {
        snapshot.recentBookings = sortStudentBookingsByRecent((payload.recentBookings ?? []) as Booking[], 12);
    }

    return snapshot;
};

export const residentBootstrapService = {
    async getSnapshot({
        weekIds,
        studentId,
        includeBanners = false,
        includeRecentBookings = false,
    }: {
        weekIds: string[];
        studentId?: string;
        includeBanners?: boolean;
        includeRecentBookings?: boolean;
    }): Promise<ResidentBootstrapSnapshot> {
        if (typeof window === 'undefined') {
            throw new Error('Resident bootstrap API is only available in the browser');
        }

        const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
        if (normalizedWeekIds.length === 0) {
            throw new Error('Resident bootstrap request requires at least one week id');
        }

        const params = new URLSearchParams();
        params.set('weeks', normalizedWeekIds.join(','));

        if (includeBanners) {
            params.set('includeBanners', '1');
        }

        if (includeRecentBookings && studentId) {
            params.set('includeRecentBookings', '1');
            params.set('studentId', studentId);
        }

        const response = await fetch(`/.netlify/functions/resident-bootstrap?${params.toString()}`, {
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Resident bootstrap request failed with ${response.status}`);
        }

        const payload = await response.json() as Partial<ResidentBootstrapSnapshot>;
        return normalizeResidentBootstrapSnapshot(payload, {
            includeBanners,
            includeRecentBookings: includeRecentBookings && Boolean(studentId),
        });
    },
};
