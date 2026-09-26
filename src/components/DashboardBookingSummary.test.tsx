import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardBookingSummary from './DashboardBookingSummary';
import { DEFAULT_APP_SETTINGS } from '../services/residentCache';

describe('DashboardBookingSummary', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows past bookings without a shortcut to book them again', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));

        render(
            <DashboardBookingSummary
                user={{ id: 'student-1', name: 'Student', roomNumber: '52-2' }}
                machines={[{ id: 'machine-1', name: 'Machine 1', status: 'available' }]}
                recentBookings={[{
                    id: 'old-booking',
                    machineId: 'machine-1',
                    studentId: 'student-1',
                    date: '2026-09-24',
                    startTime: '20:00',
                    endTime: '21:30',
                    weekId: '2026-W39',
                    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
                }]}
                recentBookingsLoading={false}
                settings={DEFAULT_APP_SETTINGS}
                onBookingCancelled={vi.fn()}
            />
        );

        expect(screen.getByRole('heading', { name: 'Past Bookings' })).toBeInTheDocument();
        expect(screen.getByText(/Thursday, September 24, 2026/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /quick book/i })).not.toBeInTheDocument();
    });
});
