import type { Banner } from '../types';
import { addBelarusDays, getBelarusDate, getBelarusWeekId, getBelarusWeekStart } from './time';
import { warmBannerImages } from './bannerImages';

const inFlightWarmups = new Map<string, Promise<void>>();

export const warmResidentAppData = (studentId?: string) => {
    const currentWeekStart = getBelarusWeekStart(getBelarusDate());
    const relevantWeekIds = [
        getBelarusWeekId(currentWeekStart),
        getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
    ];
    const warmupKey = `${studentId ?? 'anon'}:${relevantWeekIds.join('|')}`;

    const existingWarmup = inFlightWarmups.get(warmupKey);
    if (existingWarmup) {
        return existingWarmup;
    }

    const warmup = import('../services/firestoreService')
        .then(({ firestoreService }) => {
            const tasks: Promise<unknown>[] = [
                firestoreService.getSettings(),
                firestoreService.getMachines(),
                firestoreService.getBanners(),
                firestoreService.getBookingsForWeekIds(relevantWeekIds),
            ];

            if (studentId) {
                tasks.push(firestoreService.getRecentBookingsForStudent(studentId, 12));
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
