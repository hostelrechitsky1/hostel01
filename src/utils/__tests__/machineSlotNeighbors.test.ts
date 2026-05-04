import { describe, expect, it } from 'vitest';
import type { Booking } from '../../types';
import { SLOT_DURATION_MINUTES, TIME_SLOTS } from '../../types';
import { getMachineSlotNeighbors, getThreeSlotIndicesAroundNow } from '../machineSlotNeighbors';

const slots = TIME_SLOTS;

describe('getThreeSlotIndicesAroundNow', () => {
    it('returns adjacent indices when now is inside the middle slot', () => {
        const inside = 11 * 60;
        const r = getThreeSlotIndicesAroundNow(inside, slots, SLOT_DURATION_MINUTES);
        expect(r).toEqual({ before: 0, current: 1, after: 2 });
    });

    it('first slot of day: no before', () => {
        const start = 9 * 60;
        const inside = start + 10;
        const r = getThreeSlotIndicesAroundNow(inside, slots, SLOT_DURATION_MINUTES);
        expect(r.before).toBeNull();
        expect(r.current).toBe(0);
        expect(r.after).toBe(1);
    });

    it('last slot: no after', () => {
        const lastStart = 21 * 60;
        const inside = lastStart + 30;
        const r = getThreeSlotIndicesAroundNow(inside, slots, SLOT_DURATION_MINUTES);
        expect(r.current).toBe(slots.length - 1);
        expect(r.after).toBeNull();
    });

    it('before first slot: centers on first two slots', () => {
        const r = getThreeSlotIndicesAroundNow(7 * 60, slots, SLOT_DURATION_MINUTES);
        expect(r).toEqual({ before: null, current: 0, after: 1 });
    });

    it('after last slot end: centers on last slot', () => {
        const lastStart = 21 * 60;
        const afterDay = lastStart + SLOT_DURATION_MINUTES + 1;
        const r = getThreeSlotIndicesAroundNow(afterDay, slots, SLOT_DURATION_MINUTES);
        expect(r.current).toBe(slots.length - 1);
        expect(r.after).toBeNull();
    });
});

describe('getMachineSlotNeighbors', () => {
    const baseBooking = (o: Partial<Booking>): Booking => ({
        id: '1',
        machineId: 'm1',
        studentId: 's1',
        date: '2026-05-05',
        startTime: o.startTime ?? '09:00',
        endTime: o.endTime ?? '10:30',
        weekId: '2026-W19',
        studentName: o.studentName ?? 'A',
        roomNumber: o.roomNumber ?? '101',
        createdAt: 1,
    });

    it('maps bookings to before/current/after for a machine', () => {
        const nowMinutes = 10 * 60 + 45;
        const list: Booking[] = [
            baseBooking({ startTime: '09:00', studentName: 'Early', roomNumber: '1' }),
            baseBooking({ startTime: '10:30', studentName: 'Mid', roomNumber: '2' }),
            baseBooking({ startTime: '12:00', studentName: 'Late', roomNumber: '3' }),
        ];
        const n = getMachineSlotNeighbors({
            bookingsForDate: list,
            machineId: 'm1',
            nowMinutes,
        });
        expect(n.before?.booking?.studentName).toBe('Early');
        expect(n.current.booking?.studentName).toBe('Mid');
        expect(n.after?.booking?.studentName).toBe('Late');
    });

    it('returns null booking for free slots', () => {
        const n = getMachineSlotNeighbors({
            bookingsForDate: [],
            machineId: 'm1',
            nowMinutes: 10 * 60 + 45,
        });
        expect(n.current.booking).toBeNull();
    });
});
