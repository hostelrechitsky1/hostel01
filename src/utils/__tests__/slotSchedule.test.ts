import { describe, expect, it } from 'vitest';
import type { Booking } from '../../types';
import {
    buildTimeSlots,
    formatSlotDurationLabel,
    getBookingEndTime,
    normalizeSlotDurationMinutes,
} from '../slotSchedule';

const booking = (endTime?: string): Booking => ({
    id: 'booking-1',
    machineId: 'machine-1',
    studentId: 'student-1',
    date: '2026-05-05',
    startTime: '09:00',
    endTime: endTime ?? '10:30',
    weekId: '2026-W19',
    createdAt: 1,
});

describe('slotSchedule', () => {
    it('keeps the default 90 minute grid unchanged', () => {
        expect(buildTimeSlots(90)).toEqual([
            '09:00',
            '10:30',
            '12:00',
            '13:30',
            '15:00',
            '16:30',
            '18:00',
            '19:30',
            '21:00',
        ]);
    });

    it('generates more slot starts for a 1 hour duration', () => {
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

    it('normalizes custom durations to safe five-minute increments', () => {
        expect(normalizeSlotDurationMinutes(62)).toBe(60);
        expect(normalizeSlotDurationMinutes(17)).toBe(30);
        expect(normalizeSlotDurationMinutes(999)).toBe(240);
    });

    it('formats labels for admin controls', () => {
        expect(formatSlotDurationLabel(60)).toBe('1h');
        expect(formatSlotDurationLabel(90)).toBe('1h 30m');
    });

    it('prefers stored booking end times for existing bookings', () => {
        expect(getBookingEndTime(booking('10:15'), 60)).toBe('10:15');
        expect(getBookingEndTime(booking(''), 60)).toBe('10:00');
    });
});
