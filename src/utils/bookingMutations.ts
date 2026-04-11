export type BookingMutationErrorCode =
    | 'slot_conflict'
    | 'weekly_limit'
    | 'unknown_conflict'
    | 'system_error';

const BOOKING_MUTATION_ERROR_CODES = new Set<BookingMutationErrorCode>([
    'slot_conflict',
    'weekly_limit',
    'unknown_conflict',
    'system_error',
]);

export const resolveBookingMutationErrorCode = (
    errorCode?: string,
    errorMessage?: string
): BookingMutationErrorCode => {
    if (errorCode && BOOKING_MUTATION_ERROR_CODES.has(errorCode as BookingMutationErrorCode)) {
        return errorCode as BookingMutationErrorCode;
    }

    const normalizedMessage = errorMessage?.trim().toLowerCase() ?? '';

    if (normalizedMessage.includes('slot already booked by another student')) {
        return 'slot_conflict';
    }

    if (normalizedMessage.includes('already booked a slot for this week')) {
        return 'weekly_limit';
    }

    if (normalizedMessage.includes('no longer available')) {
        return 'unknown_conflict';
    }

    return 'system_error';
};

export const isBookingAvailabilityConflict = (errorCode?: string, errorMessage?: string) => {
    const normalizedCode = resolveBookingMutationErrorCode(errorCode, errorMessage);
    return normalizedCode === 'slot_conflict' || normalizedCode === 'unknown_conflict';
};

export const getBookNowFailureMessage = (errorCode?: string, errorMessage?: string) => {
    const normalizedCode = resolveBookingMutationErrorCode(errorCode, errorMessage);

    if (normalizedCode === 'slot_conflict') {
        return 'That slot was just booked by another resident.';
    }

    if (normalizedCode === 'weekly_limit') {
        return 'You already have a booking for this week. You cannot confirm another slot right now.';
    }

    if (normalizedCode === 'unknown_conflict') {
        return 'This slot is no longer available right now.';
    }

    return errorMessage || 'Booking failed. Please try again.';
};

export const getQuickBookFailureMessage = (errorCode?: string, errorMessage?: string) => {
    const normalizedCode = resolveBookingMutationErrorCode(errorCode, errorMessage);

    if (normalizedCode === 'slot_conflict') {
        return 'This exact machine and slot was just booked by another resident. Please choose another slot.';
    }

    if (normalizedCode === 'weekly_limit') {
        return 'You already have a booking for this week, including bookings made from Book Now.';
    }

    if (normalizedCode === 'unknown_conflict') {
        return 'This machine and slot is no longer available right now. Please try another one.';
    }

    return errorMessage || 'Quick booking failed. Please try again.';
};
