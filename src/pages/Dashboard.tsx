import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { DEFAULT_APP_SETTINGS, residentFirestoreService } from '../services/residentFirestoreService';
import { residentSnapshotService } from '../services/residentSnapshotService';
import type { Machine, Booking, Banner, AppSettings, Student } from '../types';
import { TIME_SLOTS } from '../types';
import { LogOut, AlertCircle, AlertTriangle, Info, Activity, ChevronDown, Check, WashingMachine as Washer } from 'lucide-react';
import BannerCarousel from '../components/BannerCarousel';
import { DataLoadNotice } from '../components/DataLoadNotice';
import { warmBannerImages } from '../utils/bannerImages';
import { addBelarusDays, formatBelarusClockLabel, formatBelarusDate, getBelarusDate, getBelarusNow, getBelarusWeekStart, getBelarusWeekday, getBelarusWeekId, getTimeStringMinutes, isAutoBookingWindowOpen } from '../utils/time';
import { preloadBookingRoute } from '../utils/preloadRoutes';
import { useSlowLoadFlag } from '../utils/useSlowLoadFlag';
import { useViewportActivation } from '../utils/useViewportActivation';
import { warmResidentAppData } from '../utils/warmResidentApp';
import { hapticSelection, hapticSoftPulse } from '../utils/haptics';
import { finishResidentPerfSpan, startResidentPerfSpan } from '../utils/performance';

const RECENT_BOOKINGS_LIMIT = 12;
const LazyDashboardFeedback = lazy(() => import('../components/DashboardFeedback'));
const LazyDashboardBookingSummary = lazy(() => import('../components/DashboardBookingSummary'));
let residentLiveServicePromise: Promise<typeof import('../services/residentLiveService')> | null = null;

const loadResidentLiveService = () => {
    residentLiveServicePromise ??= import('../services/residentLiveService');
    return residentLiveServicePromise;
};

const upsertBooking = (bookings: Booking[], nextBooking: Booking) => {
    const withoutExisting = bookings.filter((booking) => booking.id !== nextBooking.id);
    return [...withoutExisting, nextBooking];
};

const getResidentInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'R';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
};

const getResidentShortName = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return parts.join(' ');
    return `${parts[0]} ${parts[parts.length - 1]}`;
};

const getInitialRoommates = (currentUser: Student | null) => {
    if (!currentUser?.roomNumber) return [];

    const cachedRoommates = bookingService
        .getCurrentRoommates()
        .filter((student) => student.roomNumber === currentUser.roomNumber);

    if (cachedRoommates.length > 0) {
        return cachedRoommates;
    }

    return [currentUser];
};

