import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../types';
import { getBelarusWeekId, getBelarusWeekStart, formatBelarusDate, getBelarusDate } from '../time';
import { buildMachineBookUrl, getResidentBookingWeekContext } from '../residentBookingContext';

const defaultSettings: AppSettings = {
    forceShowNextWeek: false,
    forceCloseBookings: false,
    maintenanceDay: 3,
    autoOpenWeekday: 6,
    autoOpenTime: '16:00',
    autoOpenDurationHours: 28,
    vipAutoEnabled: true,
    vipLastAppliedWeekId: '',
    topAlert: { message: '', isActive: false, type: 'info' },
};

describe('buildMachineBookUrl', () => {
    it('builds shared laundry QR URL', () => {
        const u = buildMachineBookUrl('https://host.example', { qr: true });
        expect(u).toBe('https://host.example/book?qr=1');
    });

    it('adds machine param', () => {
        const u = buildMachineBookUrl('https://host.example/', { qr: true, machineId: '3' });
        expect(u).toContain('machine=3');
        expect(u).toContain('qr=1');
    });
});

describe('getResidentBookingWeekContext', () => {
    it('uses current Belarus week id for a Tuesday in May 2026', () => {
        const now = new Date('2026-05-05T12:00:00Z');
        const ctx = getResidentBookingWeekContext(now, defaultSettings);
        const today = getBelarusDate(now);
        const ws = getBelarusWeekStart(today);
        expect(ctx.targetWeekId).toBe(getBelarusWeekId(ws));
        expect(formatBelarusDate(ctx.dateStripStart)).toBe(formatBelarusDate(today));
    });

    it('exposes forceCloseBookings', () => {
        const ctx = getResidentBookingWeekContext(new Date(), {
            ...defaultSettings,
            forceCloseBookings: true,
        });
        expect(ctx.forceCloseBookings).toBe(true);
    });
});
