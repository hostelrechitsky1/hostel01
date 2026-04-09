import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import type { Machine, Booking, Banner, AppSettings } from '../types';
import { TIME_SLOTS } from '../types';
import { Calendar, LogOut, WashingMachine as Washer, History, Download, AlertCircle, AlertTriangle, Info, Activity, CheckCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, addMinutes, parse, isAfter, isBefore, parseISO } from 'date-fns';
import DashboardFeedback from '../components/DashboardFeedback';
import BannerCarousel from '../components/BannerCarousel';
import { addBelarusDays, formatBelarusDate, getBelarusDate, getBelarusNow, getBelarusWeekStart, getBelarusWeekday, getBelarusWeekId, isAutoBookingWindowOpen } from '../utils/time';

export default function Dashboard() {
    const navigate = useNavigate();
    const user = bookingService.getCurrentUser();
    const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
    const [history, setHistory] = useState<Booking[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [allBookings, setAllBookings] = useState<Booking[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [bannersLoading, setBannersLoading] = useState(true);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<AppSettings>({
        forceShowNextWeek: false,
        forceCloseBookings: false,
        maintenanceDay: 3,
        topAlert: { message: '', isActive: false, type: 'info' }
    });
    const [quickBookModalBooking, setQuickBookModalBooking] = useState<Booking | null>(null);
    const [quickBookModalMessage, setQuickBookModalMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [quickBookingId, setQuickBookingId] = useState<string | null>(null);

    useEffect(() => {
        const ensureTop = () => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        };

        ensureTop();

        const onPageShow = () => ensureTop();
        const rafId = requestAnimationFrame(ensureTop);
        const timeoutId = window.setTimeout(ensureTop, 120);

        window.addEventListener('pageshow', onPageShow);

        return () => {
            cancelAnimationFrame(rafId);
            window.clearTimeout(timeoutId);
            window.removeEventListener('pageshow', onPageShow);
        };
    }, []);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        let unsubscribeBookings = () => { };
        let unsubscribeMachines = () => { };

        const loadData = async () => {
            try {
                const [fetchedSettings, fetchedBanners] = await Promise.all([
                    firestoreService.getSettings(),
                    firestoreService.getBanners()
                ]);

                setSettings(fetchedSettings);
                setBanners(fetchedBanners);
                setBannersLoading(false);

                unsubscribeMachines = firestoreService.subscribeToMachines((machines) => {
                    setMachines(machines);
                });

                unsubscribeBookings = firestoreService.subscribeToBookings((bookings) => {
                    setAllBookings(bookings);
                    const myBookings = bookings.filter(b => b.studentId === user.id);
                    const chronological = [...myBookings].sort((a, b) =>
                        new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime()
                    );

                    const now = getBelarusNow();
                    const futureBookings = chronological.filter(b => {
                        // Parse as UTC+3 (Belarus time) by appending +03:00
                        const end = addMinutes(parseISO(b.date + 'T' + b.startTime + '+03:00'), 90);
                        return end > now;
                    });

                    const pastBookings = chronological.filter(b => {
                        const end = addMinutes(parseISO(b.date + 'T' + b.startTime + '+03:00'), 90);
                        return end <= now;
                    }).reverse();

                    setUpcomingBookings(futureBookings);
                    setHistory(pastBookings.slice(0, 3));
                    setLoading(false);
                }, (error) => {
                    console.error("Dashboard bookings subscription error:", error);
                    setLoading(false);
                });

            } catch (err) {
                console.error("Failed to load dashboard data", err);
                setBannersLoading(false);
                setLoading(false);
            }
        };

        loadData();

        return () => {
            unsubscribeBookings();
            unsubscribeMachines();
        };
    }, [user?.id, navigate]);

    const isNextWeekOpen = settings.forceShowNextWeek || isAutoBookingWindowOpen();

    const isSystemClosed = settings.forceCloseBookings || !isNextWeekOpen;

    const getMachineRealTimeStatus = (machine: Machine) => {
        const now = getBelarusNow();
        const currentBWeekday = getBelarusWeekday(getBelarusDate());
        // Use setting or default to 3 (Wednesday)
        const maintenanceDay = settings.maintenanceDay ?? 3;
        const isMaintenanceDay = currentBWeekday === maintenanceDay;

        if (isMaintenanceDay) return { state: 'maintenance', label: 'Maintenance Day', color: '#ef4444' };
        if (machine.status === 'maintenance') return { state: 'maintenance', label: 'Under Maintenance', color: '#ef4444' };

        // Check current bookings using allBookings state
        const today = formatBelarusDate(getBelarusDate());
        const bookingsToday = allBookings.filter(b => b.date === today); // In memory filter

        const currentBooking = bookingsToday.find(b => {
            if (b.machineId !== machine.id) return false;

            const start = parse(b.startTime, 'HH:mm', now);
            const end = addMinutes(start, 90); // 90 min slots
            return isAfter(now, start) && isBefore(now, end);
        });

        if (currentBooking) {
            return { state: 'occupied', label: 'In Use', color: '#f59e0b' }; // Orange
        }

        return { state: 'available', label: 'Ready to use', color: '#10b981' };
    };


    const slotCapacity = useMemo(() => {
        const activeMachines = machines.filter(m => m.status === 'available');
        const slotsPerDay = TIME_SLOTS.length * activeMachines.length;

        const today = getBelarusDate();
        const weekStart = isNextWeekOpen ? addBelarusDays(getBelarusWeekStart(today), 7) : getBelarusWeekStart(today);
        const targetWeekId = getBelarusWeekId(weekStart);

        const maintenanceDay = settings.maintenanceDay ?? 3;
        const weekDates = Array.from({ length: 7 }, (_, i) => addBelarusDays(weekStart, i));
        const bookableDates = weekDates.filter(d => getBelarusWeekday(d) !== maintenanceDay).map(formatBelarusDate);

        const totalSlots = slotsPerDay * bookableDates.length;
        const bookedInTargetWeek = allBookings.filter(
            b => b.weekId === targetWeekId && bookableDates.includes(b.date)
        ).length;
        const remainingSlots = Math.max(totalSlots - bookedInTargetWeek, 0);

        return { totalSlots, remainingSlots, bookableDays: bookableDates.length, slotsPerDay };
    }, [machines, allBookings, settings.maintenanceDay, isNextWeekOpen]);

    const handleLogout = () => {
        bookingService.logout();
        navigate('/login');
    };

    const formatUtcForIcs = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    };

    const today = getBelarusDate();
    const nextWeekStart = addBelarusDays(getBelarusWeekStart(today), 7);
    const nextWeekId = getBelarusWeekId(nextWeekStart);

    // Check if the user has a booking specifically for the *upcoming* week (next week slots)
    const hasBookedForNextWeek = user ? allBookings.some(b => b.studentId === user.id && b.weekId === nextWeekId) : false;


    const primaryUpcomingBooking = upcomingBookings[0] || null;

    let mainActionLabel = 'Book Now';
    let mainActionSubtitle = 'Book your slot for next week';

    if (isSystemClosed) {
        mainActionLabel = 'Check Status';
        mainActionSubtitle = 'Bookings are currently closed';
    } else if (hasBookedForNextWeek) {
        mainActionLabel = 'Booked';
        mainActionSubtitle = 'You already booked. You can still open slots page to browse remaining slots';
    }

    const getUpcomingDateForWeekday = (weekday: number) => {
        const baseWeekStart = addBelarusDays(getBelarusWeekStart(getBelarusDate()), 7);
        const dayOffset = weekday === 0 ? 6 : weekday - 1;
        return addBelarusDays(baseWeekStart, dayOffset);
    };

    const handleQuickBookFromHistory = (booking: Booking) => {
        setQuickBookModalBooking(booking);
        setQuickBookModalMessage(null);
    };

    const handleConfirmQuickBook = async () => {
        if (!user || !quickBookModalBooking || quickBookingId) return;

        const booking = quickBookModalBooking;
        const sourceDate = new Date(`${booking.date}T00:00:00Z`);
        const targetDate = getUpcomingDateForWeekday(getBelarusWeekday(sourceDate));
        const targetDateLabel = format(targetDate, 'EEE, MMM d');

        if (settings.forceCloseBookings || !isNextWeekOpen) {
            setQuickBookModalMessage({ type: 'error', text: 'Quick Book is closed right now. Booking window is not open yet.' });
            return;
        }

        const machine = machines.find(m => m.id === booking.machineId);
        if (!machine || machine.status === 'maintenance') {
            setQuickBookModalMessage({ type: 'error', text: 'Machine is under maintenance. Please choose another slot.' });
            return;
        }

        const maintenanceDay = settings.maintenanceDay ?? 3;
        if (getBelarusWeekday(targetDate) === maintenanceDay) {
            setQuickBookModalMessage({ type: 'error', text: 'Selected day is maintenance day, so quick booking is unavailable.' });
            return;
        }

        if (!TIME_SLOTS.includes(booking.startTime as (typeof TIME_SLOTS)[number])) {
            setQuickBookModalMessage({ type: 'error', text: 'Original slot time is no longer available.' });
            return;
        }

        const targetDateStr = formatBelarusDate(targetDate);
        const existingSlotBooking = allBookings.find(b =>
            b.date === targetDateStr && b.machineId === booking.machineId && b.startTime === booking.startTime
        );

        if (existingSlotBooking) {
            const isYourExistingBooking = existingSlotBooking.studentId === user.id;
            setQuickBookModalMessage({
                type: 'error',
                text: isYourExistingBooking
                    ? 'You already booked this exact machine and slot for next week (likely from Book Now page).'
                    : 'This exact machine and slot is already booked by another resident for next week.'
            });
            return;
        }

        setQuickBookingId(booking.id);

        const bookingData: Booking = {
            id: Date.now().toString(),
            machineId: booking.machineId,
            studentId: user.id,
            studentName: user.name,
            roomNumber: user.roomNumber,
            date: targetDateStr,
            startTime: booking.startTime,
            endTime: booking.startTime,
            weekId: getBelarusWeekId(targetDate),
            createdAt: Date.now()
        };

        try {
            const result = await firestoreService.createBooking(bookingData);
            if (!result.success) {
                const detailedError = result.error?.includes('Slot already booked by another student')
                    ? 'This exact machine and slot was just booked by another resident. Please choose a different slot.'
                    : result.error?.includes('already booked a slot for this week')
                        ? 'You already have a booking for this week (including bookings made via Book Now page).'
                        : result.error || 'Quick booking failed. Please try again.';
                setQuickBookModalMessage({ type: 'error', text: detailedError });
                return;
            }

            const refreshedBookings = await firestoreService.getBookings();
            setAllBookings(refreshedBookings);

            const myBookings = refreshedBookings.filter(b => b.studentId === user.id);
            const chronological = [...myBookings].sort((a, b) =>
                new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime()
            );
            const now = new Date();
            const futureBookings = chronological.filter(b => addMinutes(parseISO(b.date + 'T' + b.startTime), 90) > now);
            const pastBookings = chronological.filter(b => addMinutes(parseISO(b.date + 'T' + b.startTime), 90) <= now).reverse();

            setUpcomingBookings(futureBookings);
            setHistory(pastBookings);
            setQuickBookModalMessage({ type: 'success', text: `Booked ${booking.startTime} on ${targetDateLabel}.` });

            // Auto close on success
            setTimeout(() => {
                setQuickBookModalBooking(null);
                setQuickBookModalMessage(null);
            }, 2000);
        } catch (error) {
            console.error('Quick booking failed', error);
            setQuickBookModalMessage({ type: 'error', text: 'Quick booking failed due to a system error.' });
        } finally {
            setQuickBookingId(null);
        }
    };


    if (loading) {
        return (
            <div className="container animate-fade-in" style={{ height: '100vh', padding: '24px' }}>
                <header style={{ marginBottom: '32px', marginTop: '16px' }}>
                    <div style={{ height: '32px', width: '200px', background: 'var(--glass-border)', borderRadius: '8px', marginBottom: '8px' }} className="skeleton-pulse"></div>
                    <div style={{ height: '20px', width: '100px', background: 'var(--glass-border)', borderRadius: '8px' }} className="skeleton-pulse"></div>
                </header>
                <div style={{ height: '140px', background: 'var(--glass-border)', borderRadius: '20px', marginBottom: '32px' }} className="skeleton-pulse"></div>
                <div className="grid-cols-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ height: '120px', background: 'var(--glass-border)', borderRadius: '16px' }} className="skeleton-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }
    if (!user) return null;

    const quickBookTargetDate = quickBookModalBooking
        ? getUpcomingDateForWeekday(getBelarusWeekday(new Date(`${quickBookModalBooking.date}T00:00:00Z`)))
        : null;
    const quickBookMachine = quickBookModalBooking
        ? machines.find(m => m.id === quickBookModalBooking.machineId)
        : null;
    const quickBookMachineLabel = quickBookMachine?.name || `Machine ${quickBookModalBooking?.machineId || ''}`;
    const modalRoot = typeof document !== 'undefined' ? document.body : null;

    return (
        <div className="container animate-fade-in">
            {/* Top Alert Banner */}
            {settings.topAlert?.isActive && settings.topAlert.message && (
                <div
                    className="slide-down-in"
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        padding: '12px 16px',
                        background: settings.topAlert.type === 'urgent'
                            ? 'rgba(239, 68, 68, 0.25)' // Red glass
                            : settings.topAlert.type === 'warning'
                                ? 'rgba(245, 158, 11, 0.25)' // Amber glass
                                : 'rgba(59, 130, 246, 0.25)', // Blue glass
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: 'var(--text-main)',
                        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}
                >
                    <div style={{
                        background: 'rgba(255,255,255,0.2)',
                        padding: '4px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {settings.topAlert.type === 'urgent' && <AlertTriangle size={16} fill="white" />}
                        {settings.topAlert.type === 'info' && <Info size={16} />}
                        {settings.topAlert.type === 'warning' && <AlertTriangle size={16} />}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '14px', textAlign: 'center', letterSpacing: '0.01em' }}>
                        {settings.topAlert.message}
                    </span>
                </div>
            )}

            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '32px',
                marginTop: settings.topAlert?.isActive ? '48px' : '16px', // Push down if alert is visible
                transition: 'margin-top 0.3s ease'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '24px' }}>Hello, {user.name.split(' ')[0]} 👋</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Room {user.roomNumber}</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="glass-button"
                    style={{ padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <LogOut size={20} />
                </button>
            </header>

            {/* Announcements Carousel */}
            <BannerCarousel banners={banners} isLoading={bannersLoading} />

            {/* Main Action */}
            <div
                className="glass-panel main-action-layout"
                style={{
                    padding: '20px 24px',
                    borderRadius: '16px',
                    marginBottom: '32px'
                }}
            >
                <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600 }}>Need to wash?</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                        {mainActionSubtitle}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/book')}
                    className="primary-button"
                    style={{
                        padding: '10px 24px',
                        borderRadius: '10px',
                        background: isSystemClosed ? 'var(--error)' : hasBookedForNextWeek ? 'var(--success)' : 'var(--primary)',
                        boxShadow: isSystemClosed
                            ? '0 0 15px rgba(239, 68, 68, 0.3)'
                            : hasBookedForNextWeek
                                ? '0 0 15px rgba(16, 185, 129, 0.3)'
                                : '0 0 15px var(--primary-glow)',
                        fontSize: '14px',
                        fontWeight: 600,
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                >
                    {mainActionLabel}
                </button>
            </div>


            {/* Machine Status - Live View */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Status
                    <span style={{
                        fontSize: '12px',
                        fontWeight: 'normal',
                        background: 'var(--glass-button-bg)',
                        border: '1px solid var(--glass-border)',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        color: 'var(--text-muted)'
                    }}>
                        {format(new Date(), 'h:mm a')}
                    </span>
                </h3>
            </div>

            <div className="glass-panel" style={{
                marginBottom: '20px',
                padding: '20px',
                borderRadius: '16px',
                position: 'relative',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.2)'
            }}>
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            padding: '12px',
                            borderRadius: '14px',
                            display: 'flex',
                            position: 'relative'
                        }}>
                            {/* Pulse effect */}
                            <div className="skeleton-pulse" style={{
                                position: 'absolute', inset: 0, borderRadius: '14px',
                                background: 'var(--primary)', opacity: 0.25, zIndex: 0
                            }}></div>
                            <Activity size={24} color="var(--primary)" style={{ zIndex: 1 }} />
                        </div>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>System Status</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: isSystemClosed ? 'var(--error)' : 'var(--success)',
                                    boxShadow: `0 0 10px ${isSystemClosed ? 'var(--error)' : 'var(--success)'}`
                                }}></span>
                                {isSystemClosed ? 'Closed' : 'Active'}
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>Week Slots</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
                                {slotCapacity.remainingSlots}
                            </span>
                            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                                / {slotCapacity.totalSlots}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar background effect */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, height: '4px',
                    background: 'var(--glass-border)', width: '100%'
                }}>
                    <div style={{
                        height: '100%',
                        background: 'var(--primary)',
                        width: `${Math.max(2, (slotCapacity.remainingSlots / Math.max(1, slotCapacity.totalSlots)) * 100)}%`,
                        transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 0 12px var(--primary-glow)'
                    }}></div>
                </div>
            </div>
            <div className="grid-cols-2">
                {machines.map(machine => {
                    const status = getMachineRealTimeStatus(machine);
                    return (
                        <div
                            key={machine.id}
                            className="glass-panel"
                            style={{
                                padding: '16px',
                                borderRadius: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{
                                    background: `rgba(${status.state === 'available' ? '16, 185, 129' : status.state === 'occupied' ? '245, 158, 11' : '239, 68, 68'}, 0.2)`,
                                    padding: '8px',
                                    borderRadius: '10px'
                                }}>
                                    {status.state === 'maintenance' ? <AlertCircle size={24} color={status.color} /> : <Washer size={24} color={status.color} />}
                                </div>
                                <span style={{
                                    fontSize: '12px',
                                    padding: '4px 8px',
                                    borderRadius: '10px',
                                    background: `rgba(${status.state === 'available' ? '16, 185, 129' : status.state === 'occupied' ? '245, 158, 11' : '239, 68, 68'}, 0.1)`,
                                    color: status.color
                                }}>
                                    {status.label}
                                </span>
                            </div>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600 }}>{machine.name}</p>
                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {status.state === 'available' ? 'Ready' : status.state === 'occupied' ? 'Finishes soon' : 'Closed'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Your Bookings */}
            <div style={{ marginTop: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={20} /> Your Upcoming Booking
                </h3>
                {primaryUpcomingBooking ? (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '24px',
                            borderRadius: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px',
                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.05)'
                        }}
                    >
                        {/* Decorative accent */}
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                            background: 'linear-gradient(90deg, var(--success) 0%, #34d399 100%)'
                        }} />

                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)',
                                borderRadius: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                flexShrink: 0
                            }}>
                                <Washer size={32} color="var(--success)" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                                            {format(new Date(primaryUpcomingBooking.date), 'EEEE, MMMM d')}
                                        </h4>
                                        <p style={{ margin: '4px 0 0', fontSize: '15px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{primaryUpcomingBooking.startTime}</span>
                                            <span>•</span>
                                            {machines.find(m => m.id === primaryUpcomingBooking.machineId)?.name || 'Machine'}
                                        </p>
                                    </div>
                                    <div style={{
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        color: 'var(--success)',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Activity size={12} /> Confirmed
                                    </div>
                                </div>
                            </div>
                        </div>

                        {upcomingBookings.length > 1 && (
                            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: '4px' }}>
                                    Also upcoming ({upcomingBookings.length - 1})
                                </div>
                                {upcomingBookings.slice(1, 3).map((booking) => (
                                    <div
                                        key={booking.id}
                                        style={{
                                            padding: '16px',
                                            borderRadius: '16px',
                                            background: 'var(--glass-bg)',
                                            border: '1px solid var(--glass-border)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px',
                                            background: 'var(--primary)',
                                            opacity: 0.8
                                        }} />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '4px' }}>
                                            <div style={{
                                                background: 'rgba(99, 102, 241, 0.1)',
                                                padding: '10px',
                                                borderRadius: '12px'
                                            }}>
                                                <Calendar size={18} color="var(--primary)" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '2px' }}>
                                                    {format(new Date(booking.date), 'EEEE, MMM d')}
                                                </div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{booking.startTime}</span>
                                                    <span>•</span>
                                                    <span>{machines.find(m => m.id === booking.machineId)?.name || 'Machine'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                            {/* Google Calendar Button */}
                            <button
                                onClick={() => {
                                    if (!primaryUpcomingBooking) return;
                                    const start = new Date(primaryUpcomingBooking.date + 'T' + primaryUpcomingBooking.startTime);
                                    const end = addMinutes(start, 90);

                                    const formatGCal = (date: Date) => date.toISOString().replace(/-|:|\.|Z/g, "").slice(0, 15) + 'Z';

                                    const url = `https://www.google.com/calendar/render?action=TEMPLATE` +
                                        `&text=${encodeURIComponent("Hostel Laundry: " + (machines.find(m => m.id === primaryUpcomingBooking.machineId)?.name || "Machine"))}` +
                                        `&dates=${formatGCal(start)}/${formatGCal(end)}` +
                                        `&details=${encodeURIComponent("Don't forget your laundry slot! Reminder target: 30 minutes before. Remember to clear the machine when done.")}` +
                                        `&location=${encodeURIComponent("Laundry Room")}` +
                                        `&sprop=&sprop=name:`;

                                    window.open(url, '_blank');
                                }}
                                className="glass-button"
                                style={{ padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px', justifyContent: 'center' }}
                            >
                                <Calendar size={18} />
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>Google Cal</span>
                            </button>

                            {/* ICS / Apple Calendar Button */}
                            <button
                                onClick={async () => {
                                    if (!primaryUpcomingBooking) return;

                                    const startDate = new Date(primaryUpcomingBooking.date + 'T' + primaryUpcomingBooking.startTime);
                                    const endDate = addMinutes(startDate, 90);
                                    const uid = `${primaryUpcomingBooking.id || Date.now()}@hostel-wash`;

                                    const icsContent = [
                                        'BEGIN:VCALENDAR',
                                        'VERSION:2.0',
                                        'PRODID:-//Hostel Wash//Booking Reminder//EN',
                                        'CALSCALE:GREGORIAN',
                                        'METHOD:PUBLISH',
                                        'BEGIN:VEVENT',
                                        `UID:${uid}`,
                                        `DTSTAMP:${formatUtcForIcs(new Date())}`,
                                        `DTSTART:${formatUtcForIcs(startDate)}`,
                                        `DTEND:${formatUtcForIcs(endDate)}`,
                                        `SUMMARY:Hostel Laundry - ${machines.find(m => m.id === primaryUpcomingBooking.machineId)?.name || 'Machine'}`,
                                        'DESCRIPTION:Remember to empty the machine on time!',
                                        'LOCATION:Laundry Room',
                                        'BEGIN:VALARM',
                                        `TRIGGER:-PT30M`,
                                        'ACTION:DISPLAY',
                                        'DESCRIPTION:Laundry Reminder',
                                        'END:VALARM',
                                        'END:VEVENT',
                                        'END:VCALENDAR'
                                    ].join('\r\n');

                                    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                                    const file = new File([blob], 'laundry-booking.ics', { type: 'text/calendar' });

                                    try {
                                        if (navigator.share && (navigator as any).canShare?.({ files: [file] })) {
                                            await navigator.share({
                                                files: [file],
                                                title: 'Laundry Booking Reminder'
                                            });
                                            return;
                                        }
                                    } catch {
                                        // If share is cancelled/unsupported, fallback to download.
                                    }

                                    const url = window.URL.createObjectURL(blob);

                                    // iOS/Safari compatibility: attempt open in a new tab first, then fall back to explicit download.
                                    const openedWindow = window.open(url, '_blank');
                                    if (openedWindow) {
                                        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                                        return;
                                    }

                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.setAttribute('download', 'laundry-booking.ics');
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    window.URL.revokeObjectURL(url);
                                }}
                                className="glass-button"
                                style={{ padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px', justifyContent: 'center', background: 'var(--glass-button-bg)' }}
                            >
                                <Download size={18} />
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>Apple / Outlook</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '20px',
                            borderRadius: '16px',
                            textAlign: 'center',
                            color: 'var(--text-muted)'
                        }}
                    >
                        <Calendar size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                        <p>No upcoming bookings.</p>
                    </div>
                )
                }
            </div >

            {/* History */}
            {
                history.length > 0 && (
                    <div style={{ marginTop: '32px' }}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <History size={20} /> Past Bookings
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {history.slice(0, 5).map((booking) => {
                                const machine = machines.find((m) => m.id === booking.machineId);
                                const machineLabel = machine?.name || `Machine ${booking.machineId}`;
                                return (
                                    <div
                                        key={booking.id}
                                        className="glass-panel hover-card"
                                        style={{
                                            padding: '20px',
                                            borderRadius: '16px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '16px',
                                            border: '1px solid rgba(168, 85, 247, 0.2)',
                                            background: 'linear-gradient(145deg, rgba(168, 85, 247, 0.03) 0%, rgba(99, 102, 241, 0.02) 100%)',
                                            transition: 'transform 0.2s, background 0.2s',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.background = 'linear-gradient(145deg, rgba(168, 85, 247, 0.06) 0%, rgba(99, 102, 241, 0.04) 100%)';
                                            e.currentTarget.style.border = '1px solid rgba(168, 85, 247, 0.4)';
                                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.background = 'linear-gradient(145deg, rgba(168, 85, 247, 0.03) 0%, rgba(99, 102, 241, 0.02) 100%)';
                                            e.currentTarget.style.border = '1px solid rgba(168, 85, 247, 0.2)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px',
                                            background: 'linear-gradient(to bottom, var(--success) 0%, #10b98188 100%)'
                                        }} />

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingLeft: '8px' }}>
                                            <div style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '12px',
                                                background: 'rgba(168, 85, 247, 0.1)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#a855f7',
                                                flexShrink: 0
                                            }}>
                                                <History size={24} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    {machineLabel} <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '4px' }}>• {booking.startTime}</span>
                                                </div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <CheckCircle size={14} color="var(--success)" />
                                                    {format(new Date(booking.date), 'EEEE, MMMM d, yyyy')}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                                            <button
                                                onClick={() => handleQuickBookFromHistory(booking)}
                                                className="glass-button"
                                                disabled={quickBookingId === booking.id}
                                                style={{
                                                    padding: '10px 16px',
                                                    borderRadius: '12px',
                                                    fontSize: '13px',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    border: '1px solid rgba(168, 85, 247, 0.3)',
                                                    color: 'var(--primary)',
                                                    background: 'rgba(168, 85, 247, 0.05)',
                                                    opacity: quickBookingId && quickBookingId !== booking.id ? 0.7 : 1,
                                                    cursor: quickBookingId === booking.id ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (quickBookingId !== booking.id) {
                                                        e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (quickBookingId !== booking.id) {
                                                        e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)';
                                                    }
                                                }}
                                            >
                                                {quickBookingId === booking.id ? 'Booking...' : (
                                                    <>
                                                        Quick Book
                                                        <ArrowRight size={14} />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            }

            {modalRoot && quickBookModalBooking && createPortal(
                <div className="modal-overlay" onClick={() => setQuickBookModalBooking(null)}>
                    <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()}>

                        {quickBookModalMessage?.type === 'success' ? (
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.2)', width: '64px', height: '64px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
                                    }}
                                >
                                    <CheckCircle size={32} color="var(--success)" />
                                </motion.div>
                                <h3 style={{ margin: '0 0 8px', color: 'var(--success)' }}>Booking Confirmed!</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{quickBookModalMessage.text}</p>
                            </div>
                        ) : (
                            <>
                                <h3 style={{ margin: '0 0 12px' }}>Quick Book Confirmation</h3>
                                <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
                                    {quickBookTargetDate ? `${format(quickBookTargetDate, 'EEE, MMM d')}` : ''} at {quickBookModalBooking.startTime}
                                </p>
                                <p style={{ margin: '0 0 16px', fontWeight: 700 }}>
                                    Machine: {quickBookMachineLabel}
                                </p>

                                {quickBookModalMessage && (
                                    <div
                                        style={{
                                            marginBottom: '14px',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            color: quickBookModalMessage.type === 'info' ? 'var(--text-main)' : 'var(--error)',
                                            border: quickBookModalMessage.type === 'info'
                                                ? '1px solid rgba(16,185,129,0.4)'
                                                : '1px solid rgba(239,68,68,0.4)',
                                            background: quickBookModalMessage.type === 'info'
                                                ? 'rgba(16,185,129,0.12)'
                                                : 'rgba(239,68,68,0.12)'
                                        }}
                                    >
                                        {quickBookModalMessage.text}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => setQuickBookModalBooking(null)}
                                        className="glass-button"
                                        style={{ padding: '10px 18px', borderRadius: '10px' }}
                                    >
                                        Close
                                    </button>
                                    <button
                                        onClick={handleConfirmQuickBook}
                                        disabled={quickBookingId === quickBookModalBooking.id}
                                        className="primary-button"
                                        style={{
                                            padding: '10px 18px',
                                            borderRadius: '10px',
                                            opacity: quickBookingId === quickBookModalBooking.id ? 0.7 : 1,
                                            cursor: quickBookingId === quickBookModalBooking.id ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {quickBookingId === quickBookModalBooking.id ? 'Booking...' : 'Confirm Quick Book'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                modalRoot
            )}

            {/* Inline Feedback Section */}
            <DashboardFeedback />
        </div>
    );
}
