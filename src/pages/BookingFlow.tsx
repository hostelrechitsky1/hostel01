import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import type { Machine, Booking, AppSettings } from '../types';
import { TIME_SLOTS } from '../types';
import { isAfter } from 'date-fns';
import { ChevronLeft, Clock, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
    addBelarusDays,
    formatBelarusDate,
    formatBelarusMonthDayLabel,
    formatBelarusWeekdayLabel,
    getBelarusDate,
    getBelarusNow,
    getBelarusWeekEnd,
    getBelarusWeekday,
    getBelarusWeekId,
    isAutoBookingWindowOpen,
    isSameBelarusDay
} from '../utils/time';

export default function BookingFlow() {
    const navigate = useNavigate();
    const user = bookingService.getCurrentUser();

    // Hooks must be called unconditionally
    const [selectedDate, setSelectedDate] = useState(getBelarusDate());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [settings, setSettings] = useState<Partial<AppSettings>>({ forceShowNextWeek: false, forceCloseBookings: false, maintenanceDay: 3 });

    // Async State
    const [machines, setMachines] = useState<Machine[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        let unsubscribeBookings = () => { };
        let unsubscribeMachines = () => { };

        const load = async () => {
            try {
                const st = await firestoreService.getSettings();
                setSettings(st);

                unsubscribeMachines = firestoreService.subscribeToMachines((ms) => {
                    setMachines(ms);
                });

                unsubscribeBookings = firestoreService.subscribeToBookings((bs) => {
                    setBookings(bs);
                    setLoading(false);
                });
            } catch (e) {
                console.error("Failed to load booking data", e);
                setError("Failed to load data. Please refresh.");
                setLoading(false);
            }
        };
        load();

        return () => {
            unsubscribeBookings();
            unsubscribeMachines();
        };
    }, [user, navigate]);

    const isNextWeekOpen = useMemo(() => {
        if (settings.forceShowNextWeek) return true;
        return isAutoBookingWindowOpen();
    }, [settings.forceShowNextWeek]);

    const activeMachines = useMemo(() => machines.filter(m => m.status === 'available'), [machines]);

    const dateOptions = useMemo(() => {
        let start = getBelarusDate();
        const currentWeekEnd = getBelarusWeekEnd(start);
        let maxDate = currentWeekEnd;

        if (isNextWeekOpen) {
            const nextMonday = addBelarusDays(currentWeekEnd, 1);
            if (!isAfter(start, currentWeekEnd)) {
                start = nextMonday;
            }
            maxDate = addBelarusDays(currentWeekEnd, 7);
        }

        const dates = [];
        let current = start;
        while (!isAfter(current, maxDate)) {
            dates.push(current);
            current = addBelarusDays(current, 1);
        }
        return dates;
    }, [isNextWeekOpen]);

    useEffect(() => {
        if (dateOptions.length > 0) {
            const isSelectedValid = dateOptions.some(d => isSameBelarusDay(d, selectedDate));
            if (!isSelectedValid) {
                setSelectedDate(dateOptions[0]);
            }
        }
    }, [dateOptions, selectedDate]);

    // Scroll Lock when modal is open
    useEffect(() => {
        if (showConfirmModal || showConfirmation) {
            document.body.style.overflow = 'hidden';
            // Also prevent touchmove to stop iOS scroll rubber-banding
            document.body.style.touchAction = 'none';
        } else {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        };
    }, [showConfirmModal, showConfirmation]);

    const triggerHaptic = (pattern: number | number[]) => {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    };

    useEffect(() => {
        if (showConfirmation) {
            triggerHaptic([30, 40, 30, 60, 30]);
        }
    }, [showConfirmation]);

    useEffect(() => {
        if (!showConfirmation) return;
        const timer = window.setTimeout(() => setShowConfirmation(false), 1800);
        return () => window.clearTimeout(timer);
    }, [showConfirmation]);

    const availability = useMemo(() => {
        const dateStr = formatBelarusDate(selectedDate);
        const dateBookings = bookings.filter(b => b.date === dateStr);
        const now = getBelarusNow();
        const isToday = isSameBelarusDay(selectedDate, getBelarusDate());
        const currentHour = now.getUTCHours();
        const currentMinute = now.getUTCMinutes();

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


    const totalSlotsPerTime = activeMachines.length;
    const totalRemainingForDay = useMemo(() => {
        return availability.reduce((sum, slot) => {
            if (slot.isPassed) return sum;
            const remaining = Math.max(totalSlotsPerTime - slot.bookedMachineIds.length, 0);
            return sum + remaining;
        }, 0);
    }, [availability, totalSlotsPerTime]);

    const handleBook = async () => {
        if (!selectedSlot || !selectedMachine || !user || submitting) return;
        setSubmitting(true);

        const bookingData: Booking = {
            id: Date.now().toString(),
            machineId: selectedMachine.id,
            studentId: user.id,
            studentName: user.name,
            roomNumber: user.roomNumber,
            date: formatBelarusDate(selectedDate),
            startTime: selectedSlot,
            endTime: selectedSlot,
            weekId: getBelarusWeekId(selectedDate),
            createdAt: Date.now()
        };

        try {
            const result = await firestoreService.createBooking(bookingData);
            if (result.success) {
                const createdSlotId = `${bookingData.date}_${bookingData.machineId}_${bookingData.startTime.replace(':', '-')}`;
                setBookings(prev => [...prev, { ...bookingData, id: createdSlotId }]);
                triggerHaptic([20, 40, 20, 80, 20]);
                setShowConfirmModal(false);
                setShowConfirmation(true);
                setSelectedMachine(null);
            } else {
                setError(result.error || 'Booking failed');
                setTimeout(() => setError(''), 3000);
            }
        } catch (e: any) {
            console.error('Booking transaction failed:', e);
            console.error('Error details:', e.message, e.code);
            setError(`System error: ${e.message || 'Please try again.'}`);
        } finally {
            setSubmitting(false);
        }
    };

    // Use setting or default to 3 (Wednesday)
    const maintenanceDay = typeof settings.maintenanceDay === 'number' ? settings.maintenanceDay : 3;

    // DEBUG: Log the settings to verify correct value is being used
    console.log('[BookingFlow DEBUG] settings.maintenanceDay:', settings.maintenanceDay, '| computed maintenanceDay:', maintenanceDay);

    const isMaintenanceDay = getBelarusWeekday(selectedDate) === maintenanceDay;
    const maintenanceDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][maintenanceDay];

    // --- RENDER ---
    if (loading) {
        return (
            <div className="container animate-fade-in" style={{ paddingBottom: '100px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
                    <div style={{ width: '150px', height: '28px', borderRadius: '8px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ minWidth: '80px', height: '80px', borderRadius: '16px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
                    ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ width: '100%', height: '80px', borderRadius: '16px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (settings.forceCloseBookings || !isNextWeekOpen) {
        return (
            <div className="container flex-center" style={{
                height: '80vh',
                flexDirection: 'column',
                textAlign: 'center',
                color: 'var(--text-main)'
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
                <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>
                    {settings.forceCloseBookings ? 'Bookings Are Closed' : 'Bookings Are Currently Closed'}
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                    {settings.forceCloseBookings ? 'Paused by admin.' : 'Open Saturday 16:00 - Sunday 20:00.'}
                </p>
                <button onClick={() => navigate('/')} className="primary-button" style={{ padding: '12px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ChevronLeft size={20} /> Back to Dashboard
                </button>
            </div>
        );
    }

    const modalRoot = typeof document !== 'undefined' ? document.body : null;

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '100px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button onClick={() => navigate(-1)} className="glass-button" style={{ borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={24} />
                </button>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Select a Slot</h2>
            </div>

            {/* Date Selector */}
            {dateOptions.length === 0 ? (
                <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <p>No booking dates available at this time.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', overflowX: 'auto', gap: '12px', paddingBottom: '16px', marginBottom: '16px' }}>
                    {dateOptions.map(date => {
                        const isSelected = isSameBelarusDay(date, selectedDate);
                        const isDateMaintenance = getBelarusWeekday(date) === maintenanceDay;
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
                                    opacity: isDateMaintenance ? 0.7 : 1
                                }}
                            >
                                <div style={{ fontSize: '12px', marginBottom: '4px', color: isDateMaintenance ? '#ef4444' : 'inherit' }}>
                                    {isDateMaintenance ? 'Maint' : formatBelarusWeekdayLabel(date).slice(0, 3)}
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatBelarusMonthDayLabel(date).split(' ')[1]}</div>
                            </button>
                        );
                    })}
                </div>
            )}

            {!isMaintenanceDay && (
                <div className="glass-panel" style={{
                    marginBottom: '14px',
                    padding: '14px 16px',
                    borderRadius: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)'
                }}>
                    <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Live Slot Capacity</div>
                        <div style={{ fontSize: '18px', fontWeight: 700 }}>{totalRemainingForDay} slots remaining for selected day</div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {totalSlotsPerTime} total slots per time
                    </div>
                </div>
            )}

            {isMaintenanceDay ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', borderRadius: '24px' }}>
                    <div style={{ background: 'rgba(239, 68, 68, 0.2)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <AlertCircle size={32} color="#ef4444" />
                    </div>
                    <h3>Maintenance Day</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Washing machines are closed for service on {maintenanceDayName}s.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {availability.map(({ time, bookedMachineIds, isFull, isPassed }) => {
                        const remainingSlots = Math.max(totalSlotsPerTime - bookedMachineIds.length, 0);
                        return (
                            <div key={time}>
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
                                        border: selectedSlot === time ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                                        cursor: (isFull || isPassed) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Clock size={20} color={selectedSlot === time ? 'var(--primary)' : 'var(--text-muted)'} />
                                        <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', textDecoration: isPassed ? 'line-through' : 'none' }}>{time}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '14px', color: isFull ? 'var(--error)' : 'var(--success)', fontWeight: 600 }}>
                                            {isPassed ? 'Passed' : isFull ? 'Full' : 'Open'}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            Remaining {remainingSlots}/{totalSlotsPerTime}
                                        </div>
                                    </div>
                                </button>

                                {/* Machines */}
                                {selectedSlot === time && (
                                    <div style={{ padding: '12px 0 12px 12px', display: 'flex', gap: '12px', overflowX: 'auto', animation: 'fadeIn 0.3s' }}>
                                        {activeMachines.map(m => {
                                            const bookingForMachine = bookings.find(b => b.date === formatBelarusDate(selectedDate) && b.startTime === time && b.machineId === m.id);
                                            const isBooked = Boolean(bookingForMachine);
                                            const isBookedByUser = bookingForMachine?.studentId === user?.id;
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
                                                        border: isBookedByUser ? '1px solid rgba(16, 185, 129, 0.5)' : isBooked ? '1px solid var(--glass-border)' : 'none',
                                                        color: isBookedByUser ? '#a7f3d0' : isBooked ? 'var(--text-muted)' : 'var(--text-main)',
                                                        cursor: isBooked ? 'not-allowed' : 'pointer',
                                                        opacity: isBooked ? 0.75 : 1,
                                                        position: 'relative'
                                                    }}
                                                >
                                                    {m.name}
                                                    {isBooked && <div style={{ fontSize: '10px', marginTop: '4px' }}>{isBookedByUser ? '(Booked by you)' : '(Booked)'}</div>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {modalRoot && createPortal(
                <>
                    {/* Confirm Modal */}
                    {showConfirmModal && selectedSlot && selectedMachine && (
                        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
                            <div className="glass-panel modal-card" onClick={e => e.stopPropagation()}>
                                <h3 style={{ margin: '0 0 16px' }}>Confirm Booking?</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0 0 8px' }}>
                                    {formatBelarusWeekdayLabel(selectedDate)}, {formatBelarusMonthDayLabel(selectedDate)} at {selectedSlot}
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
                                        disabled={submitting}
                                        className="primary-button"
                                        style={{
                                            padding: '12px 24px',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            opacity: submitting ? 0.7 : 1,
                                            cursor: submitting ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {submitting ? 'Processing...' : 'Confirm'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Success Modal */}
                    {showConfirmation && (
                        <div className="modal-overlay modal-overlay--success">
                            <div className="glass-panel modal-card modal-card--success">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', delay: 0.1, damping: 20, stiffness: 250 }}
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.2)', width: '80px', height: '80px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                                    }}
                                >
                                    <svg viewBox="0 0 50 50" width="40" height="40">
                                        <motion.path
                                            fill="none"
                                            stroke="#10b981"
                                            strokeWidth="5"
                                            d="M 14.1 27.2 l 7.1 7.2 16.7-16.8"
                                            initial={{ pathLength: 0 }}
                                            animate={{ pathLength: 1 }}
                                            transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </motion.div>
                                <h2 style={{ margin: 0 }}>Booking Confirmed!</h2>
                                <p style={{ color: 'var(--text-muted)' }}>Slot booked. You can continue browsing other available slots.</p>
                            </div>
                        </div>
                    )}
                </>,
                modalRoot
            )}
        </div>
    );
}
