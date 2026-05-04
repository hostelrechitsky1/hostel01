import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BookingFlow from '../BookingFlow';
import * as timeUtils from '../../utils/time';

const defaultSettings = vi.hoisted(() => ({
    forceShowNextWeek: false,
    forceCloseBookings: false,
    maintenanceDay: 3,
    autoOpenWeekday: 6,
    autoOpenTime: '16:00',
    autoOpenDurationHours: 28,
    vipAutoEnabled: true,
    vipLastAppliedWeekId: '',
    topAlert: { message: '', isActive: false, type: 'info' as const },
}));

vi.mock('../../services/bookingService', () => ({
    bookingService: {
        getCurrentUser: vi.fn(() => ({
            id: 'u1',
            name: 'Test Student',
            roomNumber: '101',
        })),
    },
}));

vi.mock('../../services/residentFirestoreService', () => ({
    DEFAULT_APP_SETTINGS: defaultSettings,
    residentFirestoreService: {
        getCachedMachines: vi.fn(() => undefined),
        getCachedBookingsForWeekIds: vi.fn(() => undefined),
        getCachedSettings: vi.fn(() => undefined),
        getMachines: vi.fn(() => Promise.resolve([])),
        getBookingsForWeekIds: vi.fn(() => Promise.resolve([])),
        getBookingsForDate: vi.fn(() => Promise.resolve([])),
        getSettings: vi.fn(() => Promise.resolve(defaultSettings)),
    },
}));

vi.mock('../../services/residentSnapshotService', () => ({
    residentSnapshotService: {
        getCachedBookingSnapshot: vi.fn(() => undefined),
        getCachedDashboardSnapshot: vi.fn(() => undefined),
        getCachedWarmSnapshot: vi.fn(() => undefined),
        getBookingSnapshot: vi.fn(() => Promise.resolve({
            machines: [
                { id: '1', name: 'Machine 1', status: 'available' as const },
                { id: '2', name: 'Machine 2', status: 'available' as const },
                { id: '3', name: 'Machine 3', status: 'available' as const },
                { id: '4', name: 'Machine 4', status: 'available' as const },
            ],
            weekBookings: [],
            settings: defaultSettings,
        })),
    },
}));

vi.mock('../../services/residentLiveService', () => ({
    residentLiveService: {
        subscribeToMachines: vi.fn(() => () => {}),
        subscribeToBookingsForWeekIds: vi.fn(() => () => {}),
        subscribeToBookingsForDate: vi.fn(() => () => {}),
    },
}));

vi.mock('../../services/residentMutationsService', () => ({
    residentMutationsService: {
        createBooking: vi.fn(() => Promise.resolve({ success: true })),
        addFeedback: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('react-confetti', () => ({
    default: () => <div data-testid="mock-confetti" />
}));

vi.mock('../../utils/time', async (importOriginal) => {
    const actual = await importOriginal<typeof timeUtils>();
    return {
        ...actual,
        getBelarusNow: vi.fn(() => new Date('2026-05-05T14:30:00Z')),
    };
});

describe('BookingFlow Component', () => {
    beforeEach(() => {
        vi.mocked(timeUtils.getBelarusNow).mockReturnValue(new Date('2026-05-05T14:30:00Z'));
    });

    it('renders without crashing', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/book']}>
                <BookingFlow />
            </MemoryRouter>,
        );
        expect(container).toBeInTheDocument();
    });

    it('shows QR machine overview when qr=1', async () => {
        render(
            <MemoryRouter initialEntries={['/book?qr=1']}>
                <BookingFlow />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId('machine-qr-overview')).toBeInTheDocument();
        expect(screen.getByText('Machine slots — today')).toBeInTheDocument();
    });
});
