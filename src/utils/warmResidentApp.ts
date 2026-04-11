import type { Banner } from '../types';
import { addBelarusDays, getBelarusDate, getBelarusWeekId, getBelarusWeekStart } from './time';
import { warmBannerImages } from './bannerImages';

const inFlightWarmups = new Map<string, Promise<void>>();

interface WarmResidentAppOptions {
    includeRecentBookings?: boolean;
}

export const warmResidentAppData = (studentId?: string, options: WarmResidentAppOptions = {}) => {
    const { includeRecentBookings = false } = options;
    const currentWeekStart = getBelarusWeekStart(getBelarusDate());
    const relevantWeekIds = [
        getBelarusWeekId(currentWeekStart),
        getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
    ];
    const warmupKey = `${studentId ?? 'anon'}:${includeRecentBookings ? 'history' : 'core'}:${relevantWeekIds.join('|')}`;

    const existingWarmup = inFlightWarmups.get(warmupKey);
    if (existingWarmup) {
        return existingWarmup;
    }

    const warmup = import('../services/residentFirestoreService')
        .then(({ residentFirestoreService }) => {
            const tasks: Promise<unknown>[] = [
                residentFirestoreService.getSettings(),
                residentFirestoreService.getMachines(),
                residentFirestoreService.getBanners(),
                residentFirestoreService.getBookingsForWeekIds(relevantWeekIds),
            ];

            if (studentId && includeRecentBookings) {
                tasks.push(residentFirestoreService.getRecentBookingsForStudent(studentId, 12));
            }

            return Promise.allSettled(tasks).then((results) => {
                const bannersResult = results[2];
                if (bannersResult?.status === 'fulfilled') {
                    warmBannerImages(bannersResult.value as Banner[], 2);
                }
            });
        })
        .then(() => undefined)
        .finally(() => {
            inFlightWarmups.delete(warmupKey);
        });

    inFlightWarmups.set(warmupKey, warmup);
    return warmup;
};
