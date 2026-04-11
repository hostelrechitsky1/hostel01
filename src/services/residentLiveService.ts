import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Booking, Feedback, Machine } from '../types';
import {
    CACHE_MAX_AGE_MS,
    filterFeedbacksForResident,
    getBookingsByDateCacheKey,
    getBookingsByWeeksCacheKey,
    getResidentFeedbacksCacheKey,
    getStudentBookingsCacheKey,
    hydrateResidentCache,
    normalizeWeekIdsForResidentCache,
    residentCacheKeys,
    sortBookingsChronologically,
    sortMachines,
    sortStudentBookingsByRecent,
    writeResidentCache,
} from './residentCache';

const MACHINES_COL = 'machines';
const BOOKINGS_COL = 'bookings';

export const residentLiveService = {
    subscribeToMachines(callback: (machines: Machine[]) => void, onError?: (error: unknown) => void): () => void {
        hydrateResidentCache(residentCacheKeys.machines, CACHE_MAX_AGE_MS.machines, callback);

        const machinesQuery = collection(db, MACHINES_COL);
        return onSnapshot(machinesQuery, (snapshot) => {
            const machines = sortMachines(snapshot.docs.map((machineDoc) => machineDoc.data() as Machine));
            writeResidentCache(residentCacheKeys.machines, machines);
            callback(machines);
        }, (error) => {
            console.error('Error subscribing to machines:', error);
            onError?.(error);
        });
    },

    subscribeToBookingsForWeekIds(
        weekIds: string[],
        callback: (bookings: Booking[]) => void,
        onError?: (error: unknown) => void
    ): () => void {
        const normalizedWeekIds = normalizeWeekIdsForResidentCache(weekIds);
        if (normalizedWeekIds.length === 0) {
            callback([]);
            return () => { /* noop */ };
        }

        const cacheKey = getBookingsByWeeksCacheKey(normalizedWeekIds);
        hydrateResidentCache(cacheKey, CACHE_MAX_AGE_MS.bookingsByWeek, callback);

        const bookingsQuery = query(collection(db, BOOKINGS_COL), where('weekId', 'in', normalizedWeekIds));
        return onSnapshot(bookingsQuery, (snapshot) => {
            const bookings = sortBookingsChronologically(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking));
            writeResidentCache(cacheKey, bookings);
            callback(bookings);
        }, (error) => {
            console.error('Error subscribing to week bookings:', error);
            onError?.(error);
        });
    },

    subscribeToBookingsForDate(
        date: string,
        callback: (bookings: Booking[]) => void,
        onError?: (error: unknown) => void
    ): () => void {
        const normalizedDate = date.trim();
        if (!normalizedDate) {
            callback([]);
            return () => { /* noop */ };
        }

        const cacheKey = getBookingsByDateCacheKey(normalizedDate);
        hydrateResidentCache(cacheKey, CACHE_MAX_AGE_MS.bookingsByWeek, callback);

        const bookingsQuery = query(collection(db, BOOKINGS_COL), where('date', '==', normalizedDate));
        return onSnapshot(bookingsQuery, (snapshot) => {
            const bookings = sortBookingsChronologically(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking));
            writeResidentCache(cacheKey, bookings);
            callback(bookings);
        }, (error) => {
            console.error('Error subscribing to date bookings:', error);
            onError?.(error);
        });
    },

    subscribeToRecentBookingsForStudent(
        studentId: string,
        limitCount = 12,
        callback: (bookings: Booking[]) => void,
        onError?: (error: unknown) => void
    ): () => void {
        if (!studentId) {
            callback([]);
            return () => { /* noop */ };
        }

        const cacheKey = getStudentBookingsCacheKey(studentId, limitCount);
        hydrateResidentCache(cacheKey, CACHE_MAX_AGE_MS.recentStudentBookings, callback);

        const studentBookingsQuery = query(collection(db, BOOKINGS_COL), where('studentId', '==', studentId));
        return onSnapshot(studentBookingsQuery, (snapshot) => {
            const bookings = sortStudentBookingsByRecent(snapshot.docs.map((bookingDoc) => bookingDoc.data() as Booking), limitCount);
            writeResidentCache(cacheKey, bookings);
            callback(bookings);
        }, (error) => {
            console.error('Error subscribing to student bookings:', error);
            onError?.(error);
        });
    },

    subscribeToFeedbacksForResident(
        studentId: string,
        studentName: string,
        roomNumber: string,
        limitCount = 8,
        callback: (feedbacks: Feedback[]) => void,
        onError?: (error: unknown) => void
    ): () => void {
        const normalizedRoom = roomNumber.trim();
        if (!normalizedRoom) {
            callback([]);
            return () => { /* noop */ };
        }

        const cacheKey = getResidentFeedbacksCacheKey(studentId, studentName, normalizedRoom, limitCount);
        hydrateResidentCache(cacheKey, CACHE_MAX_AGE_MS.recentFeedbacks, callback);

        const residentFeedbackQuery = query(collection(db, 'feedbacks'), where('roomNumber', '==', normalizedRoom));
        return onSnapshot(residentFeedbackQuery, (snapshot) => {
            const feedbacks = filterFeedbacksForResident(
                snapshot.docs.map((feedbackDoc) => feedbackDoc.data() as Feedback),
                studentId,
                studentName,
                normalizedRoom,
                limitCount
            );
            writeResidentCache(cacheKey, feedbacks);
            callback(feedbacks);
        }, (error) => {
            console.error('Error subscribing to resident feedback:', error);
            onError?.(error);
        });
    }
};
