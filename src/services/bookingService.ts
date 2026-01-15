import type { Student, Machine, Booking } from '../types';

import { getISOWeek, parseISO } from 'date-fns';

// Keys for LocalStorage
const STORAGE_KEYS = {
    BOOKINGS: 'hostel_bookings',
    MACHINES: 'hostel_machines',
    STUDENTS: 'hostel_students',
    CURRENT_USER: 'hostel_current_user'
};

// Initial Mock Data
const INITIAL_MACHINES: Machine[] = [
    { id: '1', name: 'Machine 1', status: 'available' },
    { id: '2', name: 'Machine 2', status: 'available' },
    { id: '3', name: 'Machine 3', status: 'available' },
    { id: '4', name: 'Machine 4', status: 'available' },
];

const INITIAL_STUDENTS: Student[] = [
    // Room 101 (3-seater)
    { id: 's1', name: 'Alex Johnson', roomNumber: '101' },
    { id: 's2', name: 'Bob Smith', roomNumber: '101' },
    { id: 's3', name: 'Charlie Day', roomNumber: '101' },
    // Room 102 (2-seater)
    { id: 's4', name: 'David Rose', roomNumber: '102' },
    { id: 's5', name: 'Evan Peters', roomNumber: '102' },
    // Room 205 (2-seater)
    { id: 's6', name: 'Frank Reynolds', roomNumber: '205' },
    { id: 's7', name: 'George Costanza', roomNumber: '205' },
];

class BookingService {
    // Helpers
    resetData() {
        this.set(STORAGE_KEYS.BOOKINGS, []);

        // Reset machines to default, maybe keep 4? Or just clear status?
        // Let's reset to INITIAL_MACHINES to be safe
        this.set(STORAGE_KEYS.MACHINES, INITIAL_MACHINES);

        // Also clear students? Maybe not needed for layout test, but "Reset System" usually implies factory reset.
        // Let's keep students for convenience, just clear operational data.
    }

    private get<T>(key: string, defaultValue: T): T {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    }

    private set(key: string, value: any) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // --- Students ---
    getStudents(): Student[] {
        return this.get(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    }

    login(roomNumber: string): Student[] {
        const students = this.getStudents();
        return students.filter(s => s.roomNumber === roomNumber);
    }

    setCurrentUser(student: Student) {
        this.set(STORAGE_KEYS.CURRENT_USER, student);
    }

    getCurrentUser(): Student | null {
        return this.get(STORAGE_KEYS.CURRENT_USER, null);
    }

    logout() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }

    // --- Machines ---
    getMachines(): Machine[] {
        return this.get(STORAGE_KEYS.MACHINES, INITIAL_MACHINES);
    }

    addMachine(name: string) {
        const machines = this.getMachines();
        const newMachine: Machine = {
            id: Math.random().toString(36).substr(2, 9),
            name,
            status: 'available'
        };
        this.set(STORAGE_KEYS.MACHINES, [...machines, newMachine]);
    }

    deleteMachine(id: string) {
        const machines = this.getMachines();
        const filtered = machines.filter(m => m.id !== id);
        this.set(STORAGE_KEYS.MACHINES, filtered);

        // Also delete any bookings for this machine
        const bookings = this.getBookings();
        const filteredBookings = bookings.filter(b => b.machineId !== id);
        this.set(STORAGE_KEYS.BOOKINGS, filteredBookings);
    }



    toggleMachineStatus(id: string) {
        const machines = this.getMachines();
        const newMachines = machines.map(m =>
            m.id === id ? { ...m, status: m.status === 'available' ? 'maintenance' : 'available' } : m
        );
        this.set(STORAGE_KEYS.MACHINES, newMachines);
    }

    // --- Bookings ---
    getBookings(): Booking[] {
        return this.get(STORAGE_KEYS.BOOKINGS, []);
    }

    getUpcomingBooking(): Booking | undefined {
        const user = this.getCurrentUser();
        if (!user) return undefined;

        const now = new Date();
        const bookings = this.getBookings().filter(b => b.studentId === user.id);

        return bookings
            .filter(b => {
                const bookingDateTime = parseISO(`${b.date}T${b.startTime}`);
                return bookingDateTime > now;
            })
            .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0];
    }

    getBookingsForDate(date: string): Booking[] {
        return this.getBookings().filter(b => b.date === date);
    }

    createBooking(machineId: string, date: string, startTime: string): { success: boolean, error?: string } {
        const user = this.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        const bookings = this.getBookings();

        // 1. Check if slot is taken
        const conflict = bookings.find(b =>
            b.machineId === machineId &&
            b.date === date &&
            b.startTime === startTime
        );
        if (conflict) return { success: false, error: 'Slot already booked' };

        // 2. Check Week Limit (1 per week)
        // We use ISO week to ensure consistent weeks
        const bookingDateObj = parseISO(date);
        const targetWeek = getISOWeek(bookingDateObj);
        const targetYear = bookingDateObj.getFullYear();
        const weekId = `${targetYear}-W${targetWeek}`;

        const userBookingsThisWeek = bookings.filter(b =>
            b.studentId === user.id &&
            b.weekId === weekId
        );

        // NOTE: For demo purposes, we might want to bypass this limit or make it configurable?
        // User requirement: "only allow one student one time per week"
        if (userBookingsThisWeek.length >= 1) {
            return { success: false, error: 'Weekly limit reached (1 booking per week)' };
        }

        const newBooking: Booking = {
            id: Math.random().toString(36).substr(2, 9),
            machineId,
            studentId: user.id,
            date,
            startTime,
            endTime: "calculate-later", // TODO: Add logic if needed
            weekId,
            createdAt: Date.now()
        };

        this.set(STORAGE_KEYS.BOOKINGS, [...bookings, newBooking]);
        return { success: true };
    }

    getHistory(): Booking[] {
        const user = this.getCurrentUser();
        if (!user) return [];

        const bookings = this.getBookings().filter(b => b.studentId === user.id);

        return bookings
            .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
    }

    cancelBooking(bookingId: string) {
        const bookings = this.getBookings();
        this.set(STORAGE_KEYS.BOOKINGS, bookings.filter(b => b.id !== bookingId));
    }
}

export const bookingService = new BookingService();
