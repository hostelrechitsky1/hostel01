import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addMinutesToTimeString, formatBelarusDate, getActiveBookingWeekStart, getAutoOpenWindowDisplay, getNextSaturday1600, isAutoBookingWindowOpen } from '../time';

describe('getNextSaturday1600 (Belarus Time UTC+3)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return this Saturday 16:00 if today is Thursday', () => {
        // Thursday, Feb 26, 2026, 12:00:00 UTC -> 15:00:00 Belarus time
        const mockNow = new Date('2026-02-26T12:00:00Z');

        const nextTarget = getNextSaturday1600(mockNow);

        // Expected target: Saturday, Feb 28, 2026, 16:00:00 Belarus time
        // Since Belarus is UTC+3, that is 13:00:00 UTC.
        expect(nextTarget.toISOString()).toBe('2026-02-28T13:00:00.000Z');
    });

    it('should return this Saturday 16:00 if today is Saturday 10:00 AM Belarus time', () => {
        // Saturday, Feb 28, 2026, 07:00:00 UTC -> 10:00:00 Belarus time
        const mockNow = new Date('2026-02-28T07:00:00Z');

        const nextTarget = getNextSaturday1600(mockNow);

        expect(nextTarget.toISOString()).toBe('2026-02-28T13:00:00.000Z');
    });

    it('should return NEXT Saturday 16:00 if today is Saturday 17:00 Belarus time', () => {
        // Saturday, Feb 28, 2026, 14:00:00 UTC -> 17:00:00 Belarus time (Window is open)
        const mockNow = new Date('2026-02-28T14:00:00Z');

        const nextTarget = getNextSaturday1600(mockNow);

        // Next Saturday is March 7, 2026, 16:00 Belarus time (13:00 UTC)
        expect(nextTarget.toISOString()).toBe('2026-03-07T13:00:00.000Z');
    });

    it('should return NEXT Saturday 16:00 if today is Sunday', () => {
        // Sunday, March 1, 2026, 12:00:00 UTC -> 15:00:00 Belarus time
        const mockNow = new Date('2026-03-01T12:00:00Z');

        const nextTarget = getNextSaturday1600(mockNow);

        // Next Saturday is March 7, 2026, 16:00 Belarus time (13:00 UTC)
        expect(nextTarget.toISOString()).toBe('2026-03-07T13:00:00.000Z');
    });

    it('adds minutes to a time string', () => {
        expect(addMinutesToTimeString('21:00', 90)).toBe('22:30');
    });

    it('keeps bookings open during the week even when old settings still say 28 hours', () => {
        const mockNow = new Date('2026-03-03T09:00:00Z'); // Tuesday 12:00 in Belarus

        expect(isAutoBookingWindowOpen(mockNow, {
            autoOpenWeekday: 6,
            autoOpenTime: '16:00',
            autoOpenDurationHours: 28,
        })).toBe(true);
    });

    it('targets the current week before the next Saturday opening', () => {
        const mockNow = new Date('2026-03-03T09:00:00Z'); // Tuesday

        expect(formatBelarusDate(getActiveBookingWeekStart(mockNow, {
            autoOpenWeekday: 6,
            autoOpenTime: '16:00',
            autoOpenDurationHours: 28,
        }))).toBe('2026-03-02');
    });

    it('targets the next week after Saturday 16:00 Belarus time', () => {
        const mockNow = new Date('2026-03-07T14:00:00Z'); // Saturday 17:00 in Belarus

        expect(formatBelarusDate(getActiveBookingWeekStart(mockNow, {
            autoOpenWeekday: 6,
            autoOpenTime: '16:00',
            autoOpenDurationHours: 28,
        }))).toBe('2026-03-09');
    });

    it('displays the weekly opening window as Saturday to Saturday', () => {
        expect(getAutoOpenWindowDisplay({
            autoOpenWeekday: 6,
            autoOpenTime: '16:00',
            autoOpenDurationHours: 28,
        })).toMatchObject({
            openDay: 'Saturday',
            openTime: '16:00',
            closeDay: 'Saturday',
            closeTime: '16:00',
        });
    });
});
