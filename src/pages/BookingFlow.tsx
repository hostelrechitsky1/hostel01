import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import type { Machine } from '../types';
import { TIME_SLOTS } from '../types';
import { format, addDays, startOfToday, isSameDay } from 'date-fns';
import { ChevronLeft, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export default function BookingFlow() {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(startOfToday());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [error, setError] = useState('');


    const machines = bookingService.getMachines();
    const activeMachines = machines.filter(m => m.status === 'available');

    // Check if next week bookings are open (Saturday 2PM Belarus time = UTC+3)
    const isNextWeekOpen = useMemo(() => {
        const now = new Date();
        // Get current day (0=Sun, 6=Sat)
        const day = now.getDay();
        // Get current hour in Belarus (UTC+3)
        const belarusHour = now.getUTCHours() + 3;

        // Saturday (day=6) and 2PM (14:00) or later
        if (day === 6 && belarusHour >= 14) return true;
        // Sunday (day=0) is after Saturday 2PM
        if (day === 0) return true;
        return false;
    }, []);

    // Generate date options: current week (7 days) + next week (7 days) if open
    const dateOptions = useMemo(() => {
        const days = isNextWeekOpen ? 14 : 7;
        return Array.from({ length: days }, (_, i) => addDays(startOfToday(), i));
    }, [isNextWeekOpen]);

    // Calculate availability for the selected date
    const availability = useMemo(() => {
        const bookings = bookingService.getBookingsForDate(format(selectedDate, 'yyyy-MM-dd'));

        return TIME_SLOTS.map(time => {
            // Find machines booked at this time
            const bookedMachineIds = bookings
                .filter(b => b.startTime === time)
                .map(b => b.machineId);

            const isFull = bookedMachineIds.length >= activeMachines.length;

            return {
                time,
                bookedMachineIds,
                isFull
            };
        });
    }, [selectedDate, activeMachines]);

    const handleBook = () => {
        if (!selectedSlot || !selectedMachine) return;

        const result = bookingService.createBooking(
            selectedMachine.id,
            format(selectedDate, 'yyyy-MM-dd'),
            selectedSlot
        );

        if (result.success) {
            setShowConfirmModal(false);
            setShowConfirmation(true);
            setTimeout(() => navigate('/'), 2000);
        } else {
            setError(result.error || 'Booking failed');
            setTimeout(() => setError(''), 3000);
        }
    };

    const isWed = selectedDate.getDay() === 3;

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
                            {availability.map(({ time, bookedMachineIds, isFull }) => (
                                <div key={time}>
                                    <button
                                        disabled={isFull}
                                        onClick={() => {
                                            if (!isFull) {
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
                                            opacity: isFull ? 0.5 : 1,
                                            border: selectedSlot === time ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                                            cursor: isFull ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <Clock size={20} color={selectedSlot === time ? 'var(--primary)' : 'var(--text-muted)'} />
                                            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>{time}</span>
                                        </div>
                                        <div style={{ fontSize: '14px', color: isFull ? 'var(--error)' : 'var(--success)' }}>
                                            {isFull ? 'Full' : `${activeMachines.length - bookedMachineIds.length} Free`}
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
                                Confirm
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
        </>
    );
}
