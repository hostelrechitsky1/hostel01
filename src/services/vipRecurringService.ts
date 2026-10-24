import { getVipWeeks, reconcileVipBookings } from '../../shared/vip-recurring.js';
import { firestoreService } from './firestoreService';

export const syncVipRecurringBookings = async (options: { manual?: boolean; now?: Date } = {}) => {
    const now = options.now ?? new Date();
    const settings = await firestoreService.getSettings({ fresh: true });
    const weeks = getVipWeeks(now);
    if (!options.manual && settings.vipAutoEnabled === false) return null;
    const [rules, students, machines, bookings] = await Promise.all([
        firestoreService.getVipRecurringRules(),
        firestoreService.getAllStudents(),
        firestoreService.getMachines(),
        firestoreService.getBookingsForWeekIds(weeks.map((week) => week.weekId), { fresh: true }),
    ]);
    const result = await reconcileVipBookings({
        now, settings, rules, students, machines, bookings,
        reserve: (booking, previous, rule) => firestoreService.reserveVipBooking(booking, previous, rule),
    });
    if (result.applied && settings.vipLastAppliedWeekId !== result.nextWeekId) {
        await firestoreService.updateSettings({ vipLastAppliedWeekId: result.nextWeekId });
    }
    return result;
};
