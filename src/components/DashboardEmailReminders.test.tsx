import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardEmailReminders from './DashboardEmailReminders';

const student = { id: 'reminder-student-1', name: 'Ayon Silva', roomNumber: '52-2' };

describe('DashboardEmailReminders', () => {
    beforeEach(() => window.sessionStorage.clear());
    afterEach(() => vi.unstubAllGlobals());

    it('shows the saved email immediately when returning to the dashboard', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true, email: 'a*****@gmail.com' }) })
            .mockImplementation(() => new Promise(() => {}));
        vi.stubGlobal('fetch', fetchMock);

        const firstVisit = render(<DashboardEmailReminders student={student} language="en" />);
        expect(await screen.findByText('Reminders are on')).toBeInTheDocument();
        firstVisit.unmount();

        render(<DashboardEmailReminders student={student} language="en" />);
        expect(screen.getByText('Reminders are on')).toBeInTheDocument();
        expect(screen.getByText('a*****@gmail.com')).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'Email address' })).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not show another resident’s saved email while checking a new account', () => {
        window.sessionStorage.setItem('hostel_reminder_status_v1:reminder-student-1', JSON.stringify({ enabled: true, email: 'a*****@gmail.com' }));
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

        render(<DashboardEmailReminders student={{ id: 'reminder-student-2', name: 'Other Student', roomNumber: '21-1' }} language="en" />);
        expect(screen.getByRole('status')).toHaveTextContent('Checking your reminder settings');
        expect(screen.queryByText('a*****@gmail.com')).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'Email address' })).not.toBeInTheDocument();
    });
});
