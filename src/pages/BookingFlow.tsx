import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import type { Machine, Booking } from '../types';
import { TIME_SLOTS } from '../types';
import { format, addDays, startOfToday, isSameDay, getWeek, endOfWeek, isAfter } from 'date-fns';

// SAFE MODE: No Icons, No clsx, No Framer Motion. Pure React.

export default function BookingFlow() {
    console.log('--- BookingFlow Render Start ---');
    const navigate = useNavigate();
    const user = bookingService.getCurrentUser();

    // Hooks must be called unconditionally
    const [selectedDate, setSelectedDate] = useState(startOfToday());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    // const [showConfirmation, setShowConfirmation] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [settings, setSettings] = useState({ forceShowNextWeek: false, forceCloseBookings: false });

    const [machines, setMachines] = useState<Machine[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);

    useEffect(() => {
        console.log('BookingFlow: Mount/UserCheck');
        if (!user) {
            console.log('BookingFlow: No user, redirecting');
            navigate('/login');
            return;
        }
        const load = async () => {
            console.log('BookingFlow: Starting async load');
            try {
                const [ms, bs, st] = await Promise.all([
                    firestoreService.getMachines(),
                    firestoreService.getBookings(),
                    firestoreService.getSettings()
                ]);
                console.log('BookingFlow: Loaded Data', { machines: ms.length, bookings: bs.length, settings: st });
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

    const isNextWeekOpen = useMemo(() => {
        if (settings.forceShowNextWeek) return true;
        const now = new Date();
        const day = now.getDay();
        const belarusHour = now.getUTCHours() + 3;
        if (day === 6 && belarusHour >= 16) return true;
        if (day === 0) return true;
        if (day === 1 && belarusHour < 9) return true;
        return false;
    }, [settings]);

    const activeMachines = useMemo(() => machines.filter(m => m.status === 'available'), [machines]);

    const dateOptions = useMemo(() => {
        let start = startOfToday();
        const currentWeekEnd = endOfWeek(start, { weekStartsOn: 1 });
        let maxDate = currentWeekEnd;

        if (isNextWeekOpen) {
            const nextMonday = addDays(currentWeekEnd, 1);
            if (!isAfter(start, currentWeekEnd)) {
                start = nextMonday;
            }
            maxDate = addDays(currentWeekEnd, 7);
        }

        const dates = [];
        let current = start;
        while (!isAfter(current, maxDate)) {
            dates.push(current);
            current = addDays(current, 1);
        }
        return dates;
    }, [isNextWeekOpen]);

    useEffect(() => {
        if (dateOptions.length > 0) {
            const isSelectedValid = dateOptions.some(d => isSameDay(d, selectedDate));
            if (!isSelectedValid) {
                setSelectedDate(dateOptions[0]);
            }
        }
    }, [dateOptions, selectedDate]);

    const availability = useMemo(() => {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
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
            // Simple Logic check
            if (isToday) {
                const [slotHour, slotMinute] = time.split(':').map(Number);
                if (slotHour < currentHour || (slotHour === currentHour && slotMinute < currentMinute)) {
                    isPassed = true;
                }
            }
            const isFull = bookedMachineIds.length >= activeMachines.length;
            return { time, bookedMachineIds, isFull, isPassed };
        });
    }, [selectedDate, activeMachines, bookings]);

    const handleBook = async () => {
        if (!selectedSlot || !selectedMachine || !user || submitting) return;
        setSubmitting(true);
        console.log('BookingFlow: Submitting booking...');

        const bookingData: Booking = {
            id: Date.now().toString(),
            machineId: selectedMachine.id,
            studentId: user.id,
            studentName: user.name,
            roomNumber: user.roomNumber,
            date: format(selectedDate, 'yyyy-MM-dd'),
            startTime: selectedSlot,
            endTime: selectedSlot,
            weekId: `${format(selectedDate, 'yyyy')}-W${getWeek(selectedDate)}`,
            createdAt: Date.now()
        };

        try {
            const result = await firestoreService.createBooking(bookingData);
            if (result.success) {
                setShowConfirmModal(false);
                // setShowConfirmation(true);
                setTimeout(() => navigate('/'), 2000);
            } else {
                setError(result.error || 'Booking failed');
                setTimeout(() => setError(''), 3000);
            }
        } catch (e) {
            setError('System error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const isWed = selectedDate.getDay() === 3;

    // --- RENDER ---
    console.log('BookingFlow: Rendering Return Block. Loading:', loading, 'Closed:', !isNextWeekOpen && !settings.forceCloseBookings ? 'AutoClosed' : 'Open');

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>
                <h1>Loading Booking Data...</h1>
            </div>
        );
    }

    if (settings.forceCloseBookings || !isNextWeekOpen) {
        return (
            <div className="container" style={{ padding: '20px', textAlign: 'center', color: 'white' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                    <h2>Bookings Are Closed 🔒</h2>
                    <p>{settings.forceCloseBookings ? 'Paused by admin.' : 'Open Saturday 16:00 - Monday 09:00.'}</p>
                </div>
                <button onClick={() => navigate('/')} className="primary-button" style={{ padding: '10px 20px', borderRadius: '8px' }}>
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="container" style={{ paddingBottom: '100px', color: 'white' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button onClick={() => navigate(-1)} className="glass-button" style={{ borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ⬅️
                </button>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Select a Slot</h2>
            </div>

            <div style={{ color: 'lime', fontSize: '10px', marginBottom: '10px' }}>✅ DEBUG: Flow Active</div>

            {/* Date Selector */}
            {dateOptions.length === 0 ? (
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>No dates available.</div>
            ) : (
                <div style={{ display: 'flex', overflowX: 'auto', gap: '12px', paddingBottom: '16px', marginBottom: '16px' }}>
                    {dateOptions.map(date => {
                        const isSelected = isSameDay(date, selectedDate);
                        const isDateWed = date.getDay() === 3;
                        return (
                            <button
                                key={date.toISOString()}
                                onClick={() => { setSelectedDate(date); setSelectedSlot(null); setSelectedMachine(null); }}
                                className="glass-panel"
                                style={{
                                    minWidth: '80px',
                                    padding: '16px 12px',
                                    borderRadius: '16px',
                                    background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                    border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                    color: isSelected ? 'white' : '#94a3b8',
                                    cursor: 'pointer',
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
            )}

            {isWed ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', borderRadius: '24px' }}>
                    <h3>⚠️ Maintenance Day</h3>
                    <p style={{ color: '#94a3b8' }}>Closed on Wednesdays.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {availability.map(({ time, bookedMachineIds, isFull, isPassed }) => (
                        <div key={time} style={{ marginBottom: '10px' }}>
                            <button
                                disabled={isFull || isPassed}
                                onClick={() => {
                                    if (!isFull && !isPassed) {
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
                                    border: selectedSlot === time ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
                                    cursor: (isFull || isPassed) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <span style={{ fontSize: '18px', fontWeight: 600 }}>{time}</span>
                                <span style={{ fontSize: '14px', color: isFull ? 'var(--error)' : 'var(--success)' }}>
                                    {isPassed ? 'Passed' : isFull ? 'Full' : `${activeMachines.length - bookedMachineIds.length} Free`}
                                </span>
                            </button>

                            {/* Machines */}
                            {selectedSlot === time && (
                                <div style={{ padding: '12px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
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
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    background: isBooked ? 'rgba(255,255,255,0.05)' : selectedMachine?.id === m.id ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                                    border: 'none',
                                                    color: 'white',
                                                    cursor: isBooked ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {m.name} {isBooked ? '(Booked)' : ''}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Confirm Modal */}
            {showConfirmModal && selectedSlot && selectedMachine && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div className="glass-panel" style={{ padding: '30px', borderRadius: '20px', textAlign: 'center', minWidth: '280px', background: '#1e1b4b' }}>
                        <h3>Confirm Booking?</h3>
                        <p>{format(selectedDate, 'MMM d')} at {selectedSlot} on {selectedMachine.name}</p>
                        {error && <p style={{ color: 'red' }}>{error}</p>}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                            <button onClick={() => setShowConfirmModal(false)} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleBook} disabled={submitting}
                                style={{
                                    padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                                    background: 'var(--primary)', color: 'white'
                                }}
                            >
                                {submitting ? 'Processing...' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
