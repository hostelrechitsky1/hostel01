import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import type { Machine, Booking, Banner, AppSettings } from '../types';
import { TIME_SLOTS } from '../types';
import { Calendar, LogOut, WashingMachine as Washer, History, Download, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { format, addMinutes, parse, isAfter, isBefore, parseISO } from 'date-fns';
import DashboardFeedback from '../components/DashboardFeedback';
import BannerCarousel from '../components/BannerCarousel';
import { addBelarusDays, formatBelarusDate, getBelarusDate, getBelarusNow, getBelarusWeekStart, getBelarusWeekday, getBelarusWeekId, isAutoBookingWindowOpen } from '../utils/time';

export default function Dashboard() {
    const navigate = useNavigate();
    const user = bookingService.getCurrentUser();
    const [upcomingBooking, setUpcomingBooking] = useState<Booking | null>(null);
    const [history, setHistory] = useState<Booking[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [allBookings, setAllBookings] = useState<Booking[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<AppSettings>({
        forceShowNextWeek: false,
        forceCloseBookings: false,
        maintenanceDay: 3,
        topAlert: { message: '', isActive: false, type: 'info' }
    });
    const [reminderMinutes, setReminderMinutes] = useState(30);
    const [quickBookStatus, setQuickBookStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [quickBookingId, setQuickBookingId] = useState<string | null>(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        const loadData = async () => {
            try {
                const [fetchedMachines, fetchedBookings, fetchedSettings, fetchedBanners] = await Promise.all([
                    firestoreService.getMachines(),
                    firestoreService.getBookings(),
                    firestoreService.getSettings(),
                    firestoreService.getBanners()
                ]);

                setMachines(fetchedMachines);
                setAllBookings(fetchedBookings);
                setSettings(fetchedSettings);
                setBanners(fetchedBanners);

                const myBookings = fetchedBookings.filter(b => b.studentId === user.id);
                const chronological = [...myBookings].sort((a, b) =>
                    new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime()
                );

                const now = new Date();
                const nextBooking = chronological.find(b => {
                    const end = addMinutes(parseISO(b.date + 'T' + b.startTime), 90);
                    return end > now;
                });

                const pastBookings = chronological.filter(b => {
                    const end = addMinutes(parseISO(b.date + 'T' + b.startTime), 90);
                    return end <= now;
                }).reverse();

                setUpcomingBooking(nextBooking || null);
                setHistory(pastBookings);
            } catch (err) {
                console.error("Failed to load dashboard data", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [user, navigate]);

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

    const hasUpcomingBooking = Boolean(upcomingBooking);
    const mainActionLabel = isSystemClosed ? 'Check Status' : hasUpcomingBooking ? 'Booked' : 'Book Now';
    const mainActionSubtitle = isSystemClosed
        ? 'Bookings are currently closed'
        : hasUpcomingBooking
            ? 'You already booked. You can still open slots page to browse remaining slots'
            : 'Book your slot for next week';

    const getUpcomingDateForWeekday = (weekday: number) => {
        const baseWeekStart = addBelarusDays(getBelarusWeekStart(getBelarusDate()), 7);
        const dayOffset = weekday === 0 ? 6 : weekday - 1;
        return addBelarusDays(baseWeekStart, dayOffset);
    };

    const handleQuickBookFromHistory = async (booking: Booking) => {
        if (!user || quickBookingId) return;

        if (settings.forceCloseBookings || !isNextWeekOpen) {
            setQuickBookStatus({ type: 'error', text: 'Quick Book is closed right now. Booking window is not open yet.' });
            return;
        }

        const sourceDate = new Date(`${booking.date}T00:00:00Z`);
        const targetDate = getUpcomingDateForWeekday(getBelarusWeekday(sourceDate));
        const targetDateLabel = format(targetDate, 'EEE, MMM d');

        const confirmed = window.confirm(`Quick book ${booking.startTime} on ${targetDateLabel} with the same machine?`);
        if (!confirmed) return;

        const machine = machines.find(m => m.id === booking.machineId);
        if (!machine || machine.status === 'maintenance') {
            setQuickBookStatus({ type: 'error', text: 'This machine is under maintenance. Please pick another machine/time.' });
            return;
        }

        const maintenanceDay = settings.maintenanceDay ?? 3;
        if (getBelarusWeekday(targetDate) === maintenanceDay) {
            setQuickBookStatus({ type: 'error', text: 'This day is maintenance day, so quick booking is not available.' });
            return;
        }

        if (!TIME_SLOTS.includes(booking.startTime as (typeof TIME_SLOTS)[number])) {
            setQuickBookStatus({ type: 'error', text: 'Original slot time is no longer available in the schedule.' });
            return;
        }

        const targetDateStr = formatBelarusDate(targetDate);
        const slotTaken = allBookings.some(b =>
            b.date === targetDateStr && b.machineId === booking.machineId && b.startTime === booking.startTime
        );

        if (slotTaken) {
            setQuickBookStatus({ type: 'error', text: 'That same machine/time is already booked for next week.' });
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
                setQuickBookStatus({ type: 'error', text: result.error || 'Quick booking failed. Please try again.' });
                return;
            }

            const refreshedBookings = await firestoreService.getBookings();
            setAllBookings(refreshedBookings);

            const myBookings = refreshedBookings.filter(b => b.studentId === user.id);
            const chronological = [...myBookings].sort((a, b) =>
                new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime()
            );
            const now = new Date();
            const nextBooking = chronological.find(b => addMinutes(parseISO(b.date + 'T' + b.startTime), 90) > now) || null;
            const pastBookings = chronological.filter(b => addMinutes(parseISO(b.date + 'T' + b.startTime), 90) <= now).reverse();

            setUpcomingBooking(nextBooking);
            setHistory(pastBookings);
            setQuickBookStatus({ type: 'success', text: `Booked ${booking.startTime} on ${targetDateLabel}.` });
        } catch (error) {
            console.error('Quick booking failed', error);
            setQuickBookStatus({ type: 'error', text: 'Quick booking failed due to a system error.' });
        } finally {
            setQuickBookingId(null);
        }
    };


    if (loading) return <div className="flex-center" style={{ height: '100vh' }}>Loading...</div>;
    if (!user) return null;

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
                        color: 'white',
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
            <BannerCarousel banners={banners} />

            {/* Main Action */}
            <div
                className="glass-panel"
                style={{
                    padding: '24px',
                    borderRadius: '20px',
                    marginBottom: '32px',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>Need to wash?</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                        {mainActionSubtitle}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/book')}
                    className="primary-button"
                    style={{
                        padding: '12px 24px',
                        borderRadius: '12px',
                        background: isSystemClosed ? '#ef4444' : hasUpcomingBooking ? '#10b981' : 'var(--primary)',
                        opacity: 1,
                        cursor: 'pointer'
                    }}
                >
                    {mainActionLabel}
                </button>
            </div>

            {/* Machine Status - Live View */}
            <h3 style={{ marginBottom: '10px' }}>Status ({format(new Date(), 'h:mm a')})</h3>
            <div className="glass-panel" style={{
                marginBottom: '16px',
                padding: '14px 16px',
                borderRadius: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.24) 0%, rgba(99, 102, 241, 0.12) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.45)'
            }}>
                <div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>Total Slots</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, lineHeight: 1.1 }}>
                        {slotCapacity.totalSlots}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>Week Remaining</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, lineHeight: 1.1 }}>
                        {slotCapacity.remainingSlots}
                    </div>
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
                <h3 style={{ marginBottom: '16px' }}>Your Upcoming Booking</h3>
                {upcomingBooking ? (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '20px',
                            borderRadius: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '12px' }}>
                                <Calendar size={24} color="#10b981" />
                            </div>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '18px' }}>
                                    {format(new Date(upcomingBooking.date), 'EEEE, MMM d')}
                                </p>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                                    {upcomingBooking.startTime} • {machines.find(m => m.id === upcomingBooking.machineId)?.name || 'Machine'}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Reminder</span>
                            <select
                                value={reminderMinutes}
                                onChange={(e) => setReminderMinutes(Number(e.target.value))}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: '10px',
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-main)'
                                }}
                            >
                                <option value={10}>10 min before</option>
                                <option value={30}>30 min before</option>
                                <option value={60}>1 hour before</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                            {/* Google Calendar Button */}
                            <button
                                onClick={() => {
                                    if (!upcomingBooking) return;
                                    const start = new Date(upcomingBooking.date + 'T' + upcomingBooking.startTime);
                                    const end = addMinutes(start, 90);

                                    const formatGCal = (date: Date) => date.toISOString().replace(/-|:|\.|Z/g, "").slice(0, 15) + 'Z';

                                    const url = `https://www.google.com/calendar/render?action=TEMPLATE` +
                                        `&text=${encodeURIComponent("Hostel Laundry: " + (machines.find(m => m.id === upcomingBooking.machineId)?.name || "Machine"))}` +
                                        `&dates=${formatGCal(start)}/${formatGCal(end)}` +
                                        `&details=${encodeURIComponent("Don't forget your laundry slot! Reminder target: " + reminderMinutes + " minutes before. Remember to clear the machine when done.")}` +
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
                                    if (!upcomingBooking) return;

                                    const startDate = new Date(upcomingBooking.date + 'T' + upcomingBooking.startTime);
                                    const endDate = addMinutes(startDate, 90);
                                    const uid = `${upcomingBooking.id || Date.now()}@hostel-wash`;

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
                                        `SUMMARY:Hostel Laundry - ${machines.find(m => m.id === upcomingBooking.machineId)?.name || 'Machine'}`,
                                        'DESCRIPTION:Remember to empty the machine on time!',
                                        'LOCATION:Laundry Room',
                                        'BEGIN:VALARM',
                                        `TRIGGER:-PT${reminderMinutes}M`,
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
                                style={{ padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px', justifyContent: 'center' }}
                            >
                                <Download size={18} />
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>Apple/Outlook</span>
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
                        {quickBookStatus && (
                            <div
                                style={{
                                    marginBottom: '10px',
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    color: quickBookStatus.type === 'success' ? '#a7f3d0' : '#fecaca',
                                    border: quickBookStatus.type === 'success'
                                        ? '1px solid rgba(16,185,129,0.4)'
                                        : '1px solid rgba(239,68,68,0.4)',
                                    background: quickBookStatus.type === 'success'
                                        ? 'rgba(16,185,129,0.12)'
                                        : 'rgba(239,68,68,0.12)'
                                }}
                            >
                                {quickBookStatus.text}
                            </div>
                        )}
                        <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                            {history.slice(0, 5).map((booking, i, arr) => (
                                <div
                                    key={booking.id}
                                    style={{
                                        padding: '16px',
                                        borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--glass-border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{format(new Date(booking.date), 'EEE, MMM d, yyyy')}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{booking.startTime}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <button
                                            onClick={() => handleQuickBookFromHistory(booking)}
                                            className="glass-button"
                                            disabled={quickBookingId === booking.id}
                                            style={{
                                                padding: '8px 10px',
                                                borderRadius: '10px',
                                                fontSize: '12px',
                                                opacity: quickBookingId && quickBookingId !== booking.id ? 0.7 : 1
                                            }}
                                        >
                                            {quickBookingId === booking.id ? 'Booking...' : 'Quick Book'}
                                        </button>
                                        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                                            Done
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Inline Feedback Section */}
            <DashboardFeedback />
        </div>
    );
}
