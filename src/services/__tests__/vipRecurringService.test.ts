import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getSettings: vi.fn(), getVipRecurringRules: vi.fn(), getAllStudents: vi.fn(),
    getMachines: vi.fn(), getBookingsForWeekIds: vi.fn(), reserveVipBooking: vi.fn(), updateSettings: vi.fn(),
}));
vi.mock('../firestoreService', () => ({ firestoreService: mocks }));
import { syncVipRecurringBookings } from '../vipRecurringService';
import { getVipRuleDate, getVipRuleProblem, getVipWeeks } from '../../../shared/vip-recurring.js';

const settings = {
    forceShowNextWeek: false, forceCloseBookings: false, maintenanceDay: 3,
    autoOpenWeekday: 6, autoOpenTime: '16:00', autoOpenDurationHours: 168,
    slotDurationMinutes: 90, vipAutoEnabled: true, vipLastAppliedWeekId: '2026-W44',
};
const rule = { id: 'rule', studentId: 'student', machineId: 'machine', weekday: 6, startTime: '21:00', isActive: true, createdAt: 1 };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue(settings);
    mocks.getVipRecurringRules.mockResolvedValue([rule]);
    mocks.getAllStudents.mockResolvedValue([{ id: 'student', name: 'VIP', roomNumber: '1' }]);
    mocks.getMachines.mockResolvedValue([{ id: 'machine', name: 'Machine', status: 'available' }]);
    mocks.getBookingsForWeekIds.mockResolvedValue([]);
    mocks.reserveVipBooking.mockResolvedValue({ overridden: 0 });
});

describe('manager VIP sync', () => {
    it('fetches fresh settings and bookings and verifies rules even when the week was already applied', async () => {
        expect(await syncVipRecurringBookings({ now: new Date('2026-10-24T12:59:00Z') })).toMatchObject({ applied: true, success: 2 });
        expect(mocks.getSettings).toHaveBeenCalledWith({ fresh: true });
        expect(mocks.getBookingsForWeekIds).toHaveBeenCalledWith(['2026-W43', '2026-W44'], { fresh: true });
        expect(mocks.reserveVipBooking.mock.calls.map(([booking]) => booking.date)).toEqual(['2026-10-24', '2026-10-31']);
    });
    it('honors auto mode off while allowing an explicit manager sync', async () => {
        mocks.getSettings.mockResolvedValue({ ...settings, vipAutoEnabled: false });
        expect(await syncVipRecurringBookings()).toBeNull();
        expect(mocks.reserveVipBooking).not.toHaveBeenCalled();
        expect(await syncVipRecurringBookings({ manual: true, now: new Date('2026-10-24T12:59:00Z') })).toMatchObject({ applied: true });
    });
});

describe('Minsk VIP dates', () => {
    it.each(['2026-10-24T12:59:59Z', '2026-10-24T13:00:00Z', '2026-10-25T20:59:59Z'])(
        'keeps this Saturday and next Saturday on their exact calendar dates at %s', (timestamp) => {
            const weeks = getVipWeeks(new Date(timestamp));
            expect(weeks.map((week) => getVipRuleDate(rule, week))).toEqual(['2026-10-24', '2026-10-31']);
        }
    );
    it('advances at Minsk Monday midnight and handles ISO week years', () => {
        expect(getVipWeeks(new Date('2026-10-25T21:00:00Z')).map((week) => week.weekId)).toEqual(['2026-W44', '2026-W45']);
        expect(getVipWeeks(new Date('2027-01-01T12:00:00Z'))).toEqual([
            { start: '2026-12-28', end: '2027-01-03', weekId: '2026-W53' },
            { start: '2027-01-04', end: '2027-01-10', weekId: '2027-W1' },
        ]);
    });
    it('maps Sunday to the end of the Monday–Sunday week', () => {
        expect(getVipRuleDate({ ...rule, weekday: 0 }, getVipWeeks(new Date('2026-10-24T12:59:00Z'))[0])).toBe('2026-10-25');
    });
    it('detects two VIPs assigned the same machine slot', () => {
        const other = { ...rule, id: 'other-rule', studentId: 'other-student' };
        expect(getVipRuleProblem(rule, [rule, other], settings)).toContain('Conflicting active VIP rules');
    });
});