export default function Dashboard() {
    const navigate = useNavigate();
    const [user, setUser] = useState<Student | null>(() => bookingService.getCurrentUser());
    const userId = user?.id ?? '';
    const {
        ref: bookingSummarySectionRef,
        isActive: isBookingSummaryActive,
    } = useViewportActivation<HTMLDivElement>({
        rootMargin: '120px 0px',
        idleTimeout: 1400,
    });
    const {
        ref: feedbackSectionRef,
        isActive: isFeedbackActive,
    } = useViewportActivation<HTMLDivElement>({
        rootMargin: '60px 0px',
        idleTimeout: 2200,
    });
    const [roommates, setRoommates] = useState<Student[]>(() => getInitialRoommates(bookingService.getCurrentUser()));
    const [roommatesLoading, setRoommatesLoading] = useState(false);
    const [isRoommateMenuOpen, setIsRoommateMenuOpen] = useState(false);
    const roommateMenuRef = useRef<HTMLDivElement>(null);
    const roommateHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressRoommateClickRef = useRef(false);
    const dashboardWeekIds = useMemo(() => {
        const currentWeekStart = getBelarusWeekStart(getBelarusDate());
        return [
            getBelarusWeekId(currentWeekStart),
            getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
        ];
    }, []);
    const cachedDashboardSnapshot = useMemo(
        () => residentSnapshotService.getCachedDashboardSnapshot(dashboardWeekIds),
        [dashboardWeekIds]
    );
    const cachedCoreWarmSnapshot = useMemo(() => (
        userId
            ? residentSnapshotService.getCachedWarmSnapshot(dashboardWeekIds, userId, false)
            : undefined
    ), [dashboardWeekIds, userId]);
    const cachedRecentWarmSnapshot = useMemo(() => (
        userId
            ? residentSnapshotService.getCachedWarmSnapshot(dashboardWeekIds, userId, true)
            : undefined
    ), [dashboardWeekIds, userId]);
    const cachedMachines = cachedDashboardSnapshot?.machines ?? cachedCoreWarmSnapshot?.machines;
    const cachedWeekBookings = cachedDashboardSnapshot?.weekBookings ?? cachedCoreWarmSnapshot?.weekBookings;
    const cachedSettings = cachedDashboardSnapshot?.settings ?? cachedCoreWarmSnapshot?.settings;
    const cachedBanners = cachedDashboardSnapshot?.banners ?? cachedCoreWarmSnapshot?.banners;
    const cachedRecentBookings = cachedRecentWarmSnapshot?.recentBookings
        ?? (userId ? residentFirestoreService.getCachedRecentBookingsForStudent(userId, RECENT_BOOKINGS_LIMIT) : undefined);
    const hasCachedMachines = cachedMachines !== undefined;
    const hasCachedWeekBookings = cachedWeekBookings !== undefined;
    const hasCachedRecentBookings = cachedRecentBookings !== undefined;
    const [machines, setMachines] = useState<Machine[]>(() => cachedMachines ?? []);
    const [weekBookings, setWeekBookings] = useState<Booking[]>(() => cachedWeekBookings ?? []);
    const [recentBookings, setRecentBookings] = useState<Booking[]>(() => cachedRecentBookings ?? []);
    const [banners, setBanners] = useState<Banner[]>(() => cachedBanners ?? []);
    const [bannersLoading, setBannersLoading] = useState(() => cachedBanners === undefined);
    const [loading, setLoading] = useState(() => Boolean(userId) && !hasCachedMachines && !hasCachedWeekBookings);
    const [recentBookingsLoading, setRecentBookingsLoading] = useState(() => Boolean(userId) && isBookingSummaryActive && !hasCachedRecentBookings);
    const [recentBookingsHydrated, setRecentBookingsHydrated] = useState(() => hasCachedRecentBookings);
    const [settings, setSettings] = useState<AppSettings>(() => cachedSettings ?? DEFAULT_APP_SETTINGS);
    const [reloadKey, setReloadKey] = useState(0);
    const [loadIssue, setLoadIssue] = useState<'saved' | 'error' | null>(null);
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
    const canOpenRoommateMenu = Boolean(user?.roomNumber);
    const hasResidentSnapshot = hasCachedMachines
        || hasCachedWeekBookings
        || hasCachedRecentBookings
        || cachedBanners !== undefined
        || machines.length > 0
        || weekBookings.length > 0
        || recentBookings.length > 0
        || banners.length > 0;
    const hasCoreResidentSnapshot = hasCachedMachines
        || hasCachedWeekBookings
        || machines.length > 0
        || weekBookings.length > 0;
    const residentLoadSlow = useSlowLoadFlag(loading, 4500);
    const coreResidentSnapshotRef = useRef(hasCoreResidentSnapshot);
    const dashboardShellMetricRef = useRef(false);
    const dashboardDataMetricRef = useRef(false);
    const bannerReadyMetricRef = useRef(false);

    useEffect(() => {
        coreResidentSnapshotRef.current = hasCoreResidentSnapshot;
    }, [hasCoreResidentSnapshot]);

    useEffect(() => {
        dashboardShellMetricRef.current = false;
        dashboardDataMetricRef.current = false;
        bannerReadyMetricRef.current = false;
    }, [userId]);

    useEffect(() => {
        if (!userId || dashboardShellMetricRef.current) return;
        dashboardShellMetricRef.current = true;
        finishResidentPerfSpan('resident:login-to-dashboard-shell', {
            cachedCore: hasCoreResidentSnapshot,
            source: cachedDashboardSnapshot ? 'snapshot' : (cachedCoreWarmSnapshot ? 'warm-snapshot' : 'resource-cache'),
        });
    }, [cachedCoreWarmSnapshot, cachedDashboardSnapshot, hasCoreResidentSnapshot, userId]);

    useEffect(() => {
        if (!userId || loading || dashboardDataMetricRef.current) return;
        dashboardDataMetricRef.current = true;
        finishResidentPerfSpan('resident:login-to-dashboard-data', {
            cachedCore: hasCoreResidentSnapshot,
            cachedRecentBookings: hasCachedRecentBookings,
            source: cachedRecentWarmSnapshot
                ? 'warm-snapshot'
                : (cachedDashboardSnapshot ? 'snapshot' : (cachedCoreWarmSnapshot ? 'warm-core' : 'resource-cache')),
        });
    }, [cachedCoreWarmSnapshot, cachedDashboardSnapshot, cachedRecentWarmSnapshot, hasCachedRecentBookings, hasCoreResidentSnapshot, loading, userId]);

    useEffect(() => {
        if (bannersLoading || bannerReadyMetricRef.current) return;
        if (banners.length > 0) return;

        bannerReadyMetricRef.current = true;
        finishResidentPerfSpan('resident:dashboard-banner-ready', {
            banners: 0,
        });
    }, [banners.length, bannersLoading]);

    useEffect(() => {
        setRoommates(getInitialRoommates(user));
    }, [user?.id, user?.roomNumber]);

    useEffect(() => {
        setRecentBookings(cachedRecentBookings ?? []);
        setRecentBookingsHydrated(hasCachedRecentBookings);
        setRecentBookingsLoading(Boolean(userId) && isBookingSummaryActive && !hasCachedRecentBookings);
    }, [cachedRecentBookings, hasCachedRecentBookings, isBookingSummaryActive, userId]);

    useEffect(() => {
        if (!isRoommateMenuOpen) return;

        const handleOutsidePress = (event: MouseEvent | TouchEvent) => {
            if (roommateMenuRef.current?.contains(event.target as Node)) {
                return;
            }
            setIsRoommateMenuOpen(false);
        };

        document.addEventListener('mousedown', handleOutsidePress);
        document.addEventListener('touchstart', handleOutsidePress);

        return () => {
            document.removeEventListener('mousedown', handleOutsidePress);
            document.removeEventListener('touchstart', handleOutsidePress);
        };
    }, [isRoommateMenuOpen]);

    useEffect(() => {
        return () => {
            if (roommateHoldTimerRef.current) {
                window.clearTimeout(roommateHoldTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!residentLoadSlow || !loading || !hasCoreResidentSnapshot) {
            return;
        }

        setLoadIssue('saved');
        setLoadErrorMessage('Showing saved dashboard data while live updates reconnect in the background.');
        setLoading(false);
    }, [hasCoreResidentSnapshot, loading, residentLoadSlow]);

    useEffect(() => {
        if (!userId) {
            return;
        }

        if (typeof window === 'undefined') {
            preloadBookingRoute();
            return;
        }

        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;
        const idleWindow = window as Window & typeof globalThis & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleHandle = idleWindow.requestIdleCallback(() => {
                idleHandle = null;
                preloadBookingRoute();
            }, { timeout: 1400 });
        } else {
            timeoutHandle = window.setTimeout(preloadBookingRoute, 420);
        }

        return () => {
            if (idleHandle !== null) {
                idleWindow.cancelIdleCallback?.(idleHandle);
            }
            if (timeoutHandle !== null) {
                window.clearTimeout(timeoutHandle);
            }
        };
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            navigate('/login');
            return;
        }

        let isMounted = true;
        let machinesReady = hasCachedMachines;
        let weekBookingsReady = hasCachedWeekBookings;
        let unsubscribeMachines = () => { /* noop */ };
        let unsubscribeWeekBookings = () => { /* noop */ };
        let liveAttachTimeoutId: number | null = null;
        let idleHandle: number | null = null;

        const finishLoadingIfReady = () => {
            if (isMounted && machinesReady && weekBookingsReady) {
                setLoadIssue(null);
                setLoadErrorMessage(null);
                setLoading(false);
            }
        };

        const handleResidentDataError = (label: string, error: unknown) => {
            console.error(label, error);
            if (!isMounted) return;
            setLoadErrorMessage('We could not refresh the latest dashboard data. Retry to reconnect.');
            setLoadIssue(coreResidentSnapshotRef.current ? 'saved' : 'error');
            setLoading(false);
        };

        finishLoadingIfReady();

        void residentSnapshotService.getDashboardSnapshot(dashboardWeekIds)
            .then((snapshot) => {
                if (!isMounted) return;

                machinesReady = true;
                weekBookingsReady = true;

                startTransition(() => {
                    setMachines(snapshot.machines);
                    setWeekBookings(snapshot.weekBookings);
                    setSettings(snapshot.settings);
                    setBanners(snapshot.banners ?? []);
                });

                warmBannerImages(snapshot.banners ?? [], 2);
                finishLoadingIfReady();
            })
            .catch((error) => {
                handleResidentDataError('Dashboard snapshot fetch error:', error);
            })
            .finally(() => {
                if (isMounted) {
                    setBannersLoading(false);
                }
            });

        const attachLiveStreams = () => {
            void loadResidentLiveService()
                .then(({ residentLiveService }) => {
                    if (!isMounted) return;

                    unsubscribeMachines = residentLiveService.subscribeToMachines((nextMachines) => {
                        if (!isMounted) return;
                        machinesReady = true;
                        startTransition(() => {
                            setMachines(nextMachines);
                        });
                        finishLoadingIfReady();
                    }, (error) => {
                        handleResidentDataError('Dashboard machines subscription error:', error);
                    });

                    unsubscribeWeekBookings = residentLiveService.subscribeToBookingsForWeekIds(dashboardWeekIds, (nextBookings) => {
                        if (!isMounted) return;
                        weekBookingsReady = true;
                        startTransition(() => {
                            setWeekBookings(nextBookings);
                        });
                        finishLoadingIfReady();
                    }, (error) => {
                        handleResidentDataError('Dashboard week bookings subscription error:', error);
                    });
                })
                .catch((error) => {
                    console.error('Failed to attach resident live dashboard streams', error);
                });
        };

        const scheduleLiveStreams = () => {
            if (typeof window === 'undefined') {
                attachLiveStreams();
                return;
            }

            const idleWindow = window as Window & typeof globalThis & {
                requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                cancelIdleCallback?: (handle: number) => void;
            };

            if (typeof idleWindow.requestIdleCallback === 'function') {
                idleHandle = idleWindow.requestIdleCallback(() => {
                    idleHandle = null;
                    attachLiveStreams();
                }, { timeout: 1200 });
                return;
            }

            liveAttachTimeoutId = window.setTimeout(attachLiveStreams, 280);
        };

        scheduleLiveStreams();

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
            unsubscribeMachines();
            unsubscribeWeekBookings();
        };
    }, [dashboardWeekIds, navigate, reloadKey, userId]);

    useEffect(() => {
        if (!userId || !isBookingSummaryActive) {
            return;
        }

        let isMounted = true;
        let unsubscribeRecentBookings = () => { /* noop */ };
        let liveAttachTimeoutId: number | null = null;
        let idleHandle: number | null = null;

        if (hasCachedRecentBookings) {
            setRecentBookingsHydrated(true);
            setRecentBookingsLoading(false);
        } else {
            setRecentBookingsLoading(true);

            void residentFirestoreService.getRecentBookingsForStudent(userId, RECENT_BOOKINGS_LIMIT)
                .then((nextBookings) => {
                    if (!isMounted) return;
                    setRecentBookingsHydrated(true);
                    setRecentBookingsLoading(false);
                    startTransition(() => {
                        setRecentBookings(nextBookings);
                    });
                })
                .catch((error) => {
                    console.error('Dashboard student bookings fetch error:', error);
                    if (!isMounted) return;
                    setRecentBookingsHydrated(true);
                    setRecentBookingsLoading(false);
                });
        }

        const attachRecentBookingsStream = () => {
            void loadResidentLiveService()
                .then(({ residentLiveService }) => {
                    if (!isMounted) return;

                    unsubscribeRecentBookings = residentLiveService.subscribeToRecentBookingsForStudent(userId, RECENT_BOOKINGS_LIMIT, (nextBookings) => {
                        if (!isMounted) return;
                        setRecentBookingsHydrated(true);
                        setRecentBookingsLoading(false);
                        startTransition(() => {
                            setRecentBookings(nextBookings);
                        });
                    }, (error) => {
                        console.error('Dashboard student bookings subscription error:', error);
                        if (!isMounted) return;
                        setRecentBookingsHydrated(true);
                        setRecentBookingsLoading(false);
                    });
                })
                .catch((error) => {
                    console.error('Failed to attach resident recent bookings stream', error);
                });
        };

        if (typeof window === 'undefined') {
            attachRecentBookingsStream();
        } else {
            const idleWindow = window as Window & typeof globalThis & {
                requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                cancelIdleCallback?: (handle: number) => void;
            };

            if (typeof idleWindow.requestIdleCallback === 'function') {
                idleHandle = idleWindow.requestIdleCallback(() => {
                    idleHandle = null;
                    attachRecentBookingsStream();
                }, { timeout: 1200 });
            } else {
                liveAttachTimeoutId = window.setTimeout(attachRecentBookingsStream, 280);
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
            unsubscribeRecentBookings();
        };
    }, [hasCachedRecentBookings, isBookingSummaryActive, reloadKey, userId]);

    const isNextWeekOpen = settings.forceShowNextWeek || isAutoBookingWindowOpen(new Date(), settings);

    const isSystemClosed = settings.forceCloseBookings || !isNextWeekOpen;

    const getMachineRealTimeStatus = (machine: Machine) => {
        const now = getBelarusNow();
        const currentBWeekday = getBelarusWeekday(getBelarusDate());
        // Use setting or default to 3 (Wednesday)
        const maintenanceDay = settings.maintenanceDay ?? 3;
        const isMaintenanceDay = currentBWeekday === maintenanceDay;

        if (isMaintenanceDay) return { state: 'maintenance', label: 'Maintenance Day', color: '#ef4444' };
        if (machine.status === 'maintenance') return { state: 'maintenance', label: 'Under Maintenance', color: '#ef4444' };

        const today = formatBelarusDate(getBelarusDate());
        const bookingsToday = weekBookings.filter(b => b.date === today);
        const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

        const currentBooking = bookingsToday.find(b => {
            if (b.machineId !== machine.id) return false;
            const startMinutes = getTimeStringMinutes(b.startTime);
            const endMinutes = startMinutes + 90;
            return nowMinutes > startMinutes && nowMinutes < endMinutes;
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
        const bookedInTargetWeek = weekBookings.filter(
            b => b.weekId === targetWeekId && bookableDates.includes(b.date)
        ).length;
        const remainingSlots = Math.max(totalSlots - bookedInTargetWeek, 0);

        return { totalSlots, remainingSlots, bookableDays: bookableDates.length, slotsPerDay };
    }, [machines, settings.maintenanceDay, isNextWeekOpen, weekBookings]);

    const handleLogout = () => {
        bookingService.logout();
        navigate('/login');
    };

    const handleOpenBooking = () => {
        preloadBookingRoute();
        startResidentPerfSpan('resident:dashboard-to-booking-shell');
        startResidentPerfSpan('resident:booking-data-ready');
        startResidentPerfSpan('resident:booking-live-ready');
        navigate('/book');
    };

    const ensureRoommatesLoaded = (forceRefresh = false) => {
        if (!user?.roomNumber || roommatesLoading) {
            return;
        }

        const alreadyLoadedRoommates = roommates.filter((student) => student.roomNumber === user.roomNumber);
        if (!forceRefresh && alreadyLoadedRoommates.length > 1) {
            return;
        }

        setRoommatesLoading(true);

        void residentFirestoreService.getStudentsByRoom(user.roomNumber)
            .then((fetchedRoommates) => {
                const sameRoomResidents = fetchedRoommates.filter((student) => student.roomNumber === user.roomNumber);
                const nextRoommates = sameRoomResidents.length > 0 ? sameRoomResidents : [user];
                setRoommates(nextRoommates);
                bookingService.setCurrentRoommates(nextRoommates);
            })
            .catch((error) => {
                console.error('Failed to load roommates for current room', error);
            })
            .finally(() => {
                setRoommatesLoading(false);
            });
    };

    const clearRoommateHold = () => {
        if (roommateHoldTimerRef.current) {
            window.clearTimeout(roommateHoldTimerRef.current);
            roommateHoldTimerRef.current = null;
        }
    };

    const startRoommateHold = () => {
        if (!canOpenRoommateMenu) return;

        ensureRoommatesLoaded(true);
        clearRoommateHold();
        roommateHoldTimerRef.current = window.setTimeout(() => {
            suppressRoommateClickRef.current = true;
            setIsRoommateMenuOpen(true);
            hapticSoftPulse();
        }, 420);
    };

    const handleRoommateButtonClick = () => {
        if (!canOpenRoommateMenu) return;

        if (suppressRoommateClickRef.current) {
            suppressRoommateClickRef.current = false;
            return;
        }

        if (!isRoommateMenuOpen) {
            ensureRoommatesLoaded(true);
        }

        setIsRoommateMenuOpen((current) => !current);
        hapticSelection();
    };

    const handleRoommateSwitch = (nextResident: Student) => {
        if (!user || nextResident.id === user.id) {
            setIsRoommateMenuOpen(false);
            return;
        }

        const cachedBookings = residentSnapshotService.getCachedWarmSnapshot(dashboardWeekIds, nextResident.id, true)?.recentBookings
            ?? residentFirestoreService.getCachedRecentBookingsForStudent(nextResident.id, RECENT_BOOKINGS_LIMIT);

        bookingService.setCurrentUser(nextResident);
        startTransition(() => {
            setUser(nextResident);
            setRecentBookings(cachedBookings ?? []);
        });
        setLoading(false);
        setRecentBookingsHydrated(cachedBookings !== undefined);
        setRecentBookingsLoading(isBookingSummaryActive && cachedBookings === undefined);
        setLoadIssue(null);
        setLoadErrorMessage(null);
        setIsRoommateMenuOpen(false);
        preloadBookingRoute();
        void warmResidentAppData(nextResident.id, {
            includeRecentBookings: true,
            roomNumber: nextResident.roomNumber,
        });
        hapticSelection();
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };

    const retryDashboardData = () => {
        if (hasResidentSnapshot) {
            setLoadIssue('saved');
            setLoadErrorMessage('Reconnecting to live dashboard updates...');
        } else {
            setLoadIssue(null);
            setLoadErrorMessage(null);
            setLoading(true);
        }
        setRecentBookingsHydrated(hasCachedRecentBookings);
        setRecentBookingsLoading(isBookingSummaryActive && !hasCachedRecentBookings);
        if (!hasResidentSnapshot) {
            setBannersLoading(banners.length === 0);
        }
        setReloadKey((current) => current + 1);
    };

    const today = getBelarusDate();
    const nextWeekStart = addBelarusDays(getBelarusWeekStart(today), 7);
    const nextWeekId = getBelarusWeekId(nextWeekStart);

    // Check if the user has a booking specifically for the *upcoming* week (next week slots)
    const hasBookedForNextWeek = weekBookings.some((booking) => booking.studentId === userId && booking.weekId === nextWeekId);

    let mainActionLabel = 'Book Now';
    let mainActionSubtitle = 'Book your slot for next week';

    if (isSystemClosed) {
        mainActionLabel = 'Check Status';
        mainActionSubtitle = 'Bookings are currently closed';
    } else if (hasBookedForNextWeek) {
        mainActionLabel = 'Booked';
        mainActionSubtitle = 'You already booked. You can still open slots page to browse remaining slots';
    }

    const showBlockingDashboardNotice = (loading && residentLoadSlow && !hasCoreResidentSnapshot)
        || (!loading && loadIssue === 'error' && !hasCoreResidentSnapshot);
    const isDashboardShellBooting = loading && !hasCoreResidentSnapshot;
    const showStatusSkeleton = isDashboardShellBooting
        || (loading && (!hasCachedMachines || !hasCachedWeekBookings) && (machines.length === 0 || weekBookings.length === 0));

    if (isDashboardShellBooting) {
        mainActionLabel = 'Open Slots';
        mainActionSubtitle = 'We’re loading your latest booking status in the background.';
    }

    if (showBlockingDashboardNotice) {
        return (
            <div className="container animate-fade-in flex-center" style={{ minHeight: '100vh', padding: '24px' }}>
                <DataLoadNotice
                    tone="error"
                    title={residentLoadSlow ? 'Dashboard is taking longer than usual' : 'Unable to load dashboard'}
                    description={loadErrorMessage ?? 'Your connection may be slow right now. Retry to reconnect and load the resident dashboard.'}
                    onRetry={retryDashboardData}
                    retryLabel="Retry Dashboard"
                />
            </div>
        );
    }

    if (!user) return null;

    const feedbackFallback = (
        <div className="glass-panel" style={{ marginTop: '40px', padding: '18px', borderRadius: '18px', opacity: 0.78 }}>
            <div style={{ height: '18px', width: '120px', borderRadius: '999px', background: 'var(--glass-border)', marginBottom: '14px' }} className="skeleton-pulse"></div>
            <div style={{ height: '48px', width: '100%', borderRadius: '14px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
        </div>
    );
    const bookingsFallback = (
        <div className="animate-fade-in" style={{ marginTop: '32px' }}>
            <div style={{ height: '18px', width: '180px', borderRadius: '999px', background: 'var(--glass-border)', marginBottom: '16px' }} className="skeleton-pulse"></div>
            <div style={{ height: '156px', width: '100%', borderRadius: '20px', background: 'var(--glass-border)', marginBottom: '24px' }} className="skeleton-pulse"></div>
        </div>
    );
    const shouldShowRecentBookingsLoading = isBookingSummaryActive && (!recentBookingsHydrated || recentBookingsLoading);
    const statusOverviewSkeleton = (
        <div
            className="glass-panel"
            style={{
                marginBottom: '20px',
                padding: '20px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.2)'
            }}
        >
            <div style={{ height: '20px', width: '132px', borderRadius: '999px', background: 'var(--glass-border)', marginBottom: '14px' }} className="skeleton-pulse"></div>
            <div style={{ height: '44px', width: '100%', borderRadius: '16px', background: 'var(--glass-border)' }} className="skeleton-pulse"></div>
        </div>
    );
    const machineStatusSkeleton = (
        <div className="grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
                <div
                    key={item}
                    className="glass-panel"
                    style={{ height: '116px', borderRadius: '16px', background: 'var(--glass-border)' }}
                >
                    <div className="skeleton-pulse" style={{ width: '100%', height: '100%', borderRadius: '16px' }}></div>
                </div>
            ))}
        </div>
    );
    const handlePrimaryBannerReady = () => {
        if (bannerReadyMetricRef.current) return;
        bannerReadyMetricRef.current = true;
        finishResidentPerfSpan('resident:dashboard-banner-ready', {
            banners: banners.length,
        });
    };

    const handleResidentBookingCreated = (createdBooking: Booking) => {
        startTransition(() => {
            setWeekBookings((currentBookings) => upsertBooking(currentBookings, createdBooking));
            setRecentBookings((currentBookings) => upsertBooking(currentBookings, createdBooking));
        });
    };
    const topAlertType = settings.topAlert?.type ?? 'info';
    const topAlertBackground = topAlertType === 'urgent'
        ? 'rgba(239, 68, 68, 0.2)'
        : topAlertType === 'warning'
            ? 'rgba(245, 158, 11, 0.2)'
            : 'rgba(59, 130, 246, 0.2)';
    const topAlertIconColor = topAlertType === 'urgent'
        ? 'var(--error)'
        : topAlertType === 'warning'
            ? '#d97706'
            : 'var(--primary)';

    return (
        <div className="container">
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
                        background: topAlertBackground,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: 'var(--text-main)',
                        boxShadow: '0 4px 22px rgba(15, 23, 42, 0.14)',
                        borderBottom: '1px solid var(--glass-border)'
                    }}
                >
                    <div style={{
                        background: 'rgba(148, 163, 184, 0.14)',
                        padding: '4px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        color: topAlertIconColor
                    }}>
                        {topAlertType === 'urgent' && <AlertTriangle size={16} />}
                        {topAlertType === 'info' && <Info size={16} />}
                        {topAlertType === 'warning' && <AlertTriangle size={16} />}
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
                transition: 'margin-top 0.3s ease',
                gap: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    <div ref={roommateMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                            type="button"
                            onClick={handleRoommateButtonClick}
                            onTouchStart={startRoommateHold}
                            onTouchEnd={clearRoommateHold}
                            onTouchCancel={clearRoommateHold}
                            onMouseDown={startRoommateHold}
                            onMouseUp={clearRoommateHold}
                            onMouseLeave={clearRoommateHold}
                            className="glass-button"
                            style={{
                                width: '52px',
                                height: '52px',
                                borderRadius: '50%',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(14, 165, 233, 0.12) 100%)',
                                border: '1px solid rgba(99, 102, 241, 0.22)',
                                boxShadow: '0 10px 24px rgba(37, 99, 235, 0.14)',
                                cursor: canOpenRoommateMenu ? 'pointer' : 'default'
                            }}
                            aria-label={canOpenRoommateMenu ? 'Switch roommate profile' : 'Current resident profile'}
                        >
                            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '0.04em' }}>
                                {getResidentInitials(user.name)}
                            </span>
                            {canOpenRoommateMenu && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        right: '-2px',
                                        bottom: '-2px',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '999px',
                                        background: 'var(--glass-bg)',
                                        border: '1px solid var(--glass-border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--primary)'
                                    }}
                                >
                                    <ChevronDown size={12} />
                                </span>
                            )}
                        </button>

                        {isRoommateMenuOpen && (
                            <div
                                className="glass-panel animate-fade-in"
                                style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 12px)',
                                    left: 0,
                                    width: 'min(320px, calc(100vw - 40px))',
                                    borderRadius: '20px',
                                    padding: '14px',
                                    zIndex: 120,
                                    background: 'var(--glass-bg)',
                                    border: '1px solid var(--glass-border)',
                                    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)'
                                }}
                            >
                                    <div style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>Book For Roommate</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                            Only residents from Room {user.roomNumber} can be selected here.
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        {roommates.map((resident) => {
                                            const isActiveResident = resident.id === user.id;
                                            return (
                                                <button
                                                    key={resident.id}
                                                    type="button"
                                                    onClick={() => handleRoommateSwitch(resident)}
                                                    className="glass-button"
                                                    style={{
                                                        width: '100%',
                                                        padding: '12px 14px',
                                                        borderRadius: '16px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '10px',
                                                        background: isActiveResident
                                                            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(14, 165, 233, 0.12) 100%)'
                                                            : 'rgba(148, 163, 184, 0.08)',
                                                        border: isActiveResident
                                                            ? '1px solid rgba(99, 102, 241, 0.22)'
                                                            : '1px solid rgba(148, 163, 184, 0.2)',
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                        <div
                                                            style={{
                                                                width: '36px',
                                                                height: '36px',
                                                                borderRadius: '50%',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                background: isActiveResident ? 'rgba(99, 102, 241, 0.2)' : 'rgba(148, 163, 184, 0.16)',
                                                                color: 'var(--text-main)',
                                                                fontWeight: 700,
                                                                border: '1px solid rgba(148, 163, 184, 0.24)',
                                                                flexShrink: 0
                                                            }}
                                                        >
                                                            {getResidentInitials(resident.name)}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {getResidentShortName(resident.name)}
                                                            </div>
                                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                                Room {resident.roomNumber}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {isActiveResident && (
                                                        <span
                                                            style={{
                                                                width: '24px',
                                                                height: '24px',
                                                                borderRadius: '999px',
                                                                background: 'rgba(16, 185, 129, 0.16)',
                                                                color: 'var(--success)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                flexShrink: 0
                                                            }}
                                                        >
                                                            <Check size={14} />
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}

                                        {roommatesLoading && (
                                            <div style={{ padding: '10px 4px 2px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                Refreshing roommate list...
                                            </div>
                                        )}

                                        {!roommatesLoading && roommates.length <= 1 && (
                                            <div style={{ padding: '10px 4px 2px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                No other roommates are available for switching right now.
                                            </div>
                                        )}
                                    </div>
                            </div>
                        )}
                    </div>

                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ margin: 0, fontSize: '24px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Hello, {user.name.split(' ')[0]} 👋
                        </h2>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                            Room {user.roomNumber}{canOpenRoommateMenu ? ' • Tap avatar to switch resident' : ''}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="glass-button"
                    style={{ padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <LogOut size={20} />
                </button>
            </header>

            {loadIssue === 'saved' && (
                <div style={{ marginBottom: '20px' }}>
                    <DataLoadNotice
                        compact
                        title="Showing saved dashboard data"
                        description={loadErrorMessage ?? 'Live updates are reconnecting in the background. You can keep using the page.'}
                        onRetry={retryDashboardData}
                        retryLabel="Refresh Data"
                    />
                </div>
            )}

            {/* Announcements Carousel */}
            <div className="animate-fade-in">
                <BannerCarousel
                    banners={banners}
                    isLoading={bannersLoading}
                    onPrimaryBannerReady={handlePrimaryBannerReady}
                />
            </div>

            {/* Main Action */}
            <div
                className="glass-panel main-action-layout animate-fade-in"
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
                    onClick={handleOpenBooking}
                    onMouseEnter={preloadBookingRoute}
                    onTouchStart={preloadBookingRoute}
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
            <section className="animate-fade-in">
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
                            {formatBelarusClockLabel(new Date())}
                        </span>
                    </h3>
                </div>

                {showStatusSkeleton ? (
                    <>
                        {statusOverviewSkeleton}
                        {machineStatusSkeleton}
                    </>
                ) : (
                    <>
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
                            {machines.map((machine, index) => {
                                const status = getMachineRealTimeStatus(machine);
                                return (
                                    <div
                                        key={machine.id}
                                        className="glass-panel animate-fade-in"
                                        style={{
                                            padding: '16px',
                                            borderRadius: '16px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '12px',
                                            animationDelay: `${Math.min(index * 0.06, 0.18)}s`
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
                    </>
                )}
            </section>

            <div
                ref={bookingSummarySectionRef}
                className={`scroll-reveal${isBookingSummaryActive ? ' scroll-reveal--visible' : ''}`}
                style={{ minHeight: '220px' }}
            >
                {isBookingSummaryActive ? (
                    <Suspense fallback={bookingsFallback}>
                        <LazyDashboardBookingSummary
                            key={userId}
                            user={user}
                            machines={machines}
                            recentBookings={recentBookings}
                            recentBookingsLoading={shouldShowRecentBookingsLoading}
                            weekBookings={weekBookings}
                            settings={settings}
                            isNextWeekOpen={isNextWeekOpen}
                            onBookingCreated={handleResidentBookingCreated}
                        />
                    </Suspense>
                ) : bookingsFallback}
            </div>

            {/* Inline Feedback Section */}
            <div
                ref={feedbackSectionRef}
                className={`scroll-reveal${isFeedbackActive ? ' scroll-reveal--visible' : ''}`}
                style={{ minHeight: '132px' }}
            >
                {isFeedbackActive ? (
                    <Suspense fallback={feedbackFallback}>
                        <LazyDashboardFeedback />
                    </Suspense>
                ) : feedbackFallback}
            </div>
        </div>
    );
}
