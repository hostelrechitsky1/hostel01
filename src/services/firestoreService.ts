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

        log("Starting Safe Seed Engine...");
        const students = parseRawStudentData(rawData);
        log(`Parsed ${students.length} students from source file.`);

        // 1. Fetch existing PINs (With Timeout)
        log("Phase 1: Downloading existing database (verify PINs)...");

        // Create a timeout promise to detect network hangs
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Network Timeout: Download took too long (>15s). Internet too slow?")), 15000)
        );

        let existingDocs;
        try {
            existingDocs = await Promise.race([
                getDocs(collection(db, STUDENTS_COL)),
                timeout
            ]);
        } catch (e: any) {
            // Provide specific actionable error messages
            if (e.message?.includes("Network Timeout")) throw e;
            throw new Error(`Download Failed: ${e.message}`);
        }

        const pinMap = new Map<string, string>(); // Room -> PIN
        existingDocs.docs.forEach(d => {
            const data = d.data() as Student;
            if (data.roomNumber && data.pin) {
                pinMap.set(data.roomNumber, data.pin);
            }
        });

        log(`Phase 1 Complete. Found ${pinMap.size} existing PINs.`);

        // 2. Generator Helper
        const generatePin = () => Math.floor(100 + Math.random() * 900).toString();

        // 3. Batch Writes
        const batchSize = 400;
        let batch = writeBatch(db);
        let count = 0;
        let batchCount = 0;
        const totalBatches = Math.ceil(students.length / batchSize);

        log(`Phase 2: Starting Upload (${totalBatches} batches)...`);

        for (const student of students) {
            // Check if this room already has a PIN from DB
            let pin = pinMap.get(student.roomNumber);

            if (!pin) {
                pin = generatePin();
                pinMap.set(student.roomNumber, pin);
            }

            student.pin = pin;

            // Add to batch
            const ref = doc(db, STUDENTS_COL, student.id);
            batch.set(ref, student, { merge: true });
            count++;

            // Commit if full
            if (count >= batchSize) {
                batchCount++;
                log(`Uploading Batch ${batchCount}/${totalBatches}...`);
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        }

        // Commit final lingering batch
        if (count > 0) {
            log(`Uploading Final Batch...`);
            await batch.commit();
        }

        log(`✅ Success! Processed ${students.length} students.`);
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
