import { describe, expect, it } from 'vitest';
import {
    getCancelBookingFailureMessage,
    getBookNowFailureMessage,
    getQuickBookFailureMessage,
    isBookingAvailabilityConflict,
    resolveCancelBookingMutationErrorCode,
    resolveBookingMutationErrorCode,
} from '../bookingMutations';

describe('bookingMutations', () => {
    it('resolves known booking conflict codes and messages', () => {
        expect(resolveBookingMutationErrorCode('slot_conflict')).toBe('slot_conflict');
        expect(resolveBookingMutationErrorCode(undefined, 'Slot already booked by another student. Please try a different time.')).toBe('slot_conflict');
        expect(resolveBookingMutationErrorCode(undefined, 'You have already booked a slot for this week.')).toBe('weekly_limit');
        expect(resolveBookingMutationErrorCode(undefined, 'This slot is no longer available right now. Please refresh and try another slot.')).toBe('unknown_conflict');
    });

    it('marks slot conflicts as availability conflicts', () => {
        expect(isBookingAvailabilityConflict('slot_conflict')).toBe(true);
        expect(isBookingAvailabilityConflict('unknown_conflict')).toBe(true);
        expect(isBookingAvailabilityConflict('weekly_limit')).toBe(false);
    });

    it('builds resident-friendly failure messages', () => {
        expect(getBookNowFailureMessage('slot_conflict')).toBe('That slot was just booked by another resident.');
        expect(getQuickBookFailureMessage('weekly_limit')).toBe('You already have a booking for this week, including bookings made from Book Now.');
        expect(getBookNowFailureMessage(undefined, 'Custom backend error')).toBe('Custom backend error');
        expect(resolveBookingMutationErrorCode('bookings_paused')).toBe('bookings_paused');
        expect(getBookNowFailureMessage('bookings_paused')).toBe('Bookings are paused by admin.');
    });

    it('resolves resident cancel errors and user-facing messages', () => {
        expect(resolveCancelBookingMutationErrorCode('already_started')).toBe('already_started');
        expect(resolveCancelBookingMutationErrorCode(undefined, 'This booking was already removed.')).toBe('not_found');
        expect(getCancelBookingFailureMessage('not_allowed')).toBe('You can only cancel your own booking.');
    });
});
