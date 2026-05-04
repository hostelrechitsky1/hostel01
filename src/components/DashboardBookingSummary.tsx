import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ArrowRight, Calendar, CheckCircle, Download, History, WashingMachine as Washer, XCircle } from 'lucide-react';
import type { AppSettings, Booking, Machine, Student } from '../types';
import { TIME_SLOTS } from '../types';
import { addBelarusDays, addBelarusMinutes, addMinutesToTimeString, formatBelarusDate, formatBelarusLongDateLabel, formatBelarusLongDateYearLabel, formatBelarusShortDateLabel, getBelarusDate, getBelarusNow, getBelarusWeekId, getBelarusWeekStart, getBelarusWeekday, parseBelarusDateTime } from '../utils/time';
import { hapticSelection, hapticSuccess } from '../utils/haptics';
import { ActionSpinner } from './ActionSpinner';
import { getCancelBookingFailureMessage, getQuickBookFailureMessage } from '../utils/bookingMutations';
import { getResidentPortalDateLocale } from '../utils/residentPortalLanguage';

interface DashboardBookingSummaryProps {
    user: Student;
    machines: Machine[];
    recentBookings: Booking[];
    recentBookingsLoading: boolean;
    weekBookings: Booking[];
    settings: AppSettings;
    isRussian?: boolean;
    onBookingCreated: (booking: Booking) => void;
    onBookingCancelled: (bookingId: string) => void;
}

let residentMutationsServicePromise: Promise<typeof import('../services/residentMutationsService')> | null = null;
const CANCEL_BOOKING_BADGE_STORAGE_KEY_PREFIX = 'hostel_cancel_booking_badge_seen_v2:';

const loadResidentMutationsService = () => {
    residentMutationsServicePromise ??= import('../services/residentMutationsService');
    return residentMutationsServicePromise;
};

