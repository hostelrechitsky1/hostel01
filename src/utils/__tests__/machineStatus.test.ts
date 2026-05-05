import { describe, expect, it } from 'vitest';
import type { Booking, Machine } from '../../types';
import { getMachineOperatingState } from '../machineStatus';

const machine: Machine = { id: '1', name: 'Machine 1', status: 'available' };

const createBooking = (overrides: Partial<Booking>): Booking => ({
    id: 'booking-1',
    machineId: '1',
    studentId: 'student-1',
    date: '2026-05-05',
    startTime: '21:00',
    endTime: '22:30',
    weekId: '2026-W19',
    createdAt: 0,
    ...overrides,
});

describe('getMachineOperatingState', () => {
    it('marks a machine closed after the last bookable slot start in Belarus time', () => {
        expect(getMachineOperatingState({
            machine,
            bookings: [],
            maintenanceDay: 3,
            now: new Date('2026-05-05T20:45:00.000Z'), // 23:45 Belarus time
        })).toBe('closed');
    });

    it('keeps a 21:00 booking occupied until the wash finishes', () => {
        expect(getMachineOperatingState({
            machine,
            bookings: [createBooking({})],
            maintenanceDay: 3,
            now: new Date('2026-05-05T18:30:00.000Z'), // 21:30 Belarus time
        })).toBe('occupied');
    });

    it('marks a machine available during bookable hours when it has no active booking', () => {
        expect(getMachineOperatingState({
            machine,
            bookings: [],
            maintenanceDay: 3,
            now: new Date('2026-05-05T12:00:00.000Z'), // 15:00 Belarus time
        })).toBe('available');
    });
});
