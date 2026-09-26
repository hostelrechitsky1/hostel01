import { Fragment, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, Clock, Languages, WashingMachine as Washer } from 'lucide-react';
import { bookingService } from '../services/bookingService';
import { DEFAULT_APP_SETTINGS, residentFirestoreService } from '../services/residentFirestoreService';
import { residentSnapshotService } from '../services/residentSnapshotService';
import type { AppSettings, Booking, Machine } from '../types';
import { ActionSpinner } from '../components/ActionSpinner';
import { DataLoadNotice } from '../components/DataLoadNotice';
import {
    addBelarusDays,
    addMinutesToTimeString,
    formatBelarusDate,
    formatBelarusLongDateLabel,
    formatBelarusWeekdayLabel,
    getActiveBookingWeekStart,
    getAutoOpenWindowDisplay,
    getBelarusDate,
    getBelarusNow,
    getBelarusWeekEnd,
    getBelarusWeekId,
    getBelarusWeekStart,
    getBelarusWeekday,
    getNextAutoOpenDate,
    isAutoBookingWindowOpen,
    isSameBelarusDay,
    parseBelarusDateTime,
} from '../utils/time';
import { preloadDashboardRoute } from '../utils/preloadRoutes';
import { getResidentPortalDateLocale, getResidentPortalLanguage, setResidentPortalLanguage, type ResidentPortalLanguage } from '../utils/residentPortalLanguage';
import { getResidentShortNameForLanguage } from '../utils/residentNames';
import { hapticSelection, hapticSuccess } from '../utils/haptics';
import { notifyError, notifyInfo, notifySuccess } from '../utils/notify';
import { getBookNowFailureMessage, isBookingAvailabilityConflict } from '../utils/bookingMutations';
import { buildTimeSlots, getSlotDurationMinutes } from '../utils/slotSchedule';

let residentLiveServicePromise: Promise<typeof import('../services/residentLiveService')> | null = null;
let residentMutationsServicePromise: Promise<typeof import('../services/residentMutationsService')> | null = null;

const loadResidentLiveService = () => {
    residentLiveServicePromise ??= import('../services/residentLiveService');
    return residentLiveServicePromise;
};

const loadResidentMutationsService = () => {
    residentMutationsServicePromise ??= import('../services/residentMutationsService');
    return residentMutationsServicePromise;
};

const upsertBooking = (bookings: Booking[], nextBooking: Booking) => {
    const withoutExisting = bookings.filter((booking) => booking.id !== nextBooking.id);
    return [...withoutExisting, nextBooking];
};

const isPastSlot = (date: Date, time: string) => {
    if (!isSameBelarusDay(date, getBelarusDate())) {
        return date.getTime() < getBelarusDate().getTime();
    }

    const now = getBelarusNow();
    const [slotHour, slotMinute] = time.split(':').map(Number);
    return slotHour < now.getUTCHours() || (slotHour === now.getUTCHours() && slotMinute < now.getUTCMinutes());
};

