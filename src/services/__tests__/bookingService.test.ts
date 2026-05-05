import { beforeEach, describe, expect, it } from 'vitest';
import { bookingService } from '../bookingService';

describe('bookingService saved accounts', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

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
});
