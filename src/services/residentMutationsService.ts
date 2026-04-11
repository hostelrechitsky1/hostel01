import { db } from '../firebase';
import { doc, runTransaction, setDoc } from 'firebase/firestore';
import type { Booking, Feedback } from '../types';
import { clearResidentCacheByPrefix } from './residentFirestoreService';

const BOOKINGS_COL = 'bookings';
const BOOKING_LIMITS_COL = 'bookingLimits';

export const residentMutationsService = {
    async createBooking(booking: Booking): Promise<{ success: boolean; error?: string }> {
        const slotId = `${booking.date}_${booking.machineId}_${booking.startTime.replace(':', '-')}`;
        const slotRef = doc(db, BOOKINGS_COL, slotId);
        const limitId = `${booking.studentId}_${booking.weekId}`;
        const limitRef = doc(db, BOOKING_LIMITS_COL, limitId);
        const bookingRecord = { ...booking, id: slotId };

        const result = await runTransaction(db, async (transaction) => {
            const slotSnapshot = await transaction.get(slotRef);
            if (slotSnapshot.exists()) {
                return { success: false, error: 'Slot already booked by another student. Please try a different time.' };
            }

            const limitSnapshot = await transaction.get(limitRef);
            if (limitSnapshot.exists()) {
                return { success: false, error: 'You have already booked a slot for this week.' };
            }

            transaction.set(slotRef, bookingRecord);
            transaction.set(limitRef, { studentId: booking.studentId, weekId: booking.weekId, bookingId: slotId });
            return { success: true };
        });

        if (result.success) {
            clearResidentCacheByPrefix('bookings:');
        }

        return result;
    },

    async addFeedback(feedback: Feedback) {
        await setDoc(doc(db, 'feedbacks', feedback.id), feedback);
        clearResidentCacheByPrefix('feedbacks:');
    },
};
