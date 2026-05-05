import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WeeklySlots from '../WeeklySlots';
const fixtures = vi.hoisted(() => {
    const settings = {
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

    const machines = [
        { id: '1', name: 'Machine 1', status: 'available' },
        { id: '2', name: 'Machine 2', status: 'available' },
        { id: '3', name: 'Machine 3', status: 'available' },
        { id: '4', name: 'Machine 4', status: 'available' },
    ];

    const bookings = [{
        id: '2026-05-04_1_09-00',
        machineId: '1',
        studentId: 'other-student',
        studentName: 'Иванов Иван',
        roomNumber: '401',
        date: '2026-05-04',
        startTime: '09:00',
        endTime: '10:30',
        weekId: '2026-W19',
        createdAt: 1,
    }];

    return { bookings, machines, settings };
});

vi.mock('../../services/residentSnapshotService', () => ({
    residentSnapshotService: {
        getCachedBookingSnapshot: vi.fn(() => ({ machines: fixtures.machines, weekBookings: fixtures.bookings, settings: fixtures.settings })),
        getBookingSnapshot: vi.fn(() => Promise.resolve({ machines: fixtures.machines, weekBookings: fixtures.bookings, settings: fixtures.settings })),
    },
}));

vi.mock('../../services/residentFirestoreService', () => ({
    DEFAULT_APP_SETTINGS: fixtures.settings,
    residentFirestoreService: {
        getBookingsForDate: vi.fn(() => Promise.resolve(fixtures.bookings)),
    },
}));

vi.mock('../../services/residentLiveService', () => ({
    residentLiveService: {
        subscribeToMachines: vi.fn(() => () => {}),
        subscribeToBookingsForWeekIds: vi.fn(() => () => {}),
    },
}));

vi.mock('../../services/residentMutationsService', () => ({
    residentMutationsService: {
        createBooking: vi.fn(() => Promise.resolve({ success: true })),
    },
}));

vi.mock('../../utils/time', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/time')>();
    return {
        ...actual,
        getBelarusNow: vi.fn(() => new Date('2026-03-03T06:00:00Z')),
        getBelarusDate: vi.fn(() => new Date(Date.UTC(2026, 2, 3))),
    };
});

describe('WeeklySlots', () => {
    beforeEach(() => {
        window.localStorage.setItem('hostel_current_user', JSON.stringify({
            id: 'student-1',
            name: 'Петров Петр',
            roomNumber: '402',
        }));
        window.sessionStorage.clear();
    });

    it('shows weekly online message and booked names in English by default', async () => {
        render(
            <BrowserRouter>
                <WeeklySlots />
            </BrowserRouter>
        );

        expect(screen.getByText('Bookings now open entire week')).toBeInTheDocument();
        expect(await screen.findByText('Ivanov Ivan')).toBeInTheDocument();
        expect(screen.getByText('Room 401')).toBeInTheDocument();
    });

    it('switches page chrome to Russian while keeping booked names in English', async () => {
        render(
            <BrowserRouter>
                <WeeklySlots />
            </BrowserRouter>
        );

        await userEvent.click(screen.getByRole('button', { name: /русский/i }));

        expect(await screen.findByText('Бронирование открыто всю неделю')).toBeInTheDocument();
        expect(screen.getByText('Ivanov Ivan')).toBeInTheDocument();
    });
});
