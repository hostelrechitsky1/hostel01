import { describe, expect, it } from 'vitest';
import { TIME_SLOTS } from '../../types';
import {
    buildTimeSlots,
    formatSlotDurationLabel,
    getBookingEndTime,
    normalizeSlotDurationMinutes,
} from '../slotSchedule';

describe('slotSchedule', () => {
    it('keeps the production 90 minute schedule by default', () => {
        expect(buildTimeSlots()).toEqual([...TIME_SLOTS]);
    });

    it('generates one hour slots through the configured day window', () => {
        expect(buildTimeSlots(60)).toEqual([
            '09:00',
            '10:00',
            '11:00',
            '12:00',
            '13:00',
            '14:00',
            '15:00',
            '16:00',
            '17:00',
            '18:00',
            '19:00',
            '20:00',
            '21:00',
        ]);
    });

    it('normalizes custom durations to safe five minute steps', () => {
        expect(normalizeSlotDurationMinutes('62')).toBe(60);
        expect(normalizeSlotDurationMinutes(12)).toBe(30);
        expect(normalizeSlotDurationMinutes(999)).toBe(240);
    });

    it('formats admin duration labels', () => {
        expect(formatSlotDurationLabel(45)).toBe('45m');
        expect(formatSlotDurationLabel(60)).toBe('1h');
        expect(formatSlotDurationLabel(90)).toBe('1h 30m');
    });

    it('uses explicit booking end time before falling back to current duration', () => {
        expect(getBookingEndTime({ startTime: '18:00', endTime: '19:30' }, 60)).toBe('19:30');
        expect(getBookingEndTime({ startTime: '18:00', endTime: '' }, 60)).toBe('19:00');
    });
});
