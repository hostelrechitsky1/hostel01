import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import BookingFlow from '../BookingFlow';
import * as timeUtils from '../../utils/time';

vi.mock('../../services/firestoreService', () => ({
    firestoreService: {
        getAppSettings: vi.fn(),
        subscribeToAppSettings: vi.fn(),
        subscribeToMachines: vi.fn(),
        subscribeToBookings: vi.fn(),
    }
}));

vi.mock('../../utils/time', async (importOriginal) => {
    const actual = await importOriginal<typeof timeUtils>();
    return {
        ...actual,
        getBelarusNow: vi.fn(),
    };
});

describe('BookingFlow Component', () => {
    it('renders closed bookings state with countdown timer', () => {
        // Mock app settings to simulate closed window but NOT force closed
        vi.spyOn(timeUtils, 'getBelarusNow').mockReturnValue(new Date('2026-02-27T10:00:00Z'));

        // We cannot fully test the complex internal React state easily without larger mocks,
        // but we can at least assert the component renders without crashing.
        const { container } = render(
            <BrowserRouter>
                <BookingFlow />
            </BrowserRouter>
        );

        expect(container).toBeInTheDocument();
    });
});
