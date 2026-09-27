import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ManagerReminderSubscribers from './ManagerReminderSubscribers';

const students = [
    { id: 'resident-1', name: 'Ayon Silva', roomNumber: '52-2', pin: '123' },
    { id: 'resident-2', name: 'Other Resident', roomNumber: '21-1', pin: '456' },
];

describe('ManagerReminderSubscribers', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('lists only opted-in residents and filters by room', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true, json: async () => ({ subscribers: [{ studentId: 'resident-1', email: 'a***@example.com' }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        render(<ManagerReminderSubscribers students={students} />);
        expect(await screen.findByText('a***@example.com')).toBeInTheDocument();
        expect(screen.getByText('Ayon Silva')).toBeInTheDocument();
        expect(screen.getByText('Room 52-2')).toBeInTheDocument();
        expect(screen.queryByText('Other Resident')).not.toBeInTheDocument();

        const request = fetchMock.mock.calls[0][1];
        expect(JSON.parse(request.body)).toEqual({ residents: [
            { studentId: 'resident-1', roomNumber: '52-2', pin: '123' },
            { studentId: 'resident-2', roomNumber: '21-1', pin: '456' },
        ] });

        fireEvent.change(screen.getByRole('textbox', { name: 'Search subscribers' }), { target: { value: '21-1' } });
        expect(screen.getByText('No matching subscribers.')).toBeInTheDocument();
    });
});
