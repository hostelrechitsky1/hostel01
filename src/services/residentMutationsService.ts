import type { Booking, Feedback } from '../types';
import { clearResidentCacheByPrefix } from './residentCache';
import {
    resolveBookingMutationErrorCode,
    resolveCancelBookingMutationErrorCode,
    type BookingMutationErrorCode,
    type CancelBookingMutationErrorCode,
} from '../utils/bookingMutations';
import { getBelarusNow, parseBelarusDateTime } from '../utils/time';

export type BookingMutationResult = {
    success: boolean;
    error?: string;
    booking?: Booking;
    errorCode?: BookingMutationErrorCode;
    httpStatus?: number;
};

export type CancelBookingMutationResult = {
    success: boolean;
    error?: string;
    errorCode?: CancelBookingMutationErrorCode;
    bookingId?: string;
    httpStatus?: number;
};

let firebaseMutationFallbackPromise: Promise<{
    createBooking: (booking: Booking) => Promise<BookingMutationResult>;
    cancelBooking: (bookingId: string, studentId: string) => Promise<CancelBookingMutationResult>;
    addFeedback: (feedback: Feedback) => Promise<void>;
}> | null = null;

class ResidentMutationRequestError extends Error {
    status: number;
    payload: Record<string, unknown> | null;

    constructor(status: number, message: string, payload: Record<string, unknown> | null = null) {
        super(message);
        this.name = 'ResidentMutationRequestError';
        this.status = status;
        this.payload = payload;
    }
}

const normalizeBookingMutationResult = (result: BookingMutationResult): BookingMutationResult => (
    result.success
        ? result
        : {
            ...result,
            errorCode: resolveBookingMutationErrorCode(result.errorCode, result.error),
        }
);

const normalizeCancelBookingMutationResult = (result: CancelBookingMutationResult): CancelBookingMutationResult => (
    result.success
        ? result
        : {
            ...result,
            errorCode: resolveCancelBookingMutationErrorCode(result.errorCode, result.error),
        }
);

const loadFirebaseMutationFallback = () => {
    firebaseMutationFallbackPromise ??= Promise.all([
        import('../firebase'),
        import('firebase/firestore'),
    ]).then(([{ db }, firestore]) => ({
        async createBooking(booking: Booking): Promise<BookingMutationResult> {
            const slotId = `${booking.date}_${booking.machineId}_${booking.startTime.replace(':', '-')}`;
            const slotRef = firestore.doc(db, 'bookings', slotId);
            const limitId = `${booking.studentId}_${booking.weekId}`;
            const limitRef = firestore.doc(db, 'bookingLimits', limitId);
            const bookingRecord = { ...booking, id: slotId };

            return firestore.runTransaction(db, async (transaction) => {
                const slotSnapshot = await transaction.get(slotRef);
                if (slotSnapshot.exists()) {
                    return { success: false, error: 'Slot already booked by another student. Please try a different time.' };
                }

                const limitSnapshot = await transaction.get(limitRef);
                if (limitSnapshot.exists()) {
                    return { success: false, error: 'You have already booked a slot for this week.' };
                }

                transaction.set(slotRef, bookingRecord);
                transaction.set(limitRef, {
                    studentId: booking.studentId,
                    weekId: booking.weekId,
                    bookingId: slotId,
                });
                return { success: true, booking: bookingRecord };
            });
        },

        async cancelBooking(bookingId: string, studentId: string): Promise<CancelBookingMutationResult> {
            const bookingRef = firestore.doc(db, 'bookings', bookingId);
            const bookingSnapshot = await firestore.getDoc(bookingRef);

            if (!bookingSnapshot.exists()) {
                return { success: false, error: 'This booking was already removed.', errorCode: 'not_found' };
            }

            const booking = bookingSnapshot.data() as Booking;
            if (booking.studentId !== studentId) {
                return { success: false, error: 'You can only cancel your own booking.', errorCode: 'not_allowed' };
            }

            const bookingStartAt = parseBelarusDateTime(booking.date, booking.startTime);
            if (bookingStartAt.getTime() <= getBelarusNow().getTime()) {
                return {
                    success: false,
                    error: 'This booking has already started and can no longer be cancelled.',
                    errorCode: 'already_started'
                };
            }

            const limitId = `${booking.studentId}_${booking.weekId}`;
            await firestore.deleteDoc(firestore.doc(db, 'bookingLimits', limitId));
            await firestore.deleteDoc(bookingRef);
            return { success: true, bookingId };
        },

        async addFeedback(feedback: Feedback) {
            await firestore.setDoc(firestore.doc(db, 'feedbacks', feedback.id), feedback);
        },
    }));

    return firebaseMutationFallbackPromise;
};

