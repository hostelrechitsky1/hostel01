import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeeklySlots from '../WeeklySlots';

const fixtures = vi.hoisted(() => ({
    settings: {
        forceShowNextWeek: false,
        forceCloseBookings: false,
        maintenanceDay: 3,
        autoOpenWeekday: 6,
        autoOpenTime: '16:00',
        autoOpenDurationHours: 168,
        slotDurationMinutes: 90,
    },
    machines: [
        { id: '1', name: 'Machine 1', status: 'available' },
        { id: '2', name: 'Machine 2', status: 'available' },
    ],
    bookings: [
        { id: 'sat', date: '2026-09-26', weekId: '2026-W39', machineId: '1', studentId: 'other-1', studentName: 'Saturday Resident', roomNumber: '501', startTime: '21:00', endTime: '22:30', createdAt: 1 },
        { id: 'sun', date: '2026-09-27', weekId: '2026-W39', machineId: '2', studentId: 'other-2', studentName: 'Sunday Resident', roomNumber: '502', startTime: '09:00', endTime: '10:30', createdAt: 2 },
        { id: 'mon', date: '2026-09-28', weekId: '2026-W40', machineId: '1', studentId: 'other-3', studentName: 'Monday Resident', roomNumber: '503', startTime: '09:00', endTime: '10:30', createdAt: 3 },
    ],
}));

vi.mock('../../services/residentSnapshotService', () => ({
    residentSnapshotService: {
        getCachedBookingSnapshot: vi.fn(() => ({ machines: fixtures.machines, weekBookings: fixtures.bookings, settings: fixtures.settings })),
        getBookingSnapshot: vi.fn(() => Promise.resolve({ machines: fixtures.machines, weekBookings: fixtures.bookings, settings: fixtures.settings })),
    },
}));

vi.mock('../../services/residentFirestoreService', () => ({
    DEFAULT_APP_SETTINGS: fixtures.settings,
    residentFirestoreService: {
        getBookingsForDate: vi.fn(() => Promise.resolve([])),
    },
}));

vi.mock('../../services/residentLiveService', () => ({
    residentLiveService: {
        subscribeToMachines: vi.fn(() => () => {}),
        subscribeToBookingsForWeekIds: vi.fn(() => () => {}),
    },
}));

describe('WeeklySlots after the Saturday opening', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-26T17:00:00Z')); // Saturday 20:00 in Belarus
        window.localStorage.setItem('hostel_current_user', JSON.stringify({
            id: 'student-1', name: 'Student', roomNumber: '52-2',
        }));
        window.sessionStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows this weekend and the newly opened week together', async () => {
        await act(async () => {
            render(<MemoryRouter><WeeklySlots /></MemoryRouter>);
        });

        expect(screen.getByText('Saturday, September 26 - Sunday, October 4')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sat\s*26/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sun\s*27/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Mon\s*28/ })).toBeInTheDocument();
        expect(screen.getByText('Room 501')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Book' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Sun\s*27/ }));
        expect(screen.getByText('Room 502')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Book' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Mon\s*28/ }));
        expect(screen.getByText('Room 503')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /Book/ }).some((button) => !button.hasAttribute('disabled'))).toBe(true);
    });

    it('updates the visible dates when the page stays open across the release time', async () => {
        vi.setSystemTime(new Date('2026-09-26T12:59:58Z')); // Saturday 15:59:58 in Belarus

        await act(async () => {
            render(<MemoryRouter><WeeklySlots /></MemoryRouter>);
        });
        expect(screen.getByText('Monday, September 21 - Sunday, September 27')).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2200);
        });

        expect(screen.getByText('Saturday, September 26 - Sunday, October 4')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sat\s*26/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sun\s*27/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Mon\s*28/ })).toBeInTheDocument();
    });
});
