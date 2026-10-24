import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
    settings: {
        forceShowNextWeek: false, forceCloseBookings: false, maintenanceDay: 3,
        autoOpenWeekday: 6, autoOpenTime: '16:00', autoOpenDurationHours: 168,
        slotDurationMinutes: 90, vipAutoEnabled: false, vipLastAppliedWeekId: '2026-W44',
    },
    rules: [{ id: 'rule', studentId: 'student', machineId: 'machine', weekday: 6, startTime: '21:00', isActive: true, createdAt: 1 }],
    sync: vi.fn(), updateRule: vi.fn(), addRule: vi.fn(), toggleRule: vi.fn(), alert: vi.fn(),
}));
vi.mock('../../services/firestoreService', () => ({
    firestoreService: {
        getCachedMachines: () => null, getCachedStudents: () => null, getCachedBanners: () => null,
        getCachedSettings: () => null, getCachedRecentAdminBookings: () => null, getCachedFeedbacks: () => null,
        getMachines: async () => [{ id: 'machine', name: 'Machine 1', status: 'available' }],
        getAllStudents: async () => [{ id: 'student', name: 'VIP Resident', roomNumber: '52-2' }],
        getSettings: async () => fixtures.settings,
        getBanners: async () => [], getVipRecurringRules: async () => fixtures.rules,
        getBookingsForWeekIds: async () => [], getRecentAdminBookings: async () => [], getFeedbacks: async () => [],
        updateVipRecurringRule: fixtures.updateRule, addVipRecurringRule: fixtures.addRule, toggleVipRecurringRule: fixtures.toggleRule,
    },
}));
vi.mock('../../services/vipRecurringService', () => ({ syncVipRecurringBookings: fixtures.sync }));
vi.mock('../../components/useAdminDialog', () => ({ useAdminDialog: () => ({ alertDialog: fixtures.alert, confirmDialog: vi.fn(), promptDialog: vi.fn(), dialogNode: null }) }));
vi.mock('../../components/ManagerReminderSubscribers', () => ({ default: () => null }));
import ManagerPanel from '../ManagerPanel';

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T12:59:00Z'));
    window.sessionStorage.setItem('manager_auth', 'true');
    fixtures.settings.vipAutoEnabled = false;
    fixtures.rules[0].isActive = true;
    fixtures.sync.mockResolvedValue({ applied: true, nextWeekId: '2026-W44', success: 2, overridden: 0, skipped: 0, failed: 0, blocked: 0 });
});
afterEach(() => vi.useRealTimers());
const openPanel = async () => {
    await act(async () => { render(<MemoryRouter><ManagerPanel /></MemoryRouter>); });
    await screen.findByText('VIP Recurring Bookings (1)');
};

describe('manager VIP controls', () => {
    it('shows real reservation dates and missing-booking status despite the applied marker', async () => {
        await openPanel();
        expect(screen.getByText('2026-10-24: Not booked · 2026-10-31: Not booked')).toBeInTheDocument();
        expect(fixtures.sync).not.toHaveBeenCalled();
    });
    it('syncs immediately when an edited rule is saved', async () => {
        await openPanel();
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Save Edit & Sync Bookings' }));
        await waitFor(() => expect(fixtures.updateRule).toHaveBeenCalled());
        await waitFor(() => expect(fixtures.sync).toHaveBeenCalledWith({ manual: true }));
        expect(fixtures.alert).toHaveBeenCalledWith('VIP Sync Complete', expect.stringContaining('Confirmed: 2'));
    });
    it('syncs immediately when a paused rule is activated', async () => {
        fixtures.rules[0].isActive = false;
        await openPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Paused' }));
        await waitFor(() => expect(fixtures.toggleRule).toHaveBeenCalledWith('rule', true));
        await waitFor(() => expect(fixtures.sync).toHaveBeenCalledWith({ manual: true }));
    });
    it('verifies automatically even when the week is already marked applied', async () => {
        fixtures.settings.vipAutoEnabled = true;
        await openPanel();
        await waitFor(() => expect(fixtures.sync).toHaveBeenCalledWith({ manual: false }));
        expect(screen.getByText(/Auto sync complete/)).toBeInTheDocument();
    });
    it('shows a verification error instead of reporting failed sync as complete', async () => {
        fixtures.sync.mockRejectedValue(new Error('offline'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await openPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Sync VIP Bookings' }));
        await screen.findByRole('alert');
        expect(screen.getByRole('alert')).toHaveTextContent('Could not verify VIP reservations');
        expect(fixtures.alert).toHaveBeenCalledWith('VIP Sync Failed', expect.any(String));
        errorSpy.mockRestore();
    });
});
