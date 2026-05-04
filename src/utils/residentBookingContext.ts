import type { AppSettings } from '../types';
import {
    addBelarusDays,
    formatBelarusDate,
    getBelarusDate,
    getBelarusWeekEnd,
    getBelarusWeekId,
    getBelarusWeekStart,
    isAutoBookingWindowOpen,
} from './time';

/** Full URL string for QR codes and deep links (include origin). */
export function buildMachineBookUrl(
    origin: string,
    options?: { machineId?: string; qr?: boolean },
): string {
    const base = origin.replace(/\/$/, '');
    const url = new URL('book', `${base}/`);
    if (options?.qr) {
        url.searchParams.set('qr', '1');
    }
    if (options?.machineId) {
        url.searchParams.set('machine', options.machineId);
    }
    return url.href;
}

export type ResidentBookingWeekContext = {
    /** Monday-start week that the resident books into (current Belarus week). */
    weekStart: Date;
    weekEnd: Date;
    targetWeekId: string;
    /** First selectable day in the booking strip (today, floored to week start if today is before Monday — impossible for Belarus weekStart Monday; today through Sunday). */
    dateStripStart: Date;
    dateStripEnd: Date;
    /** True when the legacy Saturday-style window is open (informational; booking no longer gated on this). */
    isLegacyAutoWindowOpen: boolean;
    forceCloseBookings: boolean;
};

/**
 * Single source for "which week" residents book and which dates appear in the strip (today → end of current Belarus week).
 */
export function getResidentBookingWeekContext(
    now: Date,
    settings: AppSettings,
): ResidentBookingWeekContext {
    const today = getBelarusDate(now);
    const weekStart = getBelarusWeekStart(today);
    const weekEnd = getBelarusWeekEnd(today);
    const targetWeekId = getBelarusWeekId(weekStart);

    const stripStart = today.getTime() < weekStart.getTime() ? weekStart : today;
    const dateStripStart = stripStart;
    const dateStripEnd = weekEnd;

    return {
        weekStart,
        weekEnd,
        targetWeekId,
        dateStripStart,
        dateStripEnd,
        isLegacyAutoWindowOpen: isAutoBookingWindowOpen(now, settings),
        forceCloseBookings: settings.forceCloseBookings,
    };
}

/** Enumerate each calendar day from strip start through strip end (inclusive). */
export function enumerateBookingStripDates(ctx: ResidentBookingWeekContext): Date[] {
    const dates: Date[] = [];
    let d = ctx.dateStripStart;
    const endKey = formatBelarusDate(ctx.dateStripEnd);
    while (formatBelarusDate(d) <= endKey) {
        dates.push(d);
        d = addBelarusDays(d, 1);
    }
    return dates;
}