export default function WeeklySlots() {
    const navigate = useNavigate();
    const user = bookingService.getCurrentUser();
    const userId = user?.id ?? '';
    const [language, setLanguage] = useState<ResidentPortalLanguage>(() => getResidentPortalLanguage());
    const dateLocale = getResidentPortalDateLocale(language);
    const isRussian = language === 'ru';
    const t = isRussian
        ? {
            title: 'Слоты недели',
            openAllWeek: 'Бронирование открыто всю неделю',
            openAllWeekCopy: 'Онлайн-слоты открываются в субботу в 16:00 и остаются доступными до открытия новых слотов.',
            back: 'Назад',
            selectedDate: 'Выбранная дата',
            freeSlots: 'Свободно',
            bookedSlots: 'Занято',
            yourWeekBooking: 'Ваша бронь на эту неделю уже есть.',
            currentWeekendView: 'Брони на текущие выходные показаны для просмотра. Новые бронирования доступны на следующую неделю.',
            chooseFreeSlot: 'Выберите свободную машину, чтобы забронировать.',
            machine: 'Машина',
            free: 'Свободно',
            book: 'Бронировать',
            booked: 'Занято',
            bookedByYou: 'Ваша бронь',
            passed: 'Прошло',
            maintenance: 'Обслуживание',
            maintenanceDay: 'День обслуживания',
            closed: 'Закрыто',
            loadingTitle: 'Загружаем слоты недели',
            errorTitle: 'Не удалось загрузить слоты недели',
            retry: 'Повторить',
            reserving: 'Бронируем...',
            bookedToast: 'Бронь подтверждена.',
            conflictToast: 'Этот слот только что заняли. Данные обновлены.',
            unavailable: 'Этот слот сейчас недоступен.',
            live: 'Live',
            switchLanguage: 'English',
        }
        : {
            title: 'Weekly Slots',
            openAllWeek: 'Bookings now open entire week',
            openAllWeekCopy: 'Online slots open Saturday 16:00 and stay available until the next weekly slots open.',
            back: 'Back',
            selectedDate: 'Selected Date',
            freeSlots: 'Free',
            bookedSlots: 'Booked',
            yourWeekBooking: 'You already have a booking for this week.',
            currentWeekendView: 'Current weekend bookings are shown for reference. New bookings are available for next week.',
            chooseFreeSlot: 'Choose any free machine to book your slot.',
            machine: 'Machine',
            free: 'Free',
            book: 'Book',
            booked: 'Booked',
            bookedByYou: 'Booked by you',
            passed: 'Passed',
            maintenance: 'Maintenance',
            maintenanceDay: 'Maintenance day',
            closed: 'Closed',
            loadingTitle: 'Loading weekly slots',
            errorTitle: 'Unable to load weekly slots',
            retry: 'Retry',
            reserving: 'Reserving...',
            bookedToast: 'Booking confirmed.',
            conflictToast: 'That slot was just taken. Availability refreshed.',
            unavailable: 'This slot is not available right now.',
            live: 'Live',
            switchLanguage: 'Русский',
        };

    const [clockNow, setClockNow] = useState(() => new Date());
    const currentDayKey = formatBelarusDate(getBelarusDate(clockNow));
    const currentWeekStartKey = formatBelarusDate(getBelarusWeekStart(getBelarusDate(clockNow)));
    const weekIds = useMemo(() => {
        const currentWeekStart = parseBelarusDateTime(currentWeekStartKey);
        return [
            getBelarusWeekId(currentWeekStart),
            getBelarusWeekId(addBelarusDays(currentWeekStart, 7)),
        ];
    }, [currentWeekStartKey]);
    const cachedSnapshot = useMemo(() => residentSnapshotService.getCachedBookingSnapshot(weekIds), [weekIds]);
    const cachedMachines = cachedSnapshot?.machines;
    const cachedWeekBookings = cachedSnapshot?.weekBookings;
    const cachedSettings = cachedSnapshot?.settings;
    const hasCachedSnapshot = Boolean(cachedMachines && cachedWeekBookings);
    const [machines, setMachines] = useState<Machine[]>(() => cachedMachines ?? []);
    const [bookings, setBookings] = useState<Booking[]>(() => cachedWeekBookings ?? []);
    const [settings, setSettings] = useState<AppSettings>(() => cachedSettings ?? DEFAULT_APP_SETTINGS);
    const [selectedDate, setSelectedDate] = useState(() => getBelarusDate());
    const [loading, setLoading] = useState(() => Boolean(userId) && !hasCachedSnapshot);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
    const isMountedRef = useRef(true);

    const isBookingOpen = settings.forceShowNextWeek || isAutoBookingWindowOpen(clockNow, settings);
    const activeBookingWeekStartKey = formatBelarusDate(settings.forceShowNextWeek
        ? addBelarusDays(getBelarusWeekStart(getBelarusDate(clockNow)), 7)
        : getActiveBookingWeekStart(clockNow, settings));
    const activeBookingWeekStart = useMemo(() => parseBelarusDateTime(activeBookingWeekStartKey), [activeBookingWeekStartKey]);
    const activeBookingWeekEnd = useMemo(() => getBelarusWeekEnd(activeBookingWeekStart), [activeBookingWeekStart]);
    const activeBookingWeekId = useMemo(() => getBelarusWeekId(activeBookingWeekStart), [activeBookingWeekStart]);
    const slotDurationMinutes = useMemo(() => getSlotDurationMinutes(settings), [settings]);
    const timeSlots = useMemo(() => buildTimeSlots(slotDurationMinutes), [slotDurationMinutes]);
    const displayStart = useMemo(() => {
        const today = parseBelarusDateTime(currentDayKey);
        const currentWeekStart = getBelarusWeekStart(today);
        const weekday = getBelarusWeekday(today);
        const nextWeekIsActive = activeBookingWeekStart.getTime() > currentWeekStart.getTime();

        return nextWeekIsActive && (weekday === 6 || weekday === 0)
            ? addBelarusDays(currentWeekStart, 5)
            : activeBookingWeekStart;
    }, [activeBookingWeekStart, currentDayKey]);
    const dateOptions = useMemo(() => (
        Array.from({ length: Math.round((activeBookingWeekEnd.getTime() - displayStart.getTime()) / 86400000) + 1 },
            (_, index) => addBelarusDays(displayStart, index))
    ), [activeBookingWeekEnd, displayStart]);
    const selectedDateKey = useMemo(() => formatBelarusDate(selectedDate), [selectedDate]);
    const isSelectedInActiveWeek = selectedDate.getTime() >= activeBookingWeekStart.getTime()
        && selectedDate.getTime() <= activeBookingWeekEnd.getTime();
    const selectedDateBookings = useMemo(() => (
        bookings.filter((booking) => booking.date === selectedDateKey)
    ), [bookings, selectedDateKey]);
    const activeMachines = useMemo(() => machines.filter((machine) => machine.status === 'available'), [machines]);
    const maintenanceDay = settings.maintenanceDay ?? 3;
    const isMaintenanceDay = getBelarusWeekday(selectedDate) === maintenanceDay;
    const userWeeklyBooking = useMemo(() => (
        bookings.find((booking) => booking.studentId === userId && booking.weekId === activeBookingWeekId) ?? null
    ), [activeBookingWeekId, bookings, userId]);
    const windowDisplay = getAutoOpenWindowDisplay(settings);
    const totalCells = timeSlots.length * Math.max(machines.length, 1);
    const bookedCells = selectedDateBookings.length;
    const freeCells = isMaintenanceDay
        ? 0
        : timeSlots.reduce((sum, time) => {
            if (isPastSlot(selectedDate, time)) return sum;
            return sum + activeMachines.filter((machine) => (
                !selectedDateBookings.some((booking) => (
                    booking.machineId === machine.id && booking.startTime === time
                ))
            )).length;
        }, 0);

    useEffect(() => {
        const refreshClock = () => setClockNow(new Date());
        const intervalId = window.setInterval(refreshClock, 60_000);
        const nextOpening = getNextAutoOpenDate(new Date(), settings).getTime();
        const openingTimerId = window.setTimeout(refreshClock, Math.max(nextOpening - Date.now(), 0) + 100);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshClock();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            window.clearTimeout(openingTimerId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [activeBookingWeekStartKey, settings]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!userId) {
            navigate('/login');
            return;
        }

        preloadDashboardRoute();
    }, [navigate, userId]);

    useEffect(() => {
        const isSelectedInWeek = selectedDate.getTime() >= displayStart.getTime()
            && selectedDate.getTime() <= activeBookingWeekEnd.getTime();

        if (!isSelectedInWeek) {
            setSelectedDate(displayStart);
        }
    }, [activeBookingWeekEnd, displayStart, selectedDate]);

    useEffect(() => {
        if (!userId) return;
        let active = true;

        setLoadError(null);
        if (!hasCachedSnapshot) {
            setLoading(true);
        }

        void residentSnapshotService.getBookingSnapshot(weekIds)
            .then((snapshot) => {
                if (!active || !isMountedRef.current) return;
                startTransition(() => {
                    setMachines(snapshot.machines);
                    setBookings(snapshot.weekBookings);
                    setSettings(snapshot.settings);
                });
                setLoading(false);
            })
            .catch((error) => {
                console.error('Weekly slots snapshot fetch error:', error);
                if (!active || !isMountedRef.current) return;
                setLoadError('Live slot data could not be loaded right now.');
                setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [hasCachedSnapshot, reloadKey, userId, weekIds]);

    useEffect(() => {
        if (!userId || loading) return;

        let active = true;
        let unsubscribeMachines = () => { /* noop */ };
        let unsubscribeBookings = () => { /* noop */ };

        void loadResidentLiveService()
            .then(({ residentLiveService }) => {
                if (!active || !isMountedRef.current) return;

                unsubscribeMachines = residentLiveService.subscribeToMachines((nextMachines) => {
                    if (!active || !isMountedRef.current) return;
                    startTransition(() => setMachines(nextMachines));
                });

                unsubscribeBookings = residentLiveService.subscribeToBookingsForWeekIds(weekIds, (nextBookings) => {
                    if (!active || !isMountedRef.current) return;
                    startTransition(() => setBookings(nextBookings));
                });
            })
            .catch((error) => {
                console.error('Failed to attach weekly slot streams', error);
            });

        return () => {
            active = false;
            unsubscribeBookings();
            unsubscribeMachines();
        };
    }, [loading, userId, weekIds]);

    const refreshSelectedDate = async () => {
        try {
            const latestDateBookings = await residentFirestoreService.getBookingsForDate(selectedDateKey);
            startTransition(() => {
                setBookings((currentBookings) => {
                    const otherBookings = currentBookings.filter((booking) => booking.date !== selectedDateKey);
                    return [...otherBookings, ...latestDateBookings];
                });
            });
            return true;
        } catch (error) {
            console.error('Failed to refresh weekly selected date', error);
            return false;
        }
    };

    const handleBookSlot = async (machine: Machine, time: string) => {
        if (!user || pendingSlotId) return;
        const existingSlotBooking = selectedDateBookings.find((booking) => (
            booking.machineId === machine.id && booking.startTime === time
        ));

        if (settings.forceCloseBookings || !isBookingOpen || !isSelectedInActiveWeek || isMaintenanceDay || machine.status !== 'available' || isPastSlot(selectedDate, time) || existingSlotBooking) {
            notifyError(t.unavailable);
            return;
        }

        if (userWeeklyBooking) {
            notifyInfo(t.yourWeekBooking);
            return;
        }

        const slotId = `${selectedDateKey}_${machine.id}_${time.replace(':', '-')}`;
        setPendingSlotId(slotId);

        const bookingData: Booking = {
            id: Date.now().toString(),
            machineId: machine.id,
            studentId: user.id,
            studentName: user.name,
            roomNumber: user.roomNumber,
            date: selectedDateKey,
            startTime: time,
            endTime: addMinutesToTimeString(time, slotDurationMinutes),
            weekId: getBelarusWeekId(selectedDate),
            createdAt: Date.now(),
        };

        try {
            const { residentMutationsService } = await loadResidentMutationsService();
            const result = await residentMutationsService.createBooking(bookingData);
            if (!result.success) {
                if (isBookingAvailabilityConflict(result.errorCode, result.error)) {
                    const refreshed = await refreshSelectedDate();
                    notifyInfo(refreshed ? t.conflictToast : t.unavailable);
                    return;
                }

                notifyError(getBookNowFailureMessage(result.errorCode, result.error));
                return;
            }

            const createdBooking = result.booking ?? {
                ...bookingData,
                id: slotId,
            };
            hapticSuccess();
            startTransition(() => {
                setBookings((currentBookings) => upsertBooking(currentBookings, createdBooking));
            });
            notifySuccess(t.bookedToast);
        } catch (error) {
            console.error('Weekly slot booking failed:', error);
            notifyError('System error. Please try again.');
        } finally {
            setPendingSlotId(null);
        }
    };

    if (loading) {
        return (
            <div className="container" style={{ paddingBottom: '100px' }}>
                <div className="weekly-slots-skeleton">
                    {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="glass-panel skeleton-pulse" style={{ height: item === 1 ? '128px' : '86px', borderRadius: '16px' }} />
                    ))}
                </div>
            </div>
        );
    }

    if (loadError && machines.length === 0 && bookings.length === 0) {
        return (
            <div className="container flex-center" style={{ minHeight: '100vh', padding: '24px' }}>
                <DataLoadNotice
                    tone="error"
                    title={t.errorTitle}
                    description={loadError}
                    onRetry={() => setReloadKey((current) => current + 1)}
                    retryLabel={t.retry}
                />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="container weekly-slots-page">
            <header className="weekly-slots-header">
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    onMouseEnter={preloadDashboardRoute}
                    onTouchStart={preloadDashboardRoute}
                    className="glass-button"
                    aria-label={t.back}
                    style={{ width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                    <ChevronLeft size={22} />
                </button>
                <div>
                    <h2>{t.title}</h2>
                    <p>{formatBelarusLongDateLabel(displayStart, dateLocale)} - {formatBelarusLongDateLabel(activeBookingWeekEnd, dateLocale)}</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        const nextLanguage: ResidentPortalLanguage = language === 'ru' ? 'en' : 'ru';
                        setLanguage(nextLanguage);
                        setResidentPortalLanguage(nextLanguage);
                    }}
                    className="glass-button weekly-slots-language-button"
                >
                    <Languages size={16} />
                    <span>{t.switchLanguage}</span>
                </button>
            </header>

            <section className="weekly-slots-overview">
                <div className="glass-panel weekly-slots-open-banner">
                    <div className="weekly-slots-open-icon">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h3>{t.openAllWeek}</h3>
                        <p>{t.openAllWeekCopy}</p>
                        <span>{windowDisplay.openDay} {windowDisplay.openTime} - {windowDisplay.closeDay} {windowDisplay.closeTime}</span>
                    </div>
                </div>

                <div className="weekly-slots-stats">
                    <div className="glass-panel">
                        <CalendarDays size={20} />
                        <div>
                            <span>{t.selectedDate}</span>
                            <strong>{formatBelarusLongDateLabel(selectedDate, dateLocale)}</strong>
                        </div>
                    </div>
                    <div className="glass-panel">
                        <CheckCircle2 size={20} />
                        <div>
                            <span>{t.freeSlots}</span>
                            <strong>{freeCells}</strong>
                        </div>
                    </div>
                    <div className="glass-panel">
                        <Washer size={20} />
                        <div>
                            <span>{t.bookedSlots}</span>
                            <strong>{bookedCells}/{totalCells}</strong>
                        </div>
                    </div>
                </div>
            </section>

            {loadError && (
                <div style={{ marginBottom: '16px' }}>
                    <DataLoadNotice
                        compact
                        title="Showing saved slots"
                        description={loadError}
                        onRetry={() => setReloadKey((current) => current + 1)}
                        retryLabel={t.retry}
                    />
                </div>
            )}

            <section
                className={`weekly-slots-date-strip${dateOptions.length > 7 ? ' weekly-slots-date-strip--extended' : ''}`}
                aria-label={t.selectedDate}
            >
                {dateOptions.map((date) => {
                    const isSelected = isSameBelarusDay(date, selectedDate);
                    const isPastDate = date.getTime() < getBelarusDate(clockNow).getTime();
                    const isMaintenanceDate = getBelarusWeekday(date) === maintenanceDay;
                    return (
                        <button
                            key={date.toISOString()}
                            type="button"
                            onClick={() => {
                                hapticSelection();
                                setSelectedDate(date);
                            }}
                            className={[
                                'glass-panel',
                                'weekly-slots-date-button',
                                isSelected ? 'weekly-slots-date-button--selected' : '',
                                isPastDate ? 'weekly-slots-date-button--past' : '',
                                isMaintenanceDate ? 'weekly-slots-date-button--maintenance' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            <div className="weekly-slots-date-weekday">
                                {formatBelarusWeekdayLabel(date, dateLocale).slice(0, 3)}
                            </div>
                            <div className="weekly-slots-date-number">{date.getUTCDate()}</div>
                            {isMaintenanceDate && (
                                <span className="weekly-slots-date-badge">{t.maintenance}</span>
                            )}
                        </button>
                    );
                })}
            </section>

            <div className="weekly-slots-help">
                {!isSelectedInActiveWeek
                    ? t.currentWeekendView
                    : isMaintenanceDay
                        ? t.maintenanceDay
                        : (userWeeklyBooking ? t.yourWeekBooking : t.chooseFreeSlot)}
            </div>

            {settings.forceCloseBookings && (
                <div className="glass-panel weekly-slots-closed">
                    <AlertCircle size={20} />
                    <span>{t.closed}</span>
                </div>
            )}

            <section className="weekly-slots-board-wrap">
                <div
                    className="weekly-slots-board"
                    style={{ gridTemplateColumns: `minmax(68px, 0.62fr) repeat(${Math.max(machines.length, 1)}, minmax(116px, 1fr))` }}
                >
                    <div className="weekly-slots-board-head">
                        <Clock size={16} />
                    </div>
                    {machines.map((machine) => (
                        <div key={machine.id} className="weekly-slots-board-head weekly-slots-machine-head">
                            <Washer size={16} />
                            <span>{machine.name || `${t.machine} ${machine.id}`}</span>
                        </div>
                    ))}

                    {timeSlots.map((time) => (
                        <Fragment key={time}>
                            <div key={`${time}-label`} className="weekly-slots-time-cell">
                                {time}
                            </div>
                            {machines.map((machine) => {
                                const booking = selectedDateBookings.find((currentBooking) => (
                                    currentBooking.machineId === machine.id && currentBooking.startTime === time
                                ));
                                const slotId = `${selectedDateKey}_${machine.id}_${time.replace(':', '-')}`;
                                const isPending = pendingSlotId === slotId;
                                const isPast = isPastSlot(selectedDate, time);
                                const isUnavailable = settings.forceCloseBookings || !isBookingOpen || !isSelectedInActiveWeek || isMaintenanceDay || machine.status === 'maintenance' || isPast;
                                const isBookedByUser = booking?.studentId === user.id;
                                const canBook = !booking && !isUnavailable && !userWeeklyBooking;

                                if (booking) {
                                    return (
                                        <div
                                            key={slotId}
                                            className={`weekly-slots-cell weekly-slots-cell--booked${isBookedByUser ? ' weekly-slots-cell--mine' : ''}`}
                                        >
                                            <span>{isBookedByUser ? t.bookedByYou : t.booked}</span>
                                            <strong>{getResidentShortNameForLanguage(booking.studentName || 'Resident', isRussian)}</strong>
                                            <small>{booking.roomNumber ? `Room ${booking.roomNumber}` : ''}</small>
                                        </div>
                                    );
                                }

                                return (
                                    <button
                                        key={slotId}
                                        type="button"
                                        disabled={!canBook || isPending}
                                        onClick={() => void handleBookSlot(machine, time)}
                                        className={`weekly-slots-cell weekly-slots-cell--free${canBook ? ' weekly-slots-cell--bookable' : ''}`}
                                    >
                                        {isPending ? (
                                            <>
                                                <ActionSpinner size={16} tone="neutral" />
                                                <strong>{t.reserving}</strong>
                                            </>
                                        ) : (
                                            <>
                                                <span>
                                                    {isMaintenanceDay || machine.status === 'maintenance'
                                                        ? t.maintenance
                                                        : isPast
                                                            ? t.passed
                                                            : t.free}
                                                </span>
                                                <strong>{canBook ? t.book : t.free}</strong>
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </section>

            <div className="weekly-slots-live-pill">
                <span />
                {t.live}
            </div>
        </div>
    );
}
