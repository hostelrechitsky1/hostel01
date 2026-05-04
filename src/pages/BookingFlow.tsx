import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { DEFAULT_APP_SETTINGS, residentFirestoreService } from '../services/residentFirestoreService';
import { residentSnapshotService } from '../services/residentSnapshotService';
import type { AppSettings, Booking, Machine } from '../types';
import { TIME_SLOTS } from '../types';
import { Clock, ChevronLeft, AlertCircle, Activity } from 'lucide-react';
import { DataLoadNotice } from '../components/DataLoadNotice';
import {
    addMinutesToTimeString,
    addBelarusDays,
    formatBelarusDate,
    formatBelarusMonthDayLabel,
    formatBelarusWeekdayLabel,
    getBelarusDate,
    getBelarusNow,
    getBelarusWeekStart,
    getBelarusWeekday,
    getBelarusWeekId,
    formatBelarusClockLabel,
    isSameBelarusDay,
} from '../utils/time';
import { enumerateBookingStripDates, getResidentBookingWeekContext } from '../utils/residentBookingContext';
import MachineQrOverview from '../components/MachineQrOverview';
import { preloadDashboardRoute } from '../utils/preloadRoutes';
import { useSlowLoadFlag } from '../utils/useSlowLoadFlag';
import { hapticSelection, hapticSoftPulse, hapticSuccess } from '../utils/haptics';
import { ActionSpinner } from '../components/ActionSpinner';
import { finishResidentPerfSpan } from '../utils/performance';
import { notifyError, notifyInfo } from '../utils/notify';
import { getBookNowFailureMessage, isBookingAvailabilityConflict } from '../utils/bookingMutations';

let confettiPromise: Promise<typeof import('react-confetti')> | null = null;

const preloadConfetti = () => {
    confettiPromise ??= import('react-confetti');
    return confettiPromise;
};

const LazyConfetti = lazy(() => preloadConfetti());
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

const replaceBookingsForDate = (bookings: Booking[], date: string, nextDateBookings: Booking[]) => {
    const bookingsForOtherDates = bookings.filter((booking) => booking.date !== date);
    return [...bookingsForOtherDates, ...nextDateBookings];
};

