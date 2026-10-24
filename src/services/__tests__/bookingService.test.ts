import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingService } from '../bookingService';

describe('bookingService saved accounts', () => {
    beforeEach(() => {
        bookingService.logout();
        window.localStorage.clear();
    });

    afterEach(() => { vi.restoreAllMocks(); bookingService.logout(); });

    it('saves the current student as an explicitly saved account', () => {
        bookingService.setCurrentUser({
            id: 'student-1',
            name: 'Silva Shanilka',
            roomNumber: '52-2',
        });

        expect(bookingService.getSavedAccounts()).toEqual([
            {
                id: 'student-1',
                name: 'Silva Shanilka',
                roomNumber: '52-2',
            },
        ]);
    });

    it('dedupes saved accounts so roommate lists are not imported wholesale', () => {
        bookingService.setSavedAccounts([
            { id: 'student-1', name: 'Silva Shanilka', roomNumber: '52-2' },
            { id: 'student-1', name: 'Silva Shanilka', roomNumber: '52-2' },
            { id: 'student-2', name: 'Alex Kumar', roomNumber: '52-2' },
        ]);

        expect(bookingService.getSavedAccounts()).toHaveLength(2);
        expect(bookingService.getSavedAccounts().map((student) => student.id)).toEqual(['student-1', 'student-2']);
    });

    it('keeps the previous current student when switching from an old single-user session', () => {
        window.localStorage.setItem('hostel_current_user', JSON.stringify({
            id: 'student-1',
            name: 'Silva Shanilka',
            roomNumber: '52-2',
        }));

        bookingService.setCurrentUser({
            id: 'student-2',
            name: 'Alex Kumar',
            roomNumber: '52-2',
        });

        expect(bookingService.getSavedAccounts().map((student) => student.id)).toEqual(['student-1', 'student-2']);
    });

    it.each(['{invalid', 'null', '{}', '[null, {}, {"id": "missing-fields"}]'])(
        'ignores invalid saved accounts (%s) when a resident signs in', (saved) => {
            window.localStorage.setItem('hostel_saved_accounts', saved);
            const student = { id: 'student', name: 'Resident', roomNumber: '52-2' };
            expect(() => bookingService.setCurrentUser(student)).not.toThrow();
            expect(bookingService.getCurrentUser()).toEqual(student);
            expect(bookingService.getSavedAccounts()).toEqual([student]);
        }
    );

    it('keeps the current tab usable when browser storage access is blocked', () => {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
        const student = { id: 'student', name: 'Resident', roomNumber: '52-2' };
        bookingService.setCurrentUser(student);
        expect(bookingService.getCurrentUser()).toEqual(student);
        expect(bookingService.getSavedAccounts()).toEqual([student]);
        bookingService.logout();
        expect(bookingService.getCurrentUser()).toBeNull();
    });
});
