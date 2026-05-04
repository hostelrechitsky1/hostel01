export type BookingMutationErrorCode =
    | 'slot_conflict'
    | 'weekly_limit'
    | 'unknown_conflict'
    | 'bookings_paused'
    | 'system_error';

export type CancelBookingMutationErrorCode =
    | 'not_found'
    | 'not_allowed'
    | 'already_started'
    | 'system_error';

const BOOKING_MUTATION_ERROR_CODES = new Set<BookingMutationErrorCode>([
    'slot_conflict',
    'weekly_limit',
    'unknown_conflict',
    'bookings_paused',
    'system_error',
]);

const CANCEL_BOOKING_MUTATION_ERROR_CODES = new Set<CancelBookingMutationErrorCode>([
    'not_found',
    'not_allowed',
    'already_started',
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

    if (normalizedMessage.includes('paused')) {
        return 'bookings_paused';
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

    if (normalizedCode === 'bookings_paused') {
        return 'Bookings are paused by admin.';
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

export const resolveCancelBookingMutationErrorCode = (
    errorCode?: string,
    errorMessage?: string
): CancelBookingMutationErrorCode => {
    if (errorCode && CANCEL_BOOKING_MUTATION_ERROR_CODES.has(errorCode as CancelBookingMutationErrorCode)) {
        return errorCode as CancelBookingMutationErrorCode;
    }

    const normalizedMessage = errorMessage?.trim().toLowerCase() ?? '';

    if (normalizedMessage.includes('already removed') || normalizedMessage.includes('not found')) {
        return 'not_found';
    }

    if (normalizedMessage.includes('only cancel your own booking')) {
        return 'not_allowed';
    }

    if (normalizedMessage.includes('already started') || normalizedMessage.includes('can no longer be cancelled')) {
        return 'already_started';
    }

    return 'system_error';
};

export const getCancelBookingFailureMessage = (errorCode?: string, errorMessage?: string) => {
    const normalizedCode = resolveCancelBookingMutationErrorCode(errorCode, errorMessage);

    if (normalizedCode === 'not_found') {
        return 'This booking was already removed.';
    }

    if (normalizedCode === 'not_allowed') {
        return 'You can only cancel your own booking.';
    }

    if (normalizedCode === 'already_started') {
        return 'This booking has already started and can no longer be cancelled.';
    }

    return errorMessage || 'Could not cancel the booking right now.';
};
