import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingService } from '../../services/bookingService';
import { PrivateRoute } from '../../components/PrivateRoute';

const mocks = vi.hoisted(() => ({
    lookup: vi.fn(), warmup: vi.fn(), notify: vi.fn(),
}));
vi.mock('../../services/residentRoomLookupService', () => ({
    residentRoomLookupService: { getCachedStudentsByRoom: () => undefined, getStudentsByRoom: mocks.lookup },
}));
vi.mock('../../utils/preloadRoutes', () => ({ preloadResidentRoutes: vi.fn() }));
vi.mock('../../utils/warmResidentApp', () => ({ warmResidentAppData: mocks.warmup }));
vi.mock('../../utils/notify', () => ({ notifyError: mocks.notify }));
vi.mock('../../utils/performance', () => ({ startResidentPerfSpan: vi.fn(), finishResidentPerfSpan: vi.fn() }));
import LoginScreen from '../LoginScreen';

const student = { id: 'student', name: 'VIP Resident', roomNumber: '52-2' };
beforeEach(() => {
    bookingService.logout();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    mocks.lookup.mockResolvedValue([student]);
    mocks.warmup.mockImplementation(() => new Promise(() => {}));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    bookingService.logout();
});
const openNames = async () => {
    render(<MemoryRouter initialEntries={['/login']}><Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/" element={<PrivateRoute><p>Resident dashboard opened</p></PrivateRoute>} />
    </Routes></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('e.g. 101, 52-2'), { target: { value: '52-2' } });
    fireEvent.click(screen.getByRole('button', { name: /Find Room/ }));
    await screen.findByRole('button', { name: 'VIP Resident' });
};

describe('resident login', () => {
    it('navigates immediately even when warmups never resolve and animation frames never fire', async () => {
        const raf = vi.fn(() => 1);
        vi.stubGlobal('requestAnimationFrame', raf);
        await openNames();
        fireEvent.click(screen.getByRole('button', { name: 'VIP Resident' }));
        expect(screen.getByText('Resident dashboard opened')).toBeInTheDocument();
        expect(bookingService.getCurrentUser()).toEqual(student);
        expect(raf).not.toHaveBeenCalled();
    });
    it('can sign in with corrupted saved accounts instead of leaving a spinner on the name', async () => {
        window.localStorage.setItem('hostel_saved_accounts', '{broken json');
        await openNames();
        fireEvent.click(screen.getByRole('button', { name: 'VIP Resident' }));
        expect(screen.getByText('Resident dashboard opened')).toBeInTheDocument();
        expect(bookingService.getSavedAccounts()).toEqual([student]);
    });
    it('keeps the tab signed in when the browser rejects storage writes', async () => {
        await openNames();
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
        fireEvent.click(screen.getByRole('button', { name: 'VIP Resident' }));
        expect(screen.getByText('Resident dashboard opened')).toBeInTheDocument();
        expect(bookingService.getCurrentUser()).toEqual(student);
    });
    it('signs in even when access to local and session storage is denied', async () => {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
        await openNames();
        fireEvent.click(screen.getByRole('button', { name: 'VIP Resident' }));
        expect(screen.getByText('Resident dashboard opened')).toBeInTheDocument();
    });
    it('recovers from a sign-in error and lets the resident tap their name again', async () => {
        await openNames();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(bookingService, 'setCurrentUser').mockImplementationOnce(() => { throw new Error('failed'); });
        fireEvent.click(screen.getByRole('button', { name: 'VIP Resident' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Tap your name to try again');
        expect(screen.getByRole('button', { name: 'VIP Resident' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'VIP Resident' }));
        expect(screen.getByText('Resident dashboard opened')).toBeInTheDocument();
    });
    it('does not open the mobile keyboard on page entry', () => {
        render(<MemoryRouter><LoginScreen /></MemoryRouter>);
        expect(screen.getByPlaceholderText('e.g. 101, 52-2')).not.toHaveFocus();
    });
    it('continues to require the room PIN before choosing a resident', async () => {
        mocks.lookup.mockResolvedValue([{ ...student, pin: '123' }]);
        render(<MemoryRouter initialEntries={['/login']}><Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/" element={<PrivateRoute><p>Resident dashboard opened</p></PrivateRoute>} />
        </Routes></MemoryRouter>);
        fireEvent.change(screen.getByPlaceholderText('e.g. 101, 52-2'), { target: { value: '52-2' } });
        fireEvent.click(screen.getByRole('button', { name: /Find Room/ }));
        await screen.findByText('Enter Room PIN');
        expect(screen.queryByRole('button', { name: 'VIP Resident' })).not.toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '999' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }));
        expect(mocks.notify).toHaveBeenCalledWith('Incorrect Room PIN.');
        fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '123' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }));
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'VIP Resident' })); });
        expect(screen.getByText('Resident dashboard opened')).toBeInTheDocument();
    });
});
