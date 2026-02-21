import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BookingFlow from '../BookingFlow';
import { firestoreService } from '../../services/firestoreService';
import { bookingService } from '../../services/bookingService';
import { formatBelarusDate, getBelarusDate } from '../../utils/time';

vi.mock('../../services/firestoreService', () => ({
    firestoreService: {
        getSettings: vi.fn(),
        subscribeToMachines: vi.fn(),
        subscribeToBookings: vi.fn()
    }
}));

vi.mock('../../services/bookingService', () => ({
    bookingService: {
        getCurrentUser: vi.fn()
    }
}));

describe('BookingFlow Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

        // Mock user login
        (bookingService.getCurrentUser as any).mockReturnValue({ id: '1', name: 'John Doe', roomNumber: '101' });

        // Mock settings
        (firestoreService.getSettings as any).mockResolvedValue({
            forceShowNextWeek: false,
            forceCloseBookings: false,
            maintenanceDay: 3 // Wednesday
        });

        // Mock machine subscription sync callback execution
        (firestoreService.subscribeToMachines as any).mockImplementation((callback: any) => {
            callback([
                { id: 'm1', name: 'Machine 1', status: 'available' },
                { id: 'm2', name: 'Machine 2', status: 'available' }
            ]);
            return () => { }; // unsubscribe function
        });
    });

    it('renders skeleton loaders initially during loading phase', async () => {
        (firestoreService.subscribeToBookings as any).mockImplementation(() => {
            // Do not call callback yet to keep loading=true
            return () => { };
        });

        const { container } = render(
            <MemoryRouter>
                <BookingFlow />
            </MemoryRouter>
        );
        expect(container.querySelector('.skeleton-pulse')).toBeInTheDocument();
    });

    it('shows correct capacity limits when a slot is full', async () => {
        (firestoreService.subscribeToBookings as any).mockImplementation((callback: any) => {
            const date = formatBelarusDate(getBelarusDate());
            callback([
                // Dummy bookings occupying all 2 machines at 09:00
                { id: 'b1', machineId: 'm1', date: date, startTime: '09:00', studentId: 'someone-else', weekId: 'test' },
                { id: 'b2', machineId: 'm2', date: date, startTime: '09:00', studentId: 'another', weekId: 'test' }
            ]);
            return () => { };
        });

        render(
            <MemoryRouter>
                <BookingFlow />
            </MemoryRouter>
        );

        await waitFor(() => {
            // When machines=2 and booked=2, the slot should show "Full"
            const fullSlotElement = screen.getAllByText('Full');
            expect(fullSlotElement.length).toBeGreaterThan(0);
        });
    });
});
