import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '../../types';

const mocks = vi.hoisted(() => ({ runTransaction: vi.fn() }));
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}`, id }),
    runTransaction: mocks.runTransaction,
    collection: vi.fn(), deleteDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), limit: vi.fn(),
    onSnapshot: vi.fn(), orderBy: vi.fn(), query: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), where: vi.fn(), writeBatch: vi.fn(),
}));
import { firestoreService } from '../firestoreService';

const rule = { id: 'rule', studentId: 'student', machineId: 'machine', weekday: 6, startTime: '21:00', isActive: true, createdAt: 1 };
const booking: Booking = {
    id: '2026-10-31_machine_21-00', date: '2026-10-31', startTime: '21:00', endTime: '22:30',
    machineId: 'machine', studentId: 'student', weekId: '2026-W44', createdAt: new Date('2026-10-24T12:59:00Z').getTime(),
};
const old: Booking = { ...booking, id: '2026-10-31_machine_19-30', startTime: '19:30', endTime: '21:00' };
let data: Map<string, Record<string, unknown>>;
let failCommit: boolean;
let writes: string[];

beforeEach(() => {
    vi.clearAllMocks();
    failCommit = false;
    writes = [];
    data = new Map<string, Record<string, unknown>>([
        ['vipRecurringRules/rule', { ...rule }],
        [`bookings/${old.id}`, { ...old }],
        ['bookingLimits/student_2026-W44', { studentId: 'student', weekId: '2026-W44', bookingId: old.id }],
    ]);
    mocks.runTransaction.mockImplementation(async (_db, action) => {
        const changes: Array<() => void> = [];
        const result = await action({
            get: async (ref: { path: string; id: string }) => {
                expect(changes).toHaveLength(0); // Firestore requires every read before every write.
                return { id: ref.id, ref, exists: () => data.has(ref.path), data: () => data.get(ref.path) };
            },
            delete: (ref: { path: string }) => { writes.push(ref.path); changes.push(() => { data.delete(ref.path); }); },
            set: (ref: { path: string }, value: Record<string, unknown>) => { writes.push(ref.path); changes.push(() => { data.set(ref.path, value); }); },
        });
        if (failCommit) throw new Error('transaction failed');
        changes.forEach((apply) => apply());
        return result;
    });
});

describe('manager VIP transaction', () => {
    it('moves a booking and weekly limit in one transaction', async () => {
        expect(await firestoreService.reserveVipBooking(booking, [old], rule)).toEqual({ overridden: 1 });
        expect(data.has(`bookings/${old.id}`)).toBe(false);
        expect(data.get(`bookings/${booking.id}`)).toEqual(booking);
        expect(data.get('bookingLimits/student_2026-W44')?.bookingId).toBe(booking.id);
        expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
    });
    it('retains the old booking and limit when the replacement transaction fails', async () => {
        failCommit = true;
        await expect(firestoreService.reserveVipBooking(booking, [old], rule)).rejects.toThrow('transaction failed');
        expect(data.get(`bookings/${old.id}`)).toEqual(old);
        expect(data.has(`bookings/${booking.id}`)).toBe(false);
        expect(data.get('bookingLimits/student_2026-W44')?.bookingId).toBe(old.id);
    });
    it('does not delete a booking taken by another resident since the earlier query', async () => {
        data.set(`bookings/${old.id}`, { ...old, studentId: 'new-owner' });
        await firestoreService.reserveVipBooking(booking, [old], rule);
        expect(data.get(`bookings/${old.id}`)?.studentId).toBe('new-owner');
        expect(writes).not.toContain(`bookings/${old.id}`);
    });
    it('repairs the weekly limit even when a booking already belongs to the VIP', async () => {
        data.clear();
        data.set('vipRecurringRules/rule', { ...rule });
        data.set(`bookings/${booking.id}`, { ...booking });
        await firestoreService.reserveVipBooking(booking, [booking], rule);
        expect(data.get('bookingLimits/student_2026-W44')?.bookingId).toBe(booking.id);
    });
    it('refuses to apply an outdated rule after a manager edit', async () => {
        data.set('vipRecurringRules/rule', { ...rule, startTime: '18:00' });
        await expect(firestoreService.reserveVipBooking(booking, [old], rule)).rejects.toThrow('VIP rule changed');
        expect(data.get(`bookings/${old.id}`)).toEqual(old);
        expect(writes).toHaveLength(0);
    });
});