export default function DashboardBookingSummary({
    user,
    machines,
    recentBookings,
    recentBookingsLoading,
    weekBookings,
    settings,
    isRussian = false,
    onBookingCreated,
    onBookingCancelled
}: DashboardBookingSummaryProps) {
    const dateLocale = getResidentPortalDateLocale(isRussian ? 'ru' : 'en');
    const t = isRussian
        ? {
            upcomingBooking: 'Ваше ближайшее бронирование',
            confirmed: 'Подтверждено',
            alsoUpcoming: (count: number) => `Ещё впереди (${count})`,
            googleCalendar: 'Google Календарь',
            appleOutlook: 'Apple / Outlook',
            cancelBooking: 'Отменить бронь',
            cancelHint: 'Освободить слот сразу',
            noUpcomingBookings: 'Нет предстоящих бронирований.',
            pastBookings: 'Прошлые бронирования',
            quickBook: 'Быстро забронировать',
            quickBookConfirmation: 'Подтверждение быстрой брони',
            bookingConfirmed: 'Бронь подтверждена!',
            close: 'Закрыть',
            confirmQuickBook: 'Подтвердить быструю бронь',
            bookingProgress: 'Бронируем...',
            atTime: 'в',
            quickBooked: (timeLabel: string, dateLabel: string) => `Забронировано на ${timeLabel}, ${dateLabel}.`,
            bookingCancelled: 'Бронь отменена',
            cancelThisBooking: 'Отменить это бронирование?',
            machine: 'Машина',
            cancellingFreesSlot: 'После отмены слот сразу станет доступен другим жильцам.',
            keepBooking: 'Оставить бронь',
            cancelling: 'Отменяем...',
            cancelSuccess: 'Бронирование отменено. Слот снова свободен.',
        }
        : {
            upcomingBooking: 'Your Upcoming Booking',
            confirmed: 'Confirmed',
            alsoUpcoming: (count: number) => `Also upcoming (${count})`,
            googleCalendar: 'Google Cal',
            appleOutlook: 'Apple / Outlook',
            cancelBooking: 'Cancel Booking',
            cancelHint: 'Free the slot instantly',
            noUpcomingBookings: 'No upcoming bookings.',
            pastBookings: 'Past Bookings',
            quickBook: 'Quick Book',
            quickBookConfirmation: 'Quick Book Confirmation',
            bookingConfirmed: 'Booking Confirmed!',
            close: 'Close',
            confirmQuickBook: 'Confirm Quick Book',
            bookingProgress: 'Booking...',
            atTime: 'at',
            quickBooked: (timeLabel: string, dateLabel: string) => `Booked ${timeLabel} on ${dateLabel}.`,
            bookingCancelled: 'Booking Cancelled',
            cancelThisBooking: 'Cancel This Booking?',
            machine: 'Machine',
            cancellingFreesSlot: 'Cancelling frees this slot immediately for other residents.',
            keepBooking: 'Keep Booking',
            cancelling: 'Cancelling...',
            cancelSuccess: 'Booking cancelled. The slot is now free again.',
        };
    const [quickBookModalBooking, setQuickBookModalBooking] = useState<Booking | null>(null);
    const [quickBookModalMessage, setQuickBookModalMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [quickBookingId, setQuickBookingId] = useState<string | null>(null);
    const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
    const [cancelModalMessage, setCancelModalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
    const [showCancelFeatureBadge, setShowCancelFeatureBadge] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const storageKey = `${CANCEL_BOOKING_BADGE_STORAGE_KEY_PREFIX}${user.id}`;
        setShowCancelFeatureBadge(window.localStorage.getItem(storageKey) !== '1');
    }, [user.id]);

    const { upcomingBookings, history } = useMemo(() => {
        const chronological = [...recentBookings].sort((left, right) =>
            new Date(left.date + 'T' + left.startTime).getTime() - new Date(right.date + 'T' + right.startTime).getTime()
        );

        const now = getBelarusNow();
        const upcoming = chronological.filter((booking) => addBelarusMinutes(parseBelarusDateTime(booking.date, booking.startTime), 90) > now);
        const past = chronological
            .filter((booking) => addBelarusMinutes(parseBelarusDateTime(booking.date, booking.startTime), 90) <= now)
            .reverse();

        return {
            upcomingBookings: upcoming,
            history: past.slice(0, 3)
        };
    }, [recentBookings]);

    const primaryUpcomingBooking = upcomingBookings[0] || null;

    const formatUtcForIcs = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    };

    const getUpcomingDateForWeekday = (weekday: number) => {
        const baseWeekStart = addBelarusDays(getBelarusWeekStart(getBelarusDate()), 7);
        const dayOffset = weekday === 0 ? 6 : weekday - 1;
        return addBelarusDays(baseWeekStart, dayOffset);
    };

    const handleQuickBookFromHistory = (booking: Booking) => {
        void loadResidentMutationsService();
        setQuickBookModalBooking(booking);
        setQuickBookModalMessage(null);
    };

    const canCancelBooking = (booking: Booking) => (
        parseBelarusDateTime(booking.date, booking.startTime).getTime() > getBelarusNow().getTime()
    );

    const handleOpenCancelBooking = (booking: Booking) => {
        if (!canCancelBooking(booking)) return;
        void loadResidentMutationsService();
        hapticSelection();
        if (showCancelFeatureBadge && typeof window !== 'undefined') {
            window.localStorage.setItem(`${CANCEL_BOOKING_BADGE_STORAGE_KEY_PREFIX}${user.id}`, '1');
            setShowCancelFeatureBadge(false);
        }
        setCancelModalBooking(booking);
        setCancelModalMessage(null);
    };

    const handleConfirmCancelBooking = async () => {
        if (!cancelModalBooking || cancelBookingId) return;

        setCancelBookingId(cancelModalBooking.id);

        try {
            const { residentMutationsService } = await loadResidentMutationsService();
            const result = await residentMutationsService.cancelBooking(cancelModalBooking.id, user.id);

            if (!result.success) {
                setCancelModalMessage({ type: 'error', text: getCancelBookingFailureMessage(result.errorCode, result.error) });
                return;
            }

            hapticSuccess();
            onBookingCancelled(cancelModalBooking.id);
            setCancelModalMessage({
                type: 'success',
                text: t.cancelSuccess
            });

            setTimeout(() => {
                setCancelModalBooking(null);
                setCancelModalMessage(null);
            }, 1600);
        } catch (error) {
            console.error('Cancel booking failed', error);
            setCancelModalMessage({ type: 'error', text: 'Could not cancel the booking right now.' });
        } finally {
            setCancelBookingId(null);
        }
    };

    const handleConfirmQuickBook = async () => {
        if (!quickBookModalBooking || quickBookingId) return;

        const booking = quickBookModalBooking;
        const sourceDate = new Date(`${booking.date}T00:00:00Z`);
        const targetDate = getUpcomingDateForWeekday(getBelarusWeekday(sourceDate));
        const targetDateLabel = formatBelarusShortDateLabel(targetDate);

        if (settings.forceCloseBookings) {
            setQuickBookModalMessage({ type: 'error', text: 'Quick Book is unavailable while bookings are paused by admin.' });
            return;
        }

        const machine = machines.find((currentMachine) => currentMachine.id === booking.machineId);
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
        const existingSlotBooking = weekBookings.find((existingBooking) =>
            existingBooking.date === targetDateStr
            && existingBooking.machineId === booking.machineId
            && existingBooking.startTime === booking.startTime
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
            endTime: addMinutesToTimeString(booking.startTime, 90),
            weekId: getBelarusWeekId(targetDate),
            createdAt: Date.now()
        };

        try {
            const { residentMutationsService } = await loadResidentMutationsService();
            const result = await residentMutationsService.createBooking(bookingData);
            if (!result.success) {
                setQuickBookModalMessage({ type: 'error', text: getQuickBookFailureMessage(result.errorCode, result.error) });
                return;
            }

            const createdBooking = result.booking ?? {
                ...bookingData,
                id: `${bookingData.date}_${bookingData.machineId}_${bookingData.startTime.replace(':', '-')}`,
            };
            hapticSuccess();
            onBookingCreated(createdBooking);
            setQuickBookModalMessage({ type: 'success', text: t.quickBooked(booking.startTime, targetDateLabel) });

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

    const bookingSectionSkeleton = (
        <div
            className="glass-panel"
            style={{
                padding: '20px',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
            }}
        >
            <div style={{ height: '18px', width: '44%', borderRadius: '999px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
            <div style={{ height: '52px', width: '100%', borderRadius: '16px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ height: '44px', flex: 1, minWidth: '140px', borderRadius: '14px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
                <div style={{ height: '44px', flex: 1, minWidth: '140px', borderRadius: '14px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
            </div>
        </div>
    );

    const historySectionSkeleton = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2].map((item) => (
                <div
                    key={item}
                    className="glass-panel"
                    style={{ height: '98px', borderRadius: '16px', background: 'var(--glass-border)' }}
                >
                    <div className="skeleton-pulse" style={{ width: '100%', height: '100%', borderRadius: '16px' }}></div>
                </div>
            ))}
        </div>
    );

    const quickBookTargetDate = quickBookModalBooking
        ? getUpcomingDateForWeekday(getBelarusWeekday(new Date(`${quickBookModalBooking.date}T00:00:00Z`)))
        : null;
    const quickBookMachine = quickBookModalBooking
        ? machines.find((machine) => machine.id === quickBookModalBooking.machineId)
        : null;
    const quickBookMachineLabel = quickBookMachine?.name || `Machine ${quickBookModalBooking?.machineId || ''}`;
    const cancelBookingMachine = cancelModalBooking
        ? machines.find((machine) => machine.id === cancelModalBooking.machineId)
        : null;
    const cancelBookingMachineLabel = cancelBookingMachine?.name || `Machine ${cancelModalBooking?.machineId || ''}`;
    const modalRoot = typeof document !== 'undefined' ? document.body : null;
    const primaryCancelButtonDisabled = !primaryUpcomingBooking || !canCancelBooking(primaryUpcomingBooking) || cancelBookingId === primaryUpcomingBooking.id;
    const getCancelActionStyle = (compact = false, disabled = false) => ({
        padding: compact ? '9px 13px' : '10px 14px',
        paddingRight: compact ? '13px' : '14px',
        minHeight: compact ? '40px' : '44px',
        borderRadius: '14px',
        fontSize: compact ? '13px' : '14px',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '7px' : '8px',
        justifyContent: 'center',
        position: 'relative' as const,
        overflow: 'visible' as const,
        border: '1px solid rgba(248, 113, 113, 0.28)',
        color: disabled ? 'rgba(254, 202, 202, 0.72)' : '#fecaca',
        background: disabled
            ? 'rgba(127, 29, 29, 0.12)'
            : 'rgba(239, 68, 68, 0.08)',
        boxShadow: disabled
            ? 'none'
            : '0 10px 22px rgba(15, 23, 42, 0.12)',
        opacity: disabled ? 0.72 : 1,
        cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
        flex: compact ? undefined : 1,
        minWidth: compact ? undefined : '136px',
    });
    const renderCancelBadge = () => showCancelFeatureBadge ? (
        <span
            className="feature-badge feature-badge--cancel"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 9px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#ffffff',
                background: 'var(--resident-ready-green)',
                border: '1px solid var(--resident-ready-green)',
                boxShadow: '0 10px 20px rgba(16, 185, 129, 0.22)',
                flexShrink: 0,
                position: 'absolute',
                top: '-10px',
                right: '10px',
                zIndex: 2,
                pointerEvents: 'none'
            }}
        >
            New
        </span>
    ) : null;

    return (
        <>
            <div style={{ marginTop: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={20} /> {t.upcomingBooking}
                </h3>
                {recentBookingsLoading && recentBookings.length === 0 ? (
                    bookingSectionSkeleton
                ) : primaryUpcomingBooking ? (
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
                                            {formatBelarusLongDateLabel(parseBelarusDateTime(primaryUpcomingBooking.date), dateLocale)}
                                        </h4>
                                        <p style={{ margin: '4px 0 0', fontSize: '15px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{primaryUpcomingBooking.startTime}</span>
                                            <span>•</span>
                                            {machines.find((machine) => machine.id === primaryUpcomingBooking.machineId)?.name || 'Machine'}
                                        </p>
                                    </div>
                                    <div style={{
                                        background: 'var(--resident-ready-green-soft)',
                                        color: 'var(--resident-ready-green)',
                                        border: '1px solid var(--resident-ready-green-border)',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Activity size={12} /> {t.confirmed}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {upcomingBookings.length > 1 && (
                            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: '4px' }}>
                                    {t.alsoUpcoming(upcomingBookings.length - 1)}
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
                                                    {formatBelarusShortDateLabel(parseBelarusDateTime(booking.date), dateLocale)}
                                                </div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{booking.startTime}</span>
                                                    <span>•</span>
                                                    <span>{machines.find((machine) => machine.id === booking.machineId)?.name || 'Machine'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                            <button
                                onClick={() => {
                                    if (!primaryUpcomingBooking) return;
                                    const start = parseBelarusDateTime(primaryUpcomingBooking.date, primaryUpcomingBooking.startTime);
                                    const end = addBelarusMinutes(start, 90);

                                    const formatGCal = (date: Date) => date.toISOString().replace(/-|:|\.|Z/g, '').slice(0, 15) + 'Z';

                                    const url = `https://www.google.com/calendar/render?action=TEMPLATE`
                                        + `&text=${encodeURIComponent(`Hostel Laundry: ${machines.find((machine) => machine.id === primaryUpcomingBooking.machineId)?.name || 'Machine'}`)}`
                                        + `&dates=${formatGCal(start)}/${formatGCal(end)}`
                                        + `&details=${encodeURIComponent("Don't forget your laundry slot! Reminder target: 30 minutes before. Remember to clear the machine when done.")}`
                                        + `&location=${encodeURIComponent('Laundry Room')}`
                                        + '&sprop=&sprop=name:';

                                    window.open(url, '_blank');
                                }}
                                className="glass-button"
                                style={{ padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px', justifyContent: 'center' }}
                            >
                                <Calendar size={18} />
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>{t.googleCalendar}</span>
                            </button>

                            <button
                                onClick={async () => {
                                    if (!primaryUpcomingBooking) return;

                                    const startDate = parseBelarusDateTime(primaryUpcomingBooking.date, primaryUpcomingBooking.startTime);
                                    const endDate = addBelarusMinutes(startDate, 90);
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
                                        `SUMMARY:Hostel Laundry - ${machines.find((machine) => machine.id === primaryUpcomingBooking.machineId)?.name || 'Machine'}`,
                                        'DESCRIPTION:Remember to empty the machine on time!',
                                        'LOCATION:Laundry Room',
                                        'BEGIN:VALARM',
                                        'TRIGGER:-PT30M',
                                        'ACTION:DISPLAY',
                                        'DESCRIPTION:Laundry Reminder',
                                        'END:VALARM',
                                        'END:VEVENT',
                                        'END:VCALENDAR'
                                    ].join('\r\n');

                                    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                                    const file = new File([blob], 'laundry-booking.ics', { type: 'text/calendar' });

                                    try {
                                        if (navigator.share && (navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }).canShare?.({ files: [file] })) {
                                            await navigator.share({
                                                files: [file],
                                                title: 'Laundry Booking Reminder'
                                            });
                                            return;
                                        }
                                    } catch {
                                        // Fallback to download below.
                                    }

                                    const url = window.URL.createObjectURL(blob);
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
                                style={{ padding: '10px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '136px', minHeight: '44px', justifyContent: 'center', background: 'var(--glass-button-bg)' }}
                            >
                                <Download size={18} />
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>{t.appleOutlook}</span>
                            </button>

                            <button
                                onClick={() => handleOpenCancelBooking(primaryUpcomingBooking)}
                                disabled={primaryCancelButtonDisabled}
                                className="glass-button"
                                style={getCancelActionStyle(false, primaryCancelButtonDisabled)}
                                title={canCancelBooking(primaryUpcomingBooking) ? 'Cancel upcoming booking' : 'Started bookings can no longer be cancelled'}
                            >
                                {renderCancelBadge()}
                                {cancelBookingId === primaryUpcomingBooking.id ? (
                                    <>
                                        <ActionSpinner size={16} tone="neutral" />
                                        Cancelling...
                                    </>
                                ) : (
                                    <>
                                        <span
                                            style={{
                                                width: '26px',
                                                height: '26px',
                                                borderRadius: '999px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'rgba(239, 68, 68, 0.14)',
                                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)'
                                            }}
                                        >
                                            <XCircle size={15} />
                                        </span>
                                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.05 }}>
                                            <span>{t.cancelBooking}</span>
                                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(254, 202, 202, 0.78)' }}>
                                                {t.cancelHint}
                                            </span>
                                        </span>
                                    </>
                                )}
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
                        <p>{t.noUpcomingBookings}</p>
                    </div>
                )}
            </div>

            {(recentBookingsLoading || history.length > 0) && (
                <div style={{ marginTop: '32px' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <History size={20} /> {t.pastBookings}
                    </h3>
                    {recentBookingsLoading && history.length === 0 ? (
                        historySectionSkeleton
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {history.slice(0, 3).map((booking, index) => {
                                const machine = machines.find((currentMachine) => currentMachine.id === booking.machineId);
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
                                            overflow: 'hidden',
                                            animationDelay: `${Math.min(index * 0.07, 0.16)}s`
                                        }}
                                        onMouseEnter={(event) => {
                                            event.currentTarget.style.transform = 'translateY(-2px)';
                                            event.currentTarget.style.background = 'linear-gradient(145deg, rgba(168, 85, 247, 0.06) 0%, rgba(99, 102, 241, 0.04) 100%)';
                                            event.currentTarget.style.border = '1px solid rgba(168, 85, 247, 0.4)';
                                            event.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                                        }}
                                        onMouseLeave={(event) => {
                                            event.currentTarget.style.transform = 'translateY(0)';
                                            event.currentTarget.style.background = 'linear-gradient(145deg, rgba(168, 85, 247, 0.03) 0%, rgba(99, 102, 241, 0.02) 100%)';
                                            event.currentTarget.style.border = '1px solid rgba(168, 85, 247, 0.2)';
                                            event.currentTarget.style.boxShadow = 'none';
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
                                                    {formatBelarusLongDateYearLabel(parseBelarusDateTime(booking.date), dateLocale)}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                                            {canCancelBooking(booking) && (
                                                <button
                                                    onClick={() => handleOpenCancelBooking(booking)}
                                                    className="glass-button"
                                                    disabled={cancelBookingId === booking.id}
                                                    style={getCancelActionStyle(true, cancelBookingId === booking.id)}
                                                >
                                                    {renderCancelBadge()}
                                                    {cancelBookingId === booking.id ? (
                                                        <>
                                                            <ActionSpinner size={14} tone="neutral" />
                                                            Cancelling...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span
                                                                style={{
                                                                    width: '22px',
                                                                    height: '22px',
                                                                    borderRadius: '999px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    background: 'rgba(255,255,255,0.14)',
                                                                }}
                                                            >
                                                                <XCircle size={13} />
                                                            </span>
                                                            <span>{t.cancelBooking}</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}
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
                                                onMouseEnter={(event) => {
                                                    if (quickBookingId !== booking.id) {
                                                        event.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)';
                                                    }
                                                }}
                                                onMouseLeave={(event) => {
                                                    if (quickBookingId !== booking.id) {
                                                        event.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)';
                                                    }
                                                }}
                                            >
                                                {quickBookingId === booking.id ? (
                                                    <>
                                                        <ActionSpinner size={14} tone="primary" />
                                                        {t.bookingProgress}
                                                    </>
                                                ) : (
                                                    <>
                                                        {t.quickBook}
                                                        <ArrowRight size={14} />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {modalRoot && quickBookModalBooking && createPortal(
                <div className="modal-overlay" onClick={() => setQuickBookModalBooking(null)}>
                    <div className="glass-panel modal-card" onClick={(event) => event.stopPropagation()}>
                        {quickBookModalMessage?.type === 'success' ? (
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.2)', width: '64px', height: '64px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
                                    }}
                                >
                                    <CheckCircle size={32} color="var(--success)" />
                                </div>
                                <h3 style={{ margin: '0 0 8px', color: 'var(--success)' }}>{t.bookingConfirmed}</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{quickBookModalMessage.text}</p>
                            </div>
                        ) : (
                            <>
                                <h3 style={{ margin: '0 0 12px' }}>{t.quickBookConfirmation}</h3>
                                <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
                                    {quickBookTargetDate ? `${formatBelarusShortDateLabel(quickBookTargetDate, dateLocale)}` : ''} {t.atTime} {quickBookModalBooking.startTime}
                                </p>
                                <p style={{ margin: '0 0 16px', fontWeight: 700 }}>
                                    {t.machine}: {quickBookMachineLabel}
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
                                        {t.close}
                                    </button>
                                    <button
                                        onClick={handleConfirmQuickBook}
                                        disabled={quickBookingId === quickBookModalBooking.id}
                                        className="primary-button"
                                        style={{
                                            padding: '10px 18px',
                                            borderRadius: '10px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            opacity: quickBookingId === quickBookModalBooking.id ? 0.7 : 1,
                                            cursor: quickBookingId === quickBookModalBooking.id ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {quickBookingId === quickBookModalBooking.id ? (
                                            <>
                                                <ActionSpinner size={16} tone="inverted" />
                                                {t.bookingProgress}
                                            </>
                                        ) : t.confirmQuickBook}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                modalRoot
            )}

            {modalRoot && cancelModalBooking && createPortal(
                <div className="modal-overlay" onClick={() => cancelBookingId ? undefined : setCancelModalBooking(null)}>
                    <div className="glass-panel modal-card" onClick={(event) => event.stopPropagation()}>
                        {cancelModalMessage?.type === 'success' ? (
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.2)', width: '64px', height: '64px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
                                    }}
                                >
                                    <CheckCircle size={32} color="var(--success)" />
                                </div>
                                <h3 style={{ margin: '0 0 8px', color: 'var(--success)' }}>{t.bookingCancelled}</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{cancelModalMessage.text}</p>
                            </div>
                        ) : (
                            <>
                                <h3 style={{ margin: '0 0 12px' }}>{t.cancelThisBooking}</h3>
                                <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
                                    {formatBelarusShortDateLabel(parseBelarusDateTime(cancelModalBooking.date), dateLocale)} {t.atTime} {cancelModalBooking.startTime}
                                </p>
                                <p style={{ margin: '0 0 12px', fontWeight: 700 }}>
                                    {t.machine}: {cancelBookingMachineLabel}
                                </p>
                                <div
                                    style={{
                                        marginBottom: '14px',
                                        padding: '10px 12px',
                                        borderRadius: '12px',
                                        fontSize: '13px',
                                        color: 'var(--text-muted)',
                                        border: '1px solid rgba(239,68,68,0.18)',
                                        background: 'rgba(239,68,68,0.08)'
                                    }}
                                >
                                    {t.cancellingFreesSlot}
                                </div>

                                {cancelModalMessage && (
                                    <div
                                        style={{
                                            marginBottom: '14px',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            color: 'var(--error)',
                                            border: '1px solid rgba(239,68,68,0.4)',
                                            background: 'rgba(239,68,68,0.12)'
                                        }}
                                    >
                                        {cancelModalMessage.text}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => setCancelModalBooking(null)}
                                        className="glass-button"
                                        disabled={cancelBookingId === cancelModalBooking.id}
                                        style={{ padding: '10px 18px', borderRadius: '10px' }}
                                    >
                                        {t.keepBooking}
                                    </button>
                                    <button
                                        onClick={handleConfirmCancelBooking}
                                        disabled={cancelBookingId === cancelModalBooking.id}
                                        className="glass-button"
                                        style={{
                                            padding: '10px 18px',
                                            borderRadius: '10px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            background: 'rgba(239, 68, 68, 0.12)',
                                            border: '1px solid rgba(239, 68, 68, 0.28)',
                                            color: 'var(--error)',
                                            opacity: cancelBookingId === cancelModalBooking.id ? 0.7 : 1,
                                            cursor: cancelBookingId === cancelModalBooking.id ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {cancelBookingId === cancelModalBooking.id ? (
                                            <>
                                                <ActionSpinner size={16} tone="neutral" />
                                                {t.cancelling}
                                            </>
                                        ) : t.cancelBooking}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                modalRoot
            )}
        </>
    );
}