const postJson = async <T>(url: string, body: unknown) => {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errorMessage = typeof payload?.error === 'string'
            ? payload.error
            : `Request failed with ${response.status}`;
        throw new ResidentMutationRequestError(
            response.status,
            errorMessage,
            payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
        );
    }

    return payload as T;
};

export const residentMutationsService = {
    async createBooking(booking: Booking): Promise<BookingMutationResult> {
        try {
            const result = normalizeBookingMutationResult(
                await postJson<BookingMutationResult>('/.netlify/functions/resident-create-booking', booking)
            );

            if (result.success) {
                clearResidentCacheByPrefix('bookings:');
            }

            return result;
        } catch (error) {
            if (error instanceof ResidentMutationRequestError && error.status >= 400 && error.status < 500) {
                return {
                    success: false,
                    error: error.message,
                    errorCode: resolveBookingMutationErrorCode(
                        typeof error.payload?.errorCode === 'string' ? error.payload.errorCode : undefined,
                        error.message
                    ),
                    httpStatus: error.status,
                };
            }

            console.warn('Resident booking function failed, falling back to Firebase transaction.', error);
            const fallback = await loadFirebaseMutationFallback();
            const result = normalizeBookingMutationResult(await fallback.createBooking(booking));

            if (result.success) {
                clearResidentCacheByPrefix('bookings:');
            }

            return result;
        }
    },

    async cancelBooking(bookingId: string, studentId: string): Promise<CancelBookingMutationResult> {
        try {
            const result = normalizeCancelBookingMutationResult(
                await postJson<CancelBookingMutationResult>('/.netlify/functions/resident-cancel-booking', { bookingId, studentId })
            );

            if (result.success) {
                clearResidentCacheByPrefix('bookings:');
            }

            return result;
        } catch (error) {
            if (error instanceof ResidentMutationRequestError && error.status >= 400 && error.status < 500) {
                return {
                    success: false,
                    error: error.message,
                    errorCode: resolveCancelBookingMutationErrorCode(
                        typeof error.payload?.errorCode === 'string' ? error.payload.errorCode : undefined,
                        error.message
                    ),
                    httpStatus: error.status,
                };
            }

            console.warn('Resident cancel booking function failed, falling back to Firebase delete.', error);
            const fallback = await loadFirebaseMutationFallback();
            const result = normalizeCancelBookingMutationResult(await fallback.cancelBooking(bookingId, studentId));

            if (result.success) {
                clearResidentCacheByPrefix('bookings:');
            }

            return result;
        }
    },

    async addFeedback(feedback: Feedback) {
        try {
            const result = await postJson<{ success: boolean; error?: string }>('/.netlify/functions/resident-add-feedback', feedback);
            if (!result.success) {
                throw new Error(result.error || 'Unable to send feedback');
            }
        } catch (error) {
            console.warn('Resident feedback function failed, falling back to Firebase write.', error);
            const fallback = await loadFirebaseMutationFallback();
            await fallback.addFeedback(feedback);
        }

        clearResidentCacheByPrefix('feedbacks:');
    },
};
