import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { DEFAULT_APP_SETTINGS, firestoreService } from '../services/firestoreService';
import type { AppSettings, Booking, Machine } from '../types';
import { TIME_SLOTS } from '../types';
import { isAfter } from 'date-fns';
import { Clock, ChevronLeft, AlertCircle, Activity } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { DataLoadNotice } from '../components/DataLoadNotice';
import {
    addBelarusDays,
    formatBelarusDate,
    formatBelarusMonthDayLabel,
    formatBelarusWeekdayLabel,
    getBelarusDate,
    getBelarusNow,
    getBelarusWeekEnd,
    getBelarusWeekStart,
    getBelarusWeekday,
    getBelarusWeekId,
    isAutoBookingWindowOpen,
    isSameBelarusDay,
    getNextAutoOpenDate,
    getAutoOpenWindowDisplay
} from '../utils/time';
import { preloadDashboardRoute } from '../utils/preloadRoutes';
import { useSlowLoadFlag } from '../utils/useSlowLoadFlag';
import { hapticSelection, hapticSoftPulse, hapticSuccess } from '../utils/haptics';

const LazyConfetti = lazy(() => import('react-confetti'));

const upsertBooking = (bookings: Booking[], nextBooking: Booking) => {
    const withoutExisting = bookings.filter((booking) => booking.id !== nextBooking.id);
    return [...withoutExisting, nextBooking];
};

