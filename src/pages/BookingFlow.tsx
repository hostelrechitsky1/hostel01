import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import type { Machine, Booking } from '../types';
import { TIME_SLOTS } from '../types';
import { format, addDays, startOfToday, isSameDay, getWeek } from 'date-fns';
import { ChevronLeft, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import FeedbackButton from '../components/FeedbackButton';

export default function BookingFlow() {
    const navigate = useNavigate();
    const user = bookingService.getCurrentUser();
    const [selectedDate, setSelectedDate] = useState(startOfToday());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({ forceShowNextWeek: false, forceCloseBookings: false });

    // Async State
    const [machines, setMachines] = useState<Machine[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        const load = async () => {
            try {
                const [ms, bs, st] = await Promise.all([
                    firestoreService.getMachines(),
                    firestoreService.getBookings(),
                    firestoreService.getSettings()
                ]);
                setMachines(ms);
                setBookings(bs);
                setSettings(st);
            } catch (e) {
                console.error("Failed to load booking data", e);
                setError("Failed to load data. Please refresh.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user, navigate]);

    // Force Close Check
    if (settings.forceCloseBookings) {
        return (
            <div className="container flex-center" style={{
                height: '80vh',
                flexDirection: 'column',
                textAlign: 'center',
                color: 'var(--text-main)', // Use variable
                display: 'flex', // Redundant but safe
                alignItems: 'center', // Redundant but safe
                justifyContent: 'center' // Redundant but safe
            }}>
                <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    padding: '32px',
                    borderRadius: '50%',
                    marginBottom: '24px',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                    <AlertCircle size={48} color="#ef4444" />
                </div>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: 'var(--text-main)' }}>Bookings Are Closed</h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '300px', margin: '0 auto 32px', lineHeight: '1.5' }}>
                    The booking system is currently paused by the administration. Please check back later or contact the hostel manager.
                </p>
                <button
                    onClick={() => navigate('/')}
                    className="primary-button"
                    style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <ChevronLeft size={20} /> Back to Dashboard
                </button>
                <FeedbackButton />
            </div>
        );
    }

    const activeMachines = useMemo(() => machines.filter(m => m.status === 'available'), [machines]);

    // Check if bookings are open
    const isNextWeekOpen = useMemo(() => {
        if (settings.forceShowNextWeek) return true;

        const now = new Date();
        const day = now.getDay();
        const belarusHour = now.getUTCHours() + 3;

        // Auto Open Logic: Sat 16:00 -> Mon 09:00
        if (day === 6 && belarusHour >= 16) return true;
        if (day === 0) return true;
        if (day === 1 && belarusHour < 9) return true;

        return false;
    }, [settings]);

    // Generate date options
    const dateOptions = useMemo(() => {
        const today = startOfToday();
        // Calculate the end of the current week (Sunday)
        const currentWeekEnd = endOfWeek(today, { weekStartsOn: 1 }); // 1 = Monday start, so Sunday end

        let maxDate = currentWeekEnd;

        // If next week is open, extend maxDate to the end of NEXT week
        if (isNextWeekOpen) {
            maxDate = addDays(currentWeekEnd, 7);
        }

        // Generate dates from today up to maxDate
        const dates = [];
        let current = today;
        while (!isAfter(current, maxDate)) {
            dates.push(current);
            current = addDays(current, 1);
        }
        return dates;
    }, [isNextWeekOpen]);

    // Calculate availability for the selected date
    const availability = useMemo(() => {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        // Filter bookings for this date from the loaded list
        const dateBookings = bookings.filter(b => b.date === dateStr);

        const now = new Date();
        const isToday = isSameDay(selectedDate, now);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        return TIME_SLOTS.map(time => {
            const bookedMachineIds = dateBookings
                .filter(b => b.startTime === time)
                .map(b => b.machineId);

            let isPassed = false;

            if (isToday) {
                const [slotHour, slotMinute] = time.split(':').map(Number);
                if (slotHour < currentHour || (slotHour === currentHour && slotMinute < currentMinute)) {
                    isPassed = true;
                }
            }

            const isFull = bookedMachineIds.length >= activeMachines.length;

            return {
                time,
                bookedMachineIds,
                isFull,
                isPassed
            };
        });
    }, [selectedDate, activeMachines, bookings]);

    const handleBook = async () => {
        if (!selectedSlot || !selectedMachine || !user) return;
        setLoading(true); // Re-use loading or add a submitting state. Using loading is fine for modal block.

        const bookingData: Booking = {
            id: Date.now().toString(),
            machineId: selectedMachine.id,
            studentId: user.id, // Use correct field name
            date: format(selectedDate, 'yyyy-MM-dd'),
            startTime: selectedSlot,
            endTime: selectedSlot, // Placeholder or logic for end time
            weekId: `${format(selectedDate, 'yyyy')}-W${getWeek(selectedDate)}`,
            createdAt: Date.now()
        };

        try {
            const result = await firestoreService.createBooking(bookingData);

            if (result.success) {
                setShowConfirmModal(false);
                setShowConfirmation(true);
                // Optimistically update local state if needed, or just navigate
                setTimeout(() => navigate('/'), 2000);
            } else {
                setError(result.error || 'Booking failed');
                setTimeout(() => setError(''), 3000);
                setLoading(false);
            }
        } catch (e) {
            setError('System error. Please try again.');
            setLoading(false);
        }
    };

    const isWed = selectedDate.getDay() === 3;

    if (loading && !machines.length) return <div className="flex-center" style={{ height: '100vh' }}>Loading...</div>;

    return (
        <>
            <div className="container animate-fade-in" style={{ paddingBottom: '100px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <button onClick={() => navigate(-1)} className="glass-button" style={{ borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ChevronLeft size={24} />
                    </button>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Select a Slot</h2>
                </div>

                {/* Date Selector */}
                <div style={{ display: 'flex', overflowX: 'auto', gap: '12px', paddingBottom: '16px', marginBottom: '16px' }}>
                    {dateOptions.map(date => {
                        const isSelected = isSameDay(date, selectedDate);
                        const isDateWed = date.getDay() === 3; // 0=Sun, 3=Wed
                        return (
                            <button
                                key={date.toISOString()}
                                onClick={() => { setSelectedDate(date); setSelectedSlot(null); setSelectedMachine(null); }}
                                className={clsx('glass-panel')}
                                style={{
                                    minWidth: '80px',
                                    padding: '16px 12px',
                                    borderRadius: '16px',
                                    background: isSelected ? 'var(--primary)' : 'var(--glass-bg)',
                                    border: isSelected ? 'none' : '1px solid var(--glass-border)',
                                    color: isSelected ? 'white' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    opacity: isDateWed ? 0.7 : 1
                                }}
                            >
                                <div style={{ fontSize: '12px', marginBottom: '4px', color: isDateWed ? '#ef4444' : 'inherit' }}>
                                    {isDateWed ? 'Maint' : format(date, 'EEE')}
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 700 }}>{format(date, 'd')}</div>
                            </button>
                        );
                    })}
                </div>

                {isWed ? (
                    <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', borderRadius: '24px' }}>
                        <div style={{ background: 'rgba(239, 68, 68, 0.2)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <AlertCircle size={32} color="#ef4444" />
                        </div>
                        <h3>Maintenance Day</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Washing machines are closed for service on Wednesdays.</p>
                    </div>
                ) : (
                    <>
                        {/* Slots List */}
                        <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Available Times</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {availability.map(({ time, bookedMachineIds, isFull, isPassed }) => (
                                <div key={time}>
                                    <button
                                        disabled={isFull || isPassed}
                                        onClick={() => {
                                            if (!isFull && !isPassed) {
                                                setSelectedSlot(time);
                                                if (selectedSlot === time) {
                                                    setSelectedSlot(null);
                                                } else {
                                                    setSelectedSlot(time);
                                                    setSelectedMachine(null);
                                                }
                                            }
                                        }}
                                        className="glass-panel"
                                        style={{
                                            width: '100%',
                                            padding: '20px',
                                            borderRadius: '16px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            textAlign: 'left',
                                            opacity: (isFull || isPassed) ? 0.5 : 1,
                                            border: selectedSlot === time ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                                            cursor: (isFull || isPassed) ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <Clock size={20} color={selectedSlot === time ? 'var(--primary)' : 'var(--text-muted)'} />
                                            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', textDecoration: isPassed ? 'line-through' : 'none' }}>{time}</span>
                                        </div>
                                        <div style={{ fontSize: '14px', color: isFull ? 'var(--error)' : 'var(--success)' }}>
                                            {isPassed ? 'Passed' : isFull ? 'Full' : `${activeMachines.length - bookedMachineIds.length} Free`}
                                        </div>
                                    </button>

                                    {/* Machine Selection (Accordion) */}
                                    <AnimatePresence>
                                        {selectedSlot === time && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                style={{ overflow: 'hidden' }}
                                            >
                                                <div style={{ padding: '12px 0 12px 12px', display: 'flex', gap: '12px', overflowX: 'auto' }}>
                                                    {activeMachines.map(m => {
                                                        const isBooked = bookedMachineIds.includes(m.id);
                                                        return (
                                                            <button
                                                                key={m.id}
                                                                disabled={isBooked}
                                                                onClick={() => {
                                                                    if (!isBooked) {
                                                                        setSelectedMachine(m);
                                                                        setShowConfirmModal(true);
                                                                    }
                                                                }}
                                                                style={{
                                                                    minWidth: '100px',
                                                                    padding: '12px',
                                                                    borderRadius: '12px',
                                                                    background: isBooked
                                                                        ? 'var(--glass-bg)'
                                                                        : selectedMachine?.id === m.id ? 'var(--primary)' : 'var(--glass-button-bg)',
                                                                    border: isBooked ? '1px solid var(--glass-border)' : 'none',
                                                                    color: isBooked ? 'var(--text-muted)' : 'var(--text-main)',
                                                                    cursor: isBooked ? 'not-allowed' : 'pointer',
                                                                    opacity: isBooked ? 0.6 : 1,
                                                                    position: 'relative'
                                                                }}
                                                            >
                                                                {m.name}
                                                                {isBooked && <div style={{ fontSize: '10px', marginTop: '4px' }}>(Booked)</div>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Confirmation Modal (popup) */}
            {showConfirmModal && selectedSlot && selectedMachine && !isWed && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="glass-panel"
                        style={{ padding: '32px', borderRadius: '24px', textAlign: 'center', maxWidth: '320px' }}
                    >
                        <h3 style={{ margin: '0 0 16px' }}>Confirm Booking?</h3>
                        <p style={{ color: 'var(--text-muted)', margin: '0 0 8px' }}>
                            {format(selectedDate, 'EEEE, MMM d')} at {selectedSlot}
                        </p>
                        <p style={{ fontWeight: 600, margin: '0 0 24px' }}>{selectedMachine.name}</p>
                        {error && (
                            <div style={{ color: 'var(--error)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <AlertCircle size={16} /> {error}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                className="glass-button"
                                style={{ padding: '12px 24px', borderRadius: '12px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBook}
                                className="primary-button"
                                style={{ padding: '12px 24px', borderRadius: '12px' }}
                            >
                                {loading ? '...' : 'Confirm'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}


            {/* Success Modal */}
            {showConfirmation && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150
                }}>
                    <motion.div
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="glass-panel"
                        style={{ padding: '40px', borderRadius: '24px', textAlign: 'center' }}
                    >
                        <div style={{
                            background: 'rgba(16, 185, 129, 0.2)', width: '80px', height: '80px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                        }}>
                            <CheckCircle size={40} color="#10b981" />
                        </div>
                        <h2 style={{ margin: 0 }}>Booking Confirmed!</h2>
                        <p style={{ color: 'var(--text-muted)' }}>See you in the laundry room.</p>
                    </motion.div>
                </div>
            )}


            {/* Feedback FAB */}
            {/* Feedback FAB */}
            <FeedbackButton />
        </>
    );
}
