import type { Banner } from '../types';
import { addBelarusDays, getBelarusDate, getBelarusWeekId, getBelarusWeekStart } from './time';
import { warmBannerImages } from './bannerImages';

const inFlightWarmups = new Map<string, Promise<void>>();

interface WarmResidentAppOptions {
    includeRecentBookings?: boolean;
    roomNumber?: string;
}

export const warmResidentAppData = (studentId?: string, options: WarmResidentAppOptions = {}) => {
    const { includeRecentBookings = Boolean(studentId), roomNumber } = options;
    const currentWeekStart = getBelarusWeekStart(getBelarusDate());
    const relevantWeekIds = [
        getBelarusWeekId(currentWeekStart),
        getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
    ];
    const normalizedRoom = roomNumber?.trim().toLowerCase() ?? 'no-room';
    const warmupKey = `${studentId ?? 'anon'}:${normalizedRoom}:${includeRecentBookings ? 'history' : 'core'}:${relevantWeekIds.join('|')}`;

    const existingWarmup = inFlightWarmups.get(warmupKey);
    if (existingWarmup) {
        return existingWarmup;
    }

    const warmup = Promise.allSettled([
        import('../services/residentSnapshotService')
                    .then(({ residentSnapshotService }) => {
                        return residentSnapshotService.getWarmSnapshot(relevantWeekIds, studentId, includeRecentBookings)
                            .then((snapshot) => {
                        return warmBannerImages((snapshot.banners ?? []) as Banner[], 1);
                    });
            }),
        roomNumber
            ? import('../services/residentRoomLookupService')
                .then(({ residentRoomLookupService }) => residentRoomLookupService.getStudentsByRoom(roomNumber))
            : Promise.resolve([]),
    ])
        .then(() => undefined)
        .finally(() => {
            inFlightWarmups.delete(warmupKey);
        });

    inFlightWarmups.set(warmupKey, warmup);
    return warmup;
};