export default function BookingFlow() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const qrFromUrl = searchParams.get('qr') === '1';
    const machineFromUrl = searchParams.get('machine');
    const user = bookingService.getCurrentUser();
    const userId = user?.id ?? '';
    const bookingWeekIds = useMemo(() => {
        const currentWeekStart = getBelarusWeekStart(getBelarusDate());
        return [
            getBelarusWeekId(currentWeekStart),
            getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
        ];
    }, []);
    const cachedBookingSnapshot = useMemo(
        () => residentSnapshotService.getCachedBookingSnapshot(bookingWeekIds),
        [bookingWeekIds]
    );
    const cachedDashboardSnapshot = useMemo(
        () => residentSnapshotService.getCachedDashboardSnapshot(bookingWeekIds),
        [bookingWeekIds]
    );
    const cachedCoreWarmSnapshot = useMemo(
        () => (userId ? residentSnapshotService.getCachedWarmSnapshot(bookingWeekIds, userId, false) : undefined),
        [bookingWeekIds, userId]
    );
    const cachedMachines = cachedBookingSnapshot?.machines ?? cachedDashboardSnapshot?.machines ?? cachedCoreWarmSnapshot?.machines;
    const cachedWeekBookings = cachedBookingSnapshot?.weekBookings ?? cachedDashboardSnapshot?.weekBookings ?? cachedCoreWarmSnapshot?.weekBookings;
    const cachedSettings = cachedBookingSnapshot?.settings ?? cachedDashboardSnapshot?.settings ?? cachedCoreWarmSnapshot?.settings;
    const hasCachedMachines = cachedMachines !== undefined;
    const hasCachedWeekBookings = cachedWeekBookings !== undefined;

    // Hooks must be called unconditionally
    const [selectedDate, setSelectedDate] = useState(getBelarusDate());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [pendingBooking, setPendingBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState(() => Boolean(userId) && (!hasCachedMachines || !hasCachedWeekBookings));
    const [submitting, setSubmitting] = useState(false);
    const [liveSyncRequested, setLiveSyncRequested] = useState(false);
    const [liveSyncAttached, setLiveSyncAttached] = useState(false);
    const [settings, setSettings] = useState<AppSettings>(() => cachedSettings ?? DEFAULT_APP_SETTINGS);
    const [reloadKey, setReloadKey] = useState(0);
    const [loadIssue, setLoadIssue] = useState<'saved' | 'error' | null>(null);
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

    // Async State
    const [machines, setMachines] = useState<Machine[]>(() => cachedMachines ?? []);
    const [bookings, setBookings] = useState<Booking[]>(() => cachedWeekBookings ?? []);
    const selectedDateKey = useMemo(() => formatBelarusDate(selectedDate), [selectedDate]);
    const hasBookingSnapshot = hasCachedMachines
        || hasCachedWeekBookings
        || machines.length > 0
        || bookings.length > 0;
    const bookingLoadSlow = useSlowLoadFlag(loading, 4500);
    const bookingSnapshotRef = useRef(hasBookingSnapshot);
    const liveSyncReasonRef = useRef<'interaction' | 'idle' | 'retry' | null>(null);
    const bookingShellMetricRef = useRef(false);
    const bookingDataMetricRef = useRef(false);
    const bookingLiveMetricRef = useRef(false);

    useEffect(() => {
        bookingSnapshotRef.current = hasBookingSnapshot;
    }, [hasBookingSnapshot]);

    useEffect(() => {
        bookingShellMetricRef.current = false;
        bookingDataMetricRef.current = false;
        bookingLiveMetricRef.current = false;
        liveSyncReasonRef.current = null;
        setLiveSyncRequested(false);
        setLiveSyncAttached(false);
    }, [userId]);

    useEffect(() => {
        if (!userId || bookingShellMetricRef.current) return;
        bookingShellMetricRef.current = true;
        finishResidentPerfSpan('resident:dashboard-to-booking-shell', {
            cachedCore: hasBookingSnapshot,
            source: cachedBookingSnapshot
                ? 'snapshot'
                : (cachedDashboardSnapshot ? 'dashboard-snapshot' : (cachedCoreWarmSnapshot ? 'warm-snapshot' : 'resource-cache')),
        });
    }, [cachedBookingSnapshot, cachedCoreWarmSnapshot, cachedDashboardSnapshot, hasBookingSnapshot, userId]);

    useEffect(() => {
        if (!userId || loading || bookingDataMetricRef.current) return;
        bookingDataMetricRef.current = true;
        finishResidentPerfSpan('resident:booking-data-ready', {
            cachedCore: hasBookingSnapshot,
            source: cachedBookingSnapshot
                ? 'snapshot'
                : (cachedDashboardSnapshot ? 'dashboard-snapshot' : (cachedCoreWarmSnapshot ? 'warm-snapshot' : 'resource-cache')),
        });
    }, [cachedBookingSnapshot, cachedCoreWarmSnapshot, cachedDashboardSnapshot, hasBookingSnapshot, loading, userId]);

    useEffect(() => {
        if (!userId || !liveSyncAttached || bookingLiveMetricRef.current) return;
        bookingLiveMetricRef.current = true;
        finishResidentPerfSpan('resident:booking-live-ready', {
            source: liveSyncReasonRef.current ?? 'unknown',
        });
    }, [liveSyncAttached, userId]);

    useEffect(() => {
        if (!bookingLoadSlow || !loading || !hasBookingSnapshot) {
            return;
        }

        setLoadIssue('saved');
        setLoadErrorMessage('Showing saved slot data while live availability reconnects in the background.');
        setLoading(false);
    }, [bookingLoadSlow, hasBookingSnapshot, loading]);

    const requestLiveSync = (reason: 'interaction' | 'idle' | 'retry') => {
        if (!liveSyncReasonRef.current || liveSyncReasonRef.current === 'idle') {
            liveSyncReasonRef.current = reason;
        }

        if (reason !== 'idle') {
            void loadResidentLiveService();
        }

        setLiveSyncRequested(true);
    };

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

        void residentSnapshotService.getBookingSnapshot(bookingWeekIds)
            .then((snapshot) => {
                if (!isMounted) return;

                machinesReady = true;
                bookingsReady = true;

                startTransition(() => {
                    setMachines(snapshot.machines);
                    setBookings(snapshot.weekBookings);
                    setSettings(snapshot.settings);
                });

                finishLoadingIfReady();
            })
            .catch((error) => {
                handleBookingLoadError('Booking snapshot fetch error:', error);
                notifyError('Failed to load booking settings. Using saved defaults.');
            });

        return () => {
            isMounted = false;
        };
    }, [bookingWeekIds, navigate, reloadKey, userId]);

    useEffect(() => {
        if (!userId || loading || liveSyncRequested) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            requestLiveSync('idle');
        }, 2200);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [liveSyncRequested, loading, reloadKey, userId]);

    useEffect(() => {
        if (!userId || loading || typeof window === 'undefined') {
            return;
        }

        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;
        const idleWindow = window as Window & typeof globalThis & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        const prewarmBookingInteractions = () => {
            void loadResidentMutationsService();
            void preloadConfetti();
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleHandle = idleWindow.requestIdleCallback(() => {
                idleHandle = null;
                prewarmBookingInteractions();
            }, { timeout: 1200 });
        } else {
            timeoutHandle = window.setTimeout(prewarmBookingInteractions, 320);
        }

        return () => {
            if (idleHandle !== null) {
                idleWindow.cancelIdleCallback?.(idleHandle);
            }
            if (timeoutHandle !== null) {
                window.clearTimeout(timeoutHandle);
            }
        };
    }, [loading, userId]);

    useEffect(() => {
        if (!userId || !liveSyncRequested) {
            return;
        }

        let isMounted = true;
        let unsubscribeMachines = () => { /* noop */ };
        let unsubscribeBookings = () => { /* noop */ };
        let idleHandle: number | null = null;
        let liveAttachTimeoutId: number | null = null;
        const liveSyncReason = liveSyncReasonRef.current;

        const attachLiveStreams = () => {
            void loadResidentLiveService()
                .then(({ residentLiveService }) => {
                    if (!isMounted) return;

                    setLiveSyncAttached(true);

                    unsubscribeMachines = residentLiveService.subscribeToMachines((nextMachines) => {
                        if (!isMounted) return;
                        startTransition(() => {
                            setMachines(nextMachines);
                        });
                    }, (error) => {
                        console.error('Machine streaming error:', error);
                    });

                    unsubscribeBookings = residentLiveService.subscribeToBookingsForDate(selectedDateKey, (nextBookings) => {
                        if (!isMounted) return;
                        startTransition(() => {
                            setBookings((currentBookings) => replaceBookingsForDate(currentBookings, selectedDateKey, nextBookings));
                        });
                    }, (error) => {
                        console.error('Booking streaming error:', error);
                    });
                })
                .catch((error) => {
                    console.error('Failed to attach resident live booking streams', error);
                });
        };

        if (typeof window === 'undefined') {
            attachLiveStreams();
        } else if (liveSyncReason === 'interaction' || liveSyncReason === 'retry') {
            attachLiveStreams();
        } else {
            const idleWindow = window as Window & typeof globalThis & {
                requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                cancelIdleCallback?: (handle: number) => void;
            };

            if (typeof idleWindow.requestIdleCallback === 'function') {
                idleHandle = idleWindow.requestIdleCallback(() => {
                    idleHandle = null;
                    attachLiveStreams();
                }, { timeout: 900 });
            } else {
                liveAttachTimeoutId = window.setTimeout(attachLiveStreams, 120);
            }
        }

        return () => {
            isMounted = false;
            if (liveAttachTimeoutId !== null) {
                window.clearTimeout(liveAttachTimeoutId);
            }
            if (idleHandle !== null) {
                const idleWindow = window as Window & typeof globalThis & {
                    cancelIdleCallback?: (handle: number) => void;
                };
                idleWindow.cancelIdleCallback?.(idleHandle);
            }
            unsubscribeBookings();
            unsubscribeMachines();
        };
    }, [liveSyncRequested, reloadKey, selectedDateKey, userId]);

    useEffect(() => {
        if (searchParams.get('scan') !== '1') return;
        const next = new URLSearchParams(searchParams);
        next.delete('scan');
        if (!next.get('qr')) next.set('qr', '1');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!machineFromUrl || machines.length === 0) return;
        const match = machines.find((m) => m.id === machineFromUrl);
        if (match) setSelectedMachine(match);
    }, [machineFromUrl, machines]);

    useEffect(() => {
        if (!userId || !liveSyncRequested || !qrFromUrl) return;
        const todayKey = formatBelarusDate(getBelarusDate());
        if (todayKey === selectedDateKey) return;

        let cancelled = false;
        let unsubscribe = () => { /* noop */ };

        void loadResidentLiveService().then(({ residentLiveService }) => {
            if (cancelled) return;
            unsubscribe = residentLiveService.subscribeToBookingsForDate(todayKey, (nextBookings) => {
                if (cancelled) return;
                startTransition(() => {
                    setBookings((currentBookings) => replaceBookingsForDate(currentBookings, todayKey, nextBookings));
                });
            });
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [userId, liveSyncRequested, qrFromUrl, selectedDateKey]);

    const activeMachines = useMemo(() => machines.filter(m => m.status === 'available'), [machines]);

    const dateOptions = useMemo(
        () => enumerateBookingStripDates(getResidentBookingWeekContext(new Date(), settings)),
        [settings],
    );

    const todayKeyForQr = formatBelarusDate(getBelarusDate());
    const bookingsToday = useMemo(
        () => bookings.filter((b) => b.date === todayKeyForQr),
        [bookings, todayKeyForQr],
    );
    const belarusNowForQr = getBelarusNow();
    const qrNowMinutes = belarusNowForQr.getUTCHours() * 60 + belarusNowForQr.getUTCMinutes();

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
        if (!showConfirmation) return;
        const timer = window.setTimeout(() => setShowConfirmation(false), 1800);
        return () => window.clearTimeout(timer);
    }, [showConfirmation]);

    useEffect(() => {
        if (!showConfirmModal) return;
        void preloadConfetti();
    }, [showConfirmModal]);

    const availability = useMemo(() => {
        const dateBookings = bookings.filter(b => b.date === selectedDateKey);
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
    }, [activeMachines, bookings, selectedDate, selectedDateKey]);


    const totalSlotsPerTime = activeMachines.length;
    const totalRemainingForDay = useMemo(() => {
        return availability.reduce((sum, slot) => {
            if (slot.isPassed) return sum;
            const remaining = Math.max(totalSlotsPerTime - slot.bookedMachineIds.length, 0);
            return sum + remaining;
        }, 0);
    }, [availability, totalSlotsPerTime]);

    const refreshDateAvailability = async (dateKey: string) => {
        requestLiveSync('interaction');

        try {
            const latestDateBookings = await residentFirestoreService.getBookingsForDate(dateKey);
            startTransition(() => {
                setBookings((currentBookings) => replaceBookingsForDate(currentBookings, dateKey, latestDateBookings));
            });
            return true;
        } catch (error) {
            console.error('Failed to refresh selected date availability', error);
            return false;
        }
    };

    const handleBook = async () => {
        if (!selectedSlot || !selectedMachine || !user || submitting) return;
        setSubmitting(true);

        const startTime = selectedSlot;

        // Stale Tab Validation: Prevent booking past slots if UI was left open
        if (isSameBelarusDay(selectedDate, getBelarusDate())) {
            const now = getBelarusNow();
            const [h, m] = startTime.split(':').map(Number);
            if (h < now.getUTCHours() || (h === now.getUTCHours() && m < now.getUTCMinutes())) {
                notifyError('This slot has already passed. Please refresh.');
                setSubmitting(false);
                return;
            }
        }

        const endTime = addMinutesToTimeString(startTime, 90);

        const bookingData: Booking = {
            id: Date.now().toString(),
            machineId: selectedMachine.id,
            studentId: user.id,
            studentName: user.name,
            roomNumber: user.roomNumber,
            date: selectedDateKey,
            startTime,
            endTime,
            weekId: getBelarusWeekId(selectedDate),
            createdAt: Date.now()
        };
        let bookingSucceeded = false;
        setPendingBooking(bookingData);

        try {
            const { residentMutationsService } = await loadResidentMutationsService();
            const result = await residentMutationsService.createBooking(bookingData);
            if (result.success) {
                bookingSucceeded = true;
                const createdBooking = result.booking ?? {
                    ...bookingData,
                    id: `${bookingData.date}_${bookingData.machineId}_${bookingData.startTime.replace(':', '-')}`,
                };
                hapticSuccess();
                startTransition(() => {
                    setBookings((currentBookings) => upsertBooking(currentBookings, createdBooking));
                });
                setShowConfirmModal(false);
                setShowConfirmation(true);
                setSelectedMachine(null);
                setPendingBooking(null);
                requestLiveSync('interaction');
                void refreshDateAvailability(createdBooking.date);
            } else {
                const isAvailabilityConflict = isBookingAvailabilityConflict(result.errorCode, result.error);

                if (isAvailabilityConflict) {
                    const refreshed = await refreshDateAvailability(bookingData.date);
                    setShowConfirmModal(false);
                    setSelectedMachine(null);
                    notifyInfo(
                        refreshed
                            ? 'That slot was just booked by another resident. Availability refreshed.'
                            : 'That slot is no longer available. Live availability is reconnecting.'
                    );
                    return;
                }

                if (result.errorCode === 'weekly_limit') {
                    setShowConfirmModal(false);
                    setSelectedMachine(null);
                }

                notifyError(getBookNowFailureMessage(result.errorCode, result.error));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Please try again.';
            const errorCode = typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code ?? '')
                : '';
            console.error('Booking transaction failed:', error);
            console.error('Error details:', errorMessage, errorCode);
            notifyError(`System error: ${errorMessage}`);
        } finally {
            if (!bookingSucceeded) {
                setPendingBooking(null);
            }
            setSubmitting(false);
        }
    };

    const maintenanceDay = typeof settings.maintenanceDay === 'number' ? settings.maintenanceDay : 3;
    const isMaintenanceDay = getBelarusWeekday(selectedDate) === maintenanceDay;
    const maintenanceDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][maintenanceDay];
    const retryBookingData = () => {
        requestLiveSync('retry');
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

    const showBlockingBookingNotice = (loading && bookingLoadSlow && !hasBookingSnapshot)
        || (!loading && loadIssue === 'error' && !hasBookingSnapshot);

    if (loading && !showBlockingBookingNotice) {
        return (
            <div className="container" style={{ paddingBottom: '100px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
                className="container flex-center"
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

    if (settings.forceCloseBookings) {
        return (
            <div className="container flex-center" style={{
                minHeight: '80vh',
                flexDirection: 'column',
                textAlign: 'center',
                color: 'var(--text-main)',
                padding: '20px'
            }}
            >
                <h2 style={{ fontSize: '28px', marginBottom: '12px', fontWeight: 700 }}>
                    Bookings Are Paused
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '16px' }}>
                    Temporarily disabled by admin.
                </p>

                <button
                    type="button"
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
        <div className="container" style={{ paddingBottom: '100px' }}>
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

            {qrFromUrl && machines.length > 0 && (
                <MachineQrOverview
                    machines={machines}
                    bookingsForToday={bookingsToday}
                    nowMinutes={qrNowMinutes}
                    highlightMachineId={machineFromUrl}
                    clockLabel={formatBelarusClockLabel(belarusNowForQr, 'en-US')}
                />
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
                                onClick={() => {
                                    requestLiveSync('interaction');
                                    setSelectedDate(date);
                                    setSelectedSlot(null);
                                    setSelectedMachine(null);
                                }}
                                className="glass-panel"
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
                                            requestLiveSync('interaction');
                                            void loadResidentMutationsService();
                                            void preloadConfetti();
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
                                            const bookingForMachine = bookings.find(b => b.date === selectedDateKey && b.startTime === time && b.machineId === m.id);
                                            const isPendingBooking = pendingBooking?.date === selectedDateKey
                                                && pendingBooking.startTime === time
                                                && pendingBooking.machineId === m.id;
                                            const isBooked = Boolean(bookingForMachine) || isPendingBooking;
                                            const isBookedByUser = bookingForMachine?.studentId === user?.id || isPendingBooking;
                                            return (
                                                <button
                                                    key={m.id}
                                                    disabled={isBooked}
                                                    onClick={() => {
                                                        if (!isBooked) {
                                                            requestLiveSync('interaction');
                                                            void loadResidentMutationsService();
                                                            void preloadConfetti();
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
                                                    {isBooked && (
                                                        <div style={{ fontSize: '10px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                            {isPendingBooking ? <ActionSpinner size={10} tone="neutral" /> : null}
                                                            <span>{isPendingBooking ? 'Reserving...' : isBookedByUser ? '(Booked by you)' : '(Booked)'}</span>
                                                        </div>
                                                    )}
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

                                {submitting && (
                                    <div
                                        style={{
                                            marginBottom: '18px',
                                            padding: '12px 14px',
                                            borderRadius: '14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            background: 'linear-gradient(135deg, rgba(124, 124, 255, 0.16) 0%, rgba(59, 130, 246, 0.1) 100%)',
                                            border: '1px solid rgba(129, 140, 248, 0.18)',
                                            color: 'rgba(255,255,255,0.9)'
                                        }}
                                    >
                                        <ActionSpinner size={18} tone="primary" />
                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>
                                            Locking your slot and checking for conflicts...
                                        </span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => setShowConfirmModal(false)}
                                        disabled={submitting}
                                        className="glass-button"
                                        style={{ padding: '12px 24px', borderRadius: '12px', opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
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
                                        {submitting ? (
                                            <>
                                                <ActionSpinner size={16} tone="inverted" />
                                                Processing...
                                            </>
                                        ) : 'Confirm'}
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
                                <div
                                    className="animate-fade-in"
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.2)', width: '80px', height: '80px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                                    }}
                                >
                                    <svg viewBox="0 0 50 50" width="40" height="40">
                                        <path
                                            fill="none"
                                            stroke="#10b981"
                                            strokeWidth="5"
                                            d="M 14.1 27.2 l 7.1 7.2 16.7-16.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
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
