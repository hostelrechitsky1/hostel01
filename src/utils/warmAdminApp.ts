const inFlightAdminWarmups = new Map<string, Promise<void>>();

type AdminWarmMode = 'manager' | 'staff';

export const warmAdminAppData = (mode: AdminWarmMode = 'manager') => {
    const existingWarmup = inFlightAdminWarmups.get(mode);
    if (existingWarmup) {
        return existingWarmup;
    }

    const warmup = import('../services/firestoreService')
        .then(({ firestoreService }) => {
            const tasks: Promise<unknown>[] = [
                firestoreService.getSettings(),
                firestoreService.getMachines(),
                firestoreService.getAllStudents(),
                firestoreService.getBanners(),
            ];

            if (mode === 'manager') {
                tasks.push(
                    firestoreService.getRecentAdminBookings(80),
                    firestoreService.getFeedbacks(40)
                );
            }

            return Promise.allSettled(tasks);
        })
        .then(() => undefined)
        .finally(() => {
            inFlightAdminWarmups.delete(mode);
        });

    inFlightAdminWarmups.set(mode, warmup);
    return warmup;
};
