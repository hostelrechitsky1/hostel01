import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addMinutesToTimeString, getNextSaturday1600 } from '../time';

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
});
