import { db } from '../firebase';
import { collection, getDocs, getDocsFromServer, doc, setDoc, updateDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import type { Query } from 'firebase/firestore';
import type { Student, Machine, Booking } from '../types';
import { parseRawStudentData } from '../utils/studentParser';

const STUDENTS_COL = 'students';
const MACHINES_COL = 'machines';
const BOOKINGS_COL = 'bookings';

const getDocsWithFallback = async <T>(ref: Query<T>, label: string) => {
    try {
        return await getDocsFromServer(ref);
    } catch (error) {
        console.warn(`Failed to fetch ${label} from server. Falling back to cache.`, error);
        return await getDocs(ref);
    }
};

export const firestoreService = {
    // --- Students ---
    async getAllStudents(): Promise<Student[]> {
        const snapshot = await getDocsWithFallback(collection(db, STUDENTS_COL), 'students');
        return snapshot.docs.map(doc => doc.data() as Student);
    },

    async seedStudents(rawData: string) {
        const students = parseRawStudentData(rawData);
        const roomPins = new Map<string, string>();
        const generatePin = () => Math.floor(100 + Math.random() * 900).toString();

        for (const student of students) {
            if (!roomPins.has(student.roomNumber)) {
                roomPins.set(student.roomNumber, generatePin());
            }
            student.pin = roomPins.get(student.roomNumber);
            await setDoc(doc(db, STUDENTS_COL, student.id), student);
        }
        console.log(`Seeded ${students.length} students with PINs`);
    },

    async addStudent(student: Student) {
        await setDoc(doc(db, STUDENTS_COL, student.id), student);
    },

    async updateStudent(student: Student) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await updateDoc(doc(db, STUDENTS_COL, student.id), student as any);
    },

    async deleteStudent(id: string) {
        await deleteDoc(doc(db, STUDENTS_COL, id));
    },

    // --- Machines ---
    async getMachines(): Promise<Machine[]> {
        const snapshot = await getDocsWithFallback(collection(db, MACHINES_COL), 'machines');
        let machines = snapshot.docs.map(doc => doc.data() as Machine);

        // If empty, seed default machines
        if (machines.length === 0) {
            const defaults: Machine[] = [
                { id: '1', name: 'Machine 1', status: 'available' },
                { id: '2', name: 'Machine 2', status: 'available' },
                { id: '3', name: 'Machine 3', status: 'available' },
                { id: '4', name: 'Machine 4', status: 'available' }
            ];
            for (const m of defaults) {
                await setDoc(doc(db, MACHINES_COL, m.id), m);
            }
            machines = defaults;
        }
        return machines.sort((a, b) => a.id.localeCompare(b.id)); // Ensure order
    },

    async updateMachineStatus(id: string, status: 'available' | 'maintenance') {
        await updateDoc(doc(db, MACHINES_COL, id), { status });
    },

    async addMachine(name: string) {
        const id = Date.now().toString();
        const newMachine: Machine = { id, name, status: 'available' };
        await setDoc(doc(db, MACHINES_COL, id), newMachine);
    },

    async deleteMachine(id: string) {
        await deleteDoc(doc(db, MACHINES_COL, id));
    },

    // --- Bookings ---
    async getBookings(): Promise<Booking[]> {
        const snapshot = await getDocsWithFallback(collection(db, BOOKINGS_COL), 'bookings');
        return snapshot.docs.map(doc => doc.data() as Booking);
    },

    async createBooking(booking: Booking): Promise<{ success: boolean; error?: string }> {
        // Double check availability (Race condition protection would go here with transactions)
        // For simple app, straight write is okay for now, but better to check
        const q = query(
            collection(db, BOOKINGS_COL),
            where('date', '==', booking.date),
            where('machineId', '==', booking.machineId),
            where('startTime', '==', booking.startTime)
        );
        const snapshot = await getDocsWithFallback(q, 'bookings');
        if (!snapshot.empty) {
            return { success: false, error: 'Slot already taken by someone else.' };
        }

        // Weekly Limit Check
        const weekQ = query(
            collection(db, BOOKINGS_COL),
            where('studentId', '==', booking.studentId),
            where('weekId', '==', booking.weekId)
        );
        const weekSnapshot = await getDocsWithFallback(weekQ, 'bookings');
        if (!weekSnapshot.empty) {
            return { success: false, error: 'You have already booked a slot for this week.' };
        }

        await setDoc(doc(db, BOOKINGS_COL, booking.id), booking);
        return { success: true };
    },

    async cancelBooking(id: string) {
        await deleteDoc(doc(db, BOOKINGS_COL, id));
    },

    // --- Settings ---
    async getSettings(): Promise<{ forceShowNextWeek: boolean; forceCloseBookings: boolean }> {
        const snap = await getDocsWithFallback(collection(db, 'settings'), 'settings');
        if (snap.empty) return { forceShowNextWeek: false, forceCloseBookings: false };

        const configDoc = snap.docs.find(d => d.id === 'config');
        return configDoc ? (configDoc.data() as { forceShowNextWeek: boolean; forceCloseBookings: boolean }) : { forceShowNextWeek: false, forceCloseBookings: false };
    },

    async updateSettings(settings: { forceShowNextWeek?: boolean; forceCloseBookings?: boolean }) {
        await setDoc(doc(db, 'settings', 'config'), settings, { merge: true });
    },

    async clearAllBookings() {
        const snapshot = await getDocsWithFallback(collection(db, BOOKINGS_COL), 'bookings');
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    },

    // --- Feedback ---
    async addFeedback(feedback: any) {
        await setDoc(doc(db, 'feedbacks', feedback.id), feedback);
    },

    async getFeedbacks(): Promise<any[]> {
        const snapshot = await getDocsWithFallback(collection(db, 'feedbacks'), 'feedbacks');
        return snapshot.docs.map(doc => doc.data()).sort((a: any, b: any) => b.timestamp - a.timestamp);
    },

    async deleteFeedback(id: string) {
        await deleteDoc(doc(db, 'feedbacks', id));
    },

    // --- Auth Sync (Helper to keep local user state) ---
    // In a real app with Firebase Auth, we'd use onAuthStateChanged.
    // Here we are "simulating" login with just a student ID, so we keep using localStorage for session
    // but validate against Firestore.
};