export default function BookingFlow() {
    const navigate = useNavigate();
    const user = bookingService.getCurrentUser();
    const userId = user?.id ?? '';
    const bookingWeekIds = useMemo(() => {
        const currentWeekStart = getBelarusWeekStart(getBelarusDate());
        return [
            getBelarusWeekId(currentWeekStart),
            getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
        ];
    }, []);
    const cachedMachines = useMemo(() => firestoreService.getCachedMachines(), []);
    const cachedWeekBookings = useMemo(() => firestoreService.getCachedBookingsForWeekIds(bookingWeekIds), [bookingWeekIds]);
    const cachedSettings = useMemo(() => firestoreService.getCachedSettings(), []);
    const hasCachedMachines = cachedMachines !== undefined;
    const hasCachedWeekBookings = cachedWeekBookings !== undefined;

    // Hooks must be called unconditionally
    const [selectedDate, setSelectedDate] = useState(getBelarusDate());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [loading, setLoading] = useState(() => Boolean(userId) && (!hasCachedMachines || !hasCachedWeekBookings));
    const [submitting, setSubmitting] = useState(false);
    const [settings, setSettings] = useState<AppSettings>(() => cachedSettings ?? DEFAULT_APP_SETTINGS);
    const [reloadKey, setReloadKey] = useState(0);
    const [loadIssue, setLoadIssue] = useState<'saved' | 'error' | null>(null);
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

    // Async State
    const [machines, setMachines] = useState<Machine[]>(() => cachedMachines ?? []);
    const [bookings, setBookings] = useState<Booking[]>(() => cachedWeekBookings ?? []);
    const hasBookingSnapshot = hasCachedMachines
        || hasCachedWeekBookings
        || machines.length > 0
        || bookings.length > 0;
    const bookingLoadSlow = useSlowLoadFlag(loading, 4500);
    const bookingSnapshotRef = useRef(hasBookingSnapshot);

    useEffect(() => {
        bookingSnapshotRef.current = hasBookingSnapshot;
    }, [hasBookingSnapshot]);

    useEffect(() => {
        if (!bookingLoadSlow || !loading || !hasBookingSnapshot) {
            return;
        }

        setLoadIssue('saved');
        setLoadErrorMessage('Showing saved slot data while live availability reconnects in the background.');
        setLoading(false);
    }, [bookingLoadSlow, hasBookingSnapshot, loading]);

    useEffect(() => {
        if (!userId) {
            navigate('/login');
            return;
        }
        preloadDashboardRoute();

        let isMounted = true;
        let machinesReady = hasCachedMachines;
        let bookingsReady = hasCachedWeekBookings;

        const finishLoadingIfReady = () => {
            if (isMounted && machinesReady && bookingsReady) {
                setLoadIssue(null);
                setLoadErrorMessage(null);
                setLoading(false);
            }
        };

        const handleBookingLoadError = (label: string, error: unknown) => {
            console.error(label, error);
            if (!isMounted) return;
            setLoadErrorMessage('We could not refresh live slot data right now. Retry to reconnect.');
            setLoadIssue(bookingSnapshotRef.current ? 'saved' : 'error');
            setLoading(false);
        };

        finishLoadingIfReady();

        const unsubscribeMachines = firestoreService.subscribeToMachines((nextMachines) => {
            if (!isMounted) return;
            machinesReady = true;
            startTransition(() => {
                setMachines(nextMachines);
            });
            finishLoadingIfReady();
        }, (error) => {
            handleBookingLoadError('Machine fetching error:', error);
        });

        const unsubscribeBookings = firestoreService.subscribeToBookingsForWeekIds(bookingWeekIds, (nextBookings) => {
            if (!isMounted) return;
            bookingsReady = true;
            startTransition(() => {
                setBookings(nextBookings);
            });
            finishLoadingIfReady();
        }, (error) => {
            handleBookingLoadError('Booking streaming error:', error);
        });

        void firestoreService.getSettings()
            .then((nextSettings) => {
                if (!isMounted) return;
                startTransition(() => {
                    setSettings(nextSettings);
                });
            })
            .catch((error) => {
                console.error('Failed to load booking settings', error);
                toast.error('Failed to load booking settings. Using saved defaults.');
            });

        return () => {
            isMounted = false;
            unsubscribeBookings();
            unsubscribeMachines();
        };
    }, [bookingWeekIds, hasCachedMachines, hasCachedWeekBookings, navigate, reloadKey, userId]);

    const isNextWeekOpen = settings.forceShowNextWeek || isAutoBookingWindowOpen(new Date(), settings);

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

    useEffect(() => {
        if (showConfirmation) {
            hapticSuccess();
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

        const startTime = selectedSlot;

        // Stale Tab Validation: Prevent booking past slots if UI was left open
        if (isSameBelarusDay(selectedDate, getBelarusDate())) {
            const now = getBelarusNow();
            const [h, m] = startTime.split(':').map(Number);
            if (h < now.getUTCHours() || (h === now.getUTCHours() && m < now.getUTCMinutes())) {
                toast.error('This slot has already passed. Please refresh.');
                setSubmitting(false);
                return;
            }
        }

        const [h, m] = startTime.split(':').map(Number);
        const endMinutes = h * 60 + m + 90;
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

        const bookingData: Booking = {
            id: Date.now().toString(),
            machineId: selectedMachine.id,
            studentId: user.id,
            studentName: user.name,
            roomNumber: user.roomNumber,
            date: formatBelarusDate(selectedDate),
            startTime,
            endTime,
            weekId: getBelarusWeekId(selectedDate),
            createdAt: Date.now()
        };

        try {
            const result = await firestoreService.createBooking(bookingData);
            if (result.success) {
                const createdSlotId = `${bookingData.date}_${bookingData.machineId}_${bookingData.startTime.replace(':', '-')}`;
                startTransition(() => {
                    setBookings((currentBookings) => upsertBooking(currentBookings, { ...bookingData, id: createdSlotId }));
                });
                setShowConfirmModal(false);
                setShowConfirmation(true);
                setSelectedMachine(null);
            } else {
                toast.error(result.error || 'Booking failed');
            }
        } catch (e: any) {
            console.error('Booking transaction failed:', e);
            console.error('Error details:', e.message, e.code);
            toast.error(`System error: ${e.message || 'Please try again.'}`);
        } finally {
            setSubmitting(false);
        }
    };

    const maintenanceDay = typeof settings.maintenanceDay === 'number' ? settings.maintenanceDay : 3;
    const isMaintenanceDay = getBelarusWeekday(selectedDate) === maintenanceDay;
    const maintenanceDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][maintenanceDay];
    const retryBookingData = () => {
        if (hasBookingSnapshot) {
            setLoadIssue('saved');
            setLoadErrorMessage('Reconnecting to live slot updates...');
        } else {
            setLoadIssue(null);
            setLoadErrorMessage(null);
            setLoading(true);
        }
        setReloadKey((current) => current + 1);
    };

    // --- RENDER ---
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        if (!settings) return;
        if (settings.forceCloseBookings) return;

        const targetTime = getNextAutoOpenDate(new Date(), settings).getTime();

        const calculateTimeLeft = () => {
            const now = new Date().getTime(); // use real local epoch time
            const difference = targetTime - now;

            if (difference > 0) {
                setTimeLeft({
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60)
                });
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            }
        };

        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000);
        return () => clearInterval(timer);
    }, [settings]);

    const windowDisplay = getAutoOpenWindowDisplay(settings);

    const showBlockingBookingNotice = (loading && bookingLoadSlow && !hasBookingSnapshot)
        || (!loading && loadIssue === 'error' && !hasBookingSnapshot);

    if (loading && !showBlockingBookingNotice) {
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

    if (showBlockingBookingNotice) {
        return (
            <div
                className="container animate-fade-in flex-center"
                style={{ minHeight: '100vh', padding: '24px', textAlign: 'left' }}
            >
                <DataLoadNotice
                    tone="error"
                    title={bookingLoadSlow ? 'Booking page is taking longer than usual' : 'Unable to load live booking data'}
                    description={loadErrorMessage ?? 'Retry to reconnect and fetch the latest machine availability.'}
                    onRetry={retryBookingData}
                    retryLabel="Retry Slots"
                />
            </div>
        );
    }

    if (settings.forceCloseBookings || !isNextWeekOpen) {
        return (
            <div className="container flex-center" style={{
                minHeight: '80vh',
                flexDirection: 'column',
                textAlign: 'center',
                color: 'var(--text-main)',
                padding: '20px'
            }}>
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, type: 'spring' }}
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '32px',
                        borderRadius: '50%',
                        marginBottom: '24px',
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                    <AlertCircle size={48} color="#ef4444" />
                </motion.div>

                <h2 style={{ fontSize: '28px', marginBottom: '12px', fontWeight: 700 }}>
                    {settings.forceCloseBookings ? 'Bookings Are Paused' : 'Bookings Are Currently Closed'}
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '16px' }}>
                    {settings.forceCloseBookings
                        ? 'Temporarily disabled by admin.'
                        : `Open ${windowDisplay.openDay} ${windowDisplay.openTime} - ${windowDisplay.closeDay} ${windowDisplay.closeTime}.`}
                </p>

                {!settings.forceCloseBookings && (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '12px',
                            marginBottom: '48px',
                            justifyContent: 'center'
                        }}
                    >
                        {[
                            { label: 'Days', value: timeLeft.days },
                            { label: 'Hours', value: timeLeft.hours },
                            { label: 'Minutes', value: timeLeft.minutes },
                            { label: 'Seconds', value: timeLeft.seconds }
                        ].map((item, index) => (
                            <div key={index} style={{
                                background: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '16px',
                                padding: '12px 16px',
                                minWidth: '70px',
                                flex: '1 1 auto',
                                maxWidth: '90px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{
                                    height: '32px',
                                    width: '100%',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    marginBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}>
                                    <AnimatePresence mode="popLayout">
                                        <motion.span
                                            key={item.value}
                                            initial={{ y: 20, opacity: 0, filter: 'blur(4px)' }}
                                            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                                            exit={{ y: -20, opacity: 0, filter: 'blur(4px)' }}
                                            transition={{
                                                type: 'spring',
                                                stiffness: 300,
                                                damping: 25,
                                                mass: 0.8
                                            }}
                                            style={{
                                                fontSize: '32px',
                                                fontWeight: 800,
                                                color: 'var(--primary)',
                                                lineHeight: 1,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}
                                        >
                                            {String(item.value).padStart(2, '0')}
                                        </motion.span>
                                    </AnimatePresence>
                                </div>
                                <span style={{
                                    fontSize: '12px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    color: 'var(--text-muted)'
                                }}>
                                    {item.label}
                                </span>
                            </div>
                        ))}
                    </motion.div>
                )}

                <button
                    onClick={() => navigate('/')}
                    className="primary-button"
                    style={{
                        padding: '16px 32px',
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '16px',
                        fontWeight: 600
                    }}
                >
                    <ChevronLeft size={20} /> Back to Dashboard
                </button>
            </div>
        );
    }

    const modalRoot = typeof document !== 'undefined' ? document.body : null;
    const confettiWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const confettiHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '100px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button
                    onClick={() => navigate(-1)}
                    onMouseEnter={preloadDashboardRoute}
                    onTouchStart={preloadDashboardRoute}
                    className="glass-button"
                    style={{ borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <ChevronLeft size={24} />
                </button>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Select a Slot</h2>
            </div>

            {loadIssue === 'saved' && (
                <div style={{ marginBottom: '16px' }}>
                    <DataLoadNotice
                        compact
                        title="Showing saved slot data"
                        description={loadErrorMessage ?? 'Live slot availability is reconnecting in the background. You can keep browsing.'}
                        onRetry={retryBookingData}
                        retryLabel="Refresh Slots"
                    />
                </div>
            )}

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
                    marginBottom: '20px',
                    padding: '20px',
                    borderRadius: '16px',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                }}>
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                padding: '12px',
                                borderRadius: '14px',
                                display: 'flex',
                                position: 'relative'
                            }}>
                                <div className="skeleton-pulse" style={{
                                    position: 'absolute', inset: 0, borderRadius: '14px',
                                    background: 'var(--success)', opacity: 0.25, zIndex: 0
                                }}></div>
                                <Activity size={24} color="var(--success)" style={{ zIndex: 1 }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>Live Capacity</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: 'var(--success)',
                                        boxShadow: '0 0 10px var(--success)'
                                    }}></span>
                                    Slots Available
                                </div>
                            </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>For Selected Day</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
                                    {totalRemainingForDay}
                                </span>
                                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                                    / {TIME_SLOTS.length * totalSlotsPerTime}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, height: '4px',
                        background: 'var(--glass-border)', width: '100%'
                    }}>
                        <div style={{
                            height: '100%',
                            background: 'var(--success)',
                            width: `${Math.max(2, (totalRemainingForDay / Math.max(1, TIME_SLOTS.length * totalSlotsPerTime)) * 100)}%`,
                            transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 0 12px rgba(16, 185, 129, 0.5)'
                        }}></div>
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
                                                hapticSelection();
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
                                                            hapticSoftPulse();
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
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'none' }}>
                                <Suspense fallback={null}>
                                    <LazyConfetti
                                        width={confettiWidth}
                                        height={confettiHeight}
                                        recycle={false}
                                        numberOfPieces={400}
                                        gravity={0.15}
                                        colors={['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']}
                                    />
                                </Suspense>
                            </div>
                            <div className="glass-panel modal-card modal-card--success" style={{ zIndex: 100 }}>
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
