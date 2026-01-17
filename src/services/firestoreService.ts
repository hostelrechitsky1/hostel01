import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import type { Student, Machine, Booking } from '../types';
import { parseRawStudentData } from '../utils/studentParser';

const STUDENTS_COL = 'students';
const MACHINES_COL = 'machines';
const BOOKINGS_COL = 'bookings';

export const firestoreService = {
    // --- Students ---
    async getAllStudents(): Promise<Student[]> {
        const snapshot = await getDocs(collection(db, STUDENTS_COL));
        return snapshot.docs.map(doc => doc.data() as Student);
    },

    async seedStudents(rawData: string, onProgress?: (msg: string) => void) {
        const log = (msg: string) => {
            console.log(msg);
            if (onProgress) onProgress(msg);
        };

        log("Starting Engine V3 (Parallel Writes)...");

        // 0. Pre-flight Write Test
        log("Test: Verifying Write Permissions...");
        try {
            const testRef = doc(db, 'system', 'connectivity_check');
            const testTimeout = new Promise((_, r) => setTimeout(() => r(new Error("Write Timeout")), 5000));
            await Promise.race([
                setDoc(testRef, { lastCheck: new Date(), status: 'testing' }),
                testTimeout
            ]);
            log("✅ Write Permission Granted.");
        } catch (e: any) {
            throw new Error(`WRITE BLOCKED: ${e.message}. Check Firebase Rules.`);
        }

        const students = parseRawStudentData(rawData);
        log(`Parsed ${students.length} students. Checking existing PINs...`);

        // 1. Fetch existing PINs
        const pinMap = new Map<string, string>();
        try {
            const snap = await getDocs(collection(db, STUDENTS_COL));
            snap.docs.forEach(d => {
                const s = d.data() as Student;
                if (s.roomNumber && s.pin) pinMap.set(s.roomNumber, s.pin);
            });
            log(`Found ${pinMap.size} existing PINs to preserve.`);
        } catch (e: any) {
            log(`Warning: Could not fetch existing PINs (${e.message}). Proceeding as fresh seed.`);
        }

        // 2. Prepare Data
        const generatePin = () => Math.floor(100 + Math.random() * 900).toString();

        const studentsPrepare = students.map(student => {
            let pin = pinMap.get(student.roomNumber);
            if (!pin) {
                pin = generatePin();
                pinMap.set(student.roomNumber, pin);
            }
            student.pin = pin;
            return student;
        });

        // 3. Parallel Chunk Execution (Size 20)
        const CHUNK_SIZE = 20;
        const total = studentsPrepare.length;
        let processed = 0;

        for (let i = 0; i < total; i += CHUNK_SIZE) {
            const chunk = studentsPrepare.slice(i, i + CHUNK_SIZE);

            // Create array of promises
            const promises = chunk.map(student =>
                setDoc(doc(db, STUDENTS_COL, student.id), student, { merge: true })
            );

            try {
                // Execute chunk
                await Promise.all(promises);
                processed += chunk.length;
                log(`Saved ${processed}/${total} students...`);
            } catch (e: any) {
                throw new Error(`Write Chunk Failed at ${processed}: ${e.message}`);
            }
        }

        log(`✅ Seed Complete! All ${total} records synced.`);
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
        const snapshot = await getDocs(collection(db, MACHINES_COL));
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
        const snapshot = await getDocs(collection(db, BOOKINGS_COL));
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
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return { success: false, error: 'Slot already taken by someone else.' };
        }

        // Weekly Limit Check
        const weekQ = query(
            collection(db, BOOKINGS_COL),
            where('studentId', '==', booking.studentId),
            where('weekId', '==', booking.weekId)
        );
        const weekSnapshot = await getDocs(weekQ);
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
        const snap = await getDocs(collection(db, 'settings'));
        if (snap.empty) return { forceShowNextWeek: false, forceCloseBookings: false };

        const configDoc = snap.docs.find(d => d.id === 'config');
        return configDoc ? (configDoc.data() as { forceShowNextWeek: boolean; forceCloseBookings: boolean }) : { forceShowNextWeek: false, forceCloseBookings: false };
    },

    async updateSettings(settings: { forceShowNextWeek?: boolean; forceCloseBookings?: boolean }) {
        await setDoc(doc(db, 'settings', 'config'), settings, { merge: true });
    },

    async clearAllBookings() {
        const snapshot = await getDocs(collection(db, BOOKINGS_COL));
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
        const snapshot = await getDocs(collection(db, 'feedbacks'));
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
