import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LoginScreen from '../LoginScreen';
import { firestoreService } from '../../services/firestoreService';

// Mock the navigate function
const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate,
    };
});

vi.mock('../../services/firestoreService', () => ({
    firestoreService: {
        getAllStudents: vi.fn()
    }
}));

describe('LoginScreen Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (firestoreService.getAllStudents as any).mockResolvedValue([
            { id: '1', name: 'John Doe', roomNumber: '101', pin: '123' },
            { id: '2', name: 'Jane Smith', roomNumber: '52-2', pin: '456' }
        ]);
    });

    it('renders the room selection view initially', () => {
        render(
            <MemoryRouter>
                <LoginScreen />
            </MemoryRouter>
        );
        expect(screen.getByText('Hostel Wash')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g. 101, 52-2')).toBeInTheDocument();
    });

    it('shows error if invalid room is submitted', async () => {
        render(
            <MemoryRouter>
                <LoginScreen />
            </MemoryRouter>
        );

        const roomInput = screen.getByPlaceholderText('e.g. 101, 52-2');
        fireEvent.change(roomInput, { target: { value: '999' } });
        fireEvent.click(screen.getByText((content) => content.includes('Find Room')));

        await waitFor(() => {
            expect(screen.getByText('Room not found. Please check the number (e.g. 101, 52-2).')).toBeInTheDocument();
        });
    });

    it('transitions to PIN step for a valid protected room', async () => {
        render(
            <MemoryRouter>
                <LoginScreen />
            </MemoryRouter>
        );

        const roomInput = screen.getByPlaceholderText('e.g. 101, 52-2');
        fireEvent.change(roomInput, { target: { value: '101' } });
        fireEvent.click(screen.getByText((content) => content.includes('Find Room')));

        await waitFor(() => {
            expect(screen.getByText('Enter Room PIN')).toBeInTheDocument();
        });

        // Verify PIN input uses password masking
        const pinInput = screen.getByPlaceholderText('000');
        expect(pinInput).toHaveAttribute('type', 'password');
    });
});
