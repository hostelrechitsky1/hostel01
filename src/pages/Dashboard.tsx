import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { DEFAULT_APP_SETTINGS, residentFirestoreService } from '../services/residentFirestoreService';
import { residentSnapshotService } from '../services/residentSnapshotService';
import type { Machine, Booking, Banner, AppSettings, Student } from '../types';
import { TIME_SLOTS } from '../types';
import { LogOut, AlertCircle, AlertTriangle, Info, Activity, ChevronDown, Check, Clock, Languages, CalendarSearch, UserPlus, X, WashingMachine as Washer } from 'lucide-react';
import BannerCarousel from '../components/BannerCarousel';
import { DataLoadNotice } from '../components/DataLoadNotice';
import { warmBannerImages } from '../utils/bannerImages';
import { addBelarusDays, formatBelarusClockLabel, formatBelarusDate, getActiveBookingWeekStart, getBelarusDate, getBelarusWeekStart, getBelarusWeekday, getBelarusWeekId, isAutoBookingWindowOpen } from '../utils/time';
import { preloadBookingRoute, preloadWeeklySlotsRoute } from '../utils/preloadRoutes';
import { useSlowLoadFlag } from '../utils/useSlowLoadFlag';
import { useViewportActivation } from '../utils/useViewportActivation';
import { warmResidentAppData } from '../utils/warmResidentApp';
import { hapticSelection, hapticSoftPulse } from '../utils/haptics';
import { finishResidentPerfSpan, startResidentPerfSpan } from '../utils/performance';
import { getResidentFirstNameForLanguage, getResidentInitialsForLanguage, getResidentShortNameForLanguage } from '../utils/residentNames';
import { getResidentPortalDateLocale, getResidentPortalLanguage, setResidentPortalLanguage, type ResidentPortalLanguage } from '../utils/residentPortalLanguage';
import { getMachineOperatingState } from '../utils/machineStatus';

const RECENT_BOOKINGS_LIMIT = 12;
const RESIDENT_FORCE_TOP_AFTER_LOGIN_KEY = 'resident_force_top_after_login';
const WEEKLY_SLOTS_TOUR_STORAGE_KEY_PREFIX = 'hostel_weekly_slots_tour_seen_v1:';
const DASHBOARD_FALLBACK_MACHINES: Machine[] = [
    { id: '1', name: 'Machine 1', status: 'available' },
    { id: '2', name: 'Machine 2', status: 'available' },
    { id: '3', name: 'Machine 3', status: 'available' },
    { id: '4', name: 'Machine 4', status: 'available' },
];

type ResidentTourHandle = {
    cancel: () => void;
    destroy?: () => void;
};

let dashboardFeedbackModulePromise: Promise<typeof import('../components/DashboardFeedback')> | null = null;
let dashboardBookingSummaryModulePromise: Promise<typeof import('../components/DashboardBookingSummary')> | null = null;
let residentLiveServicePromise: Promise<typeof import('../services/residentLiveService')> | null = null;

const loadDashboardFeedback = () => {
    dashboardFeedbackModulePromise ??= import('../components/DashboardFeedback');
    return dashboardFeedbackModulePromise;
};

const loadDashboardBookingSummary = () => {
    dashboardBookingSummaryModulePromise ??= import('../components/DashboardBookingSummary');
    return dashboardBookingSummaryModulePromise;
};

const LazyDashboardFeedback = lazy(loadDashboardFeedback);
const LazyDashboardBookingSummary = lazy(loadDashboardBookingSummary);

const loadResidentLiveService = () => {
    residentLiveServicePromise ??= import('../services/residentLiveService');
    return residentLiveServicePromise;
};

const upsertBooking = (bookings: Booking[], nextBooking: Booking) => {
    const withoutExisting = bookings.filter((booking) => booking.id !== nextBooking.id);
    return [...withoutExisting, nextBooking];
};

const dedupeRoommates = (students: Student[]) => {
    const seenIds = new Set<string>();

    return students.filter((student) => {
        const identity = student.id || `${student.roomNumber}:${student.name.trim().toLowerCase()}`;
        if (seenIds.has(identity)) {
            return false;
        }

        seenIds.add(identity);
        return true;
    });
};

const buildSavedAccountList = (currentUser: Student | null, students: Student[]) => {
    if (!currentUser) return dedupeRoommates(students);

    return dedupeRoommates([currentUser, ...students]);
};

const getInitialSavedAccounts = (currentUser: Student | null) => (
    buildSavedAccountList(currentUser, bookingService.getSavedAccounts())
);

export default function Dashboard() {
    const navigate = useNavigate();
    const [language, setLanguage] = useState<ResidentPortalLanguage>(() => getResidentPortalLanguage());
    const [user, setUser] = useState<Student | null>(() => bookingService.getCurrentUser());
    const isRussian = language === 'ru';
    const dateLocale = getResidentPortalDateLocale(language);
    const t = isRussian
        ? {
            switchLanguage: 'English',
            hello: 'Здравствуйте',
            roomLabel: (roomNumber: string) => `Комната ${roomNumber}`,
            tapAvatarToSwitch: 'Нажмите на аватар, чтобы управлять аккаунтами',
            switchRoommateProfile: 'Сменить сохранённый аккаунт',
            currentResidentProfile: 'Текущий профиль жильца',
            bookForRoommate: 'Сохранённые аккаунты',
            addAccount: 'Добавить аккаунт',
            addAccountDescription: 'Введите комнату и PIN, затем выберите имя.',
            accountRoomLabel: 'Комната',
            accountPinLabel: 'PIN',
            accountRoomPlaceholder: 'например, 52-2',
            accountPinPlaceholder: '000',
            verifyAccount: 'Проверить',
            cancelAddAccount: 'Отмена',
            chooseAccount: 'Выберите аккаунт',
            accountAlreadySaved: 'Этот аккаунт уже сохранён. Вы можете переключиться на него.',
            accountNotFound: 'Комната не найдена.',
            accountWrongPin: 'Неверный PIN.',
            accountLookupFailed: 'Не удалось проверить аккаунт. Попробуйте снова.',
            savedAccountsHint: 'Здесь отображаются только аккаунты, добавленные с PIN.',
            accountsAvailable: (count: number) => count === 1 ? 'Доступен 1 аккаунт' : `Доступно ${count} аккаунта`,
            refreshingRoommates: 'Проверяем аккаунт...',
            noOtherRoommates: 'Добавьте аккаунт с PIN, чтобы быстро переключаться.',
            showingSavedTitle: 'Показаны сохранённые данные панели',
            showingSavedDescription: 'Живые обновления переподключаются в фоновом режиме. Вы можете продолжать пользоваться страницей.',
            refreshData: 'Обновить данные',
            dashboardSlowTitle: 'Панель загружается дольше обычного',
            dashboardFailedTitle: 'Не удалось загрузить панель',
            dashboardRetryDescription: 'Соединение может быть медленным. Попробуйте снова, чтобы обновить панель жильца.',
            retryDashboard: 'Повторить',
            needToWash: 'Нужно постирать?',
            bookNow: 'Забронировать',
            bookSubtitle: 'Бронирование онлайн всю неделю',
            checkStatus: 'Проверить статус',
            bookingsClosed: 'Бронирование сейчас закрыто',
            booked: 'Забронировано',
            bookedSubtitle: 'У вас уже есть бронь. Вы всё ещё можете открыть страницу слотов и посмотреть свободные места.',
            openSlots: 'Открыть слоты',
            weeklySlots: 'Слоты недели',
            weeklySlotsAria: 'Открыть свободные и занятые слоты недели',
            weeklySlotsTourTitle: 'Новая страница слотов',
            weeklySlotsTourText: 'Теперь здесь можно проверять свободные места и занятые слоты с именем и комнатой всю неделю.',
            weeklySlotsTourButton: 'Понятно',
            loadingLatest: 'Мы загружаем ваш актуальный статус бронирования в фоне.',
            status: 'Статус',
            systemStatus: 'Статус системы',
            active: 'Активно',
            closed: 'Закрыто',
            weekSlots: 'Слоты недели',
            readyToUse: 'Готово к использованию',
            inUse: 'Занято',
            maintenanceDay: 'День обслуживания',
            underMaintenance: 'На обслуживании',
            closedForToday: 'Закрыто на сегодня',
            ready: 'Готово',
            finishesSoon: 'Скоро освободится',
            closedShort: 'Закрыто',
        }
        : {
            switchLanguage: 'Русский',
            hello: 'Hello',
            roomLabel: (roomNumber: string) => `Room ${roomNumber}`,
            tapAvatarToSwitch: 'Tap avatar to manage saved accounts',
            switchRoommateProfile: 'Switch saved account',
            currentResidentProfile: 'Current resident profile',
            bookForRoommate: 'Saved Accounts',
            addAccount: 'Add Account',
            addAccountDescription: 'Enter room and PIN, then choose the student name.',
            accountRoomLabel: 'Room',
            accountPinLabel: 'PIN',
            accountRoomPlaceholder: 'e.g. 52-2',
            accountPinPlaceholder: '000',
            verifyAccount: 'Verify',
            cancelAddAccount: 'Cancel',
            chooseAccount: 'Choose Account',
            accountAlreadySaved: 'This account is already saved. You can switch to it.',
            accountNotFound: 'Room not found.',
            accountWrongPin: 'Incorrect PIN.',
            accountLookupFailed: 'Could not verify account. Please try again.',
            savedAccountsHint: 'Only accounts added with a PIN are shown here.',
            accountsAvailable: (count: number) => `${count} account${count === 1 ? '' : 's'} available`,
            refreshingRoommates: 'Verifying account...',
            noOtherRoommates: 'Add an account with PIN to switch quickly.',
            showingSavedTitle: 'Showing saved dashboard data',
            showingSavedDescription: 'Live updates are reconnecting in the background. You can keep using the page.',
            refreshData: 'Refresh Data',
            dashboardSlowTitle: 'Dashboard is taking longer than usual',
            dashboardFailedTitle: 'Unable to load dashboard',
            dashboardRetryDescription: 'Your connection may be slow right now. Retry to reconnect and load the resident dashboard.',
            retryDashboard: 'Retry Dashboard',
            needToWash: 'Need to wash?',
            bookNow: 'Book Now',
            bookSubtitle: 'Book online during the whole week',
            checkStatus: 'Check Status',
            bookingsClosed: 'Bookings are currently closed',
            booked: 'Booked',
            bookedSubtitle: 'You already booked. You can still open slots page to browse remaining slots.',
            openSlots: 'Open Slots',
            weeklySlots: 'Weekly Slots',
            weeklySlotsAria: 'Open weekly free and booked slots',
            weeklySlotsTourTitle: 'New weekly slots page',
            weeklySlotsTourText: 'You can now check free slots and booked slots with name and room here during the week.',
            weeklySlotsTourButton: 'Got it',
            loadingLatest: 'We’re loading your latest booking status in the background.',
            status: 'Status',
            systemStatus: 'System Status',
            active: 'Active',
            closed: 'Closed',
            weekSlots: 'Week Slots',
            readyToUse: 'Ready to use',
            inUse: 'In Use',
            maintenanceDay: 'Maintenance Day',
            underMaintenance: 'Under Maintenance',
            closedForToday: 'Closed for today',
            ready: 'Ready',
            finishesSoon: 'Finishes soon',
            closedShort: 'Closed',
        };
    const userId = user?.id ?? '';
    const {
        ref: bookingSummarySectionRef,
        isActive: isBookingSummaryActive,
    } = useViewportActivation<HTMLDivElement>({
        rootMargin: '0px 0px -6% 0px',
        idleTimeout: null,
        threshold: 0.01,
    });
    const {
        ref: feedbackSectionRef,
        isActive: isFeedbackActive,
    } = useViewportActivation<HTMLDivElement>({
        rootMargin: '0px 0px -6% 0px',
        idleTimeout: null,
        threshold: 0.01,
    });
    const [savedAccounts, setSavedAccounts] = useState<Student[]>(() => getInitialSavedAccounts(bookingService.getCurrentUser()));
    const [accountLookupLoading, setAccountLookupLoading] = useState(false);
    const [accountLookupRoom, setAccountLookupRoom] = useState('');
    const [accountLookupPin, setAccountLookupPin] = useState('');
    const [accountLookupError, setAccountLookupError] = useState<string | null>(null);
    const [accountLookupCandidates, setAccountLookupCandidates] = useState<Student[]>([]);
    const [isAddAccountMode, setIsAddAccountMode] = useState(false);
    const [isRoommateMenuOpen, setIsRoommateMenuOpen] = useState(false);
    const roommateMenuRef = useRef<HTMLDivElement>(null);
    const weeklySlotsButtonRef = useRef<HTMLButtonElement>(null);
    const weeklySlotsTourRef = useRef<ResidentTourHandle | null>(null);
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
    const [machines, setMachines] = useState<Machine[]>(() => cachedMachines ?? DASHBOARD_FALLBACK_MACHINES);
    const [weekBookings, setWeekBookings] = useState<Booking[]>(() => cachedWeekBookings ?? []);
    const [recentBookings, setRecentBookings] = useState<Booking[]>(() => cachedRecentBookings ?? []);
    const [banners, setBanners] = useState<Banner[]>(() => cachedBanners ?? []);
    const [bannersLoading, setBannersLoading] = useState(() => cachedBanners === undefined);
    const [loading, setLoading] = useState(() => Boolean(userId) && !hasCachedMachines && !hasCachedWeekBookings);
    const [recentBookingsLoading, setRecentBookingsLoading] = useState(() => Boolean(userId) && !hasCachedRecentBookings);
    const [recentBookingsHydrated, setRecentBookingsHydrated] = useState(() => hasCachedRecentBookings);
    const [settings, setSettings] = useState<AppSettings>(() => cachedSettings ?? DEFAULT_APP_SETTINGS);
    const [reloadKey, setReloadKey] = useState(0);
    const [loadIssue, setLoadIssue] = useState<'saved' | 'error' | null>(null);
    const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
    const canOpenRoommateMenu = Boolean(user);
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
        if (typeof window === 'undefined') return;
        if (window.sessionStorage.getItem(RESIDENT_FORCE_TOP_AFTER_LOGIN_KEY) !== '1') return;

        let cancelled = false;
        const forceScrollToTop = () => {
            if (cancelled) return;
            const scrollingElement = document.scrollingElement ?? document.documentElement;
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            scrollingElement.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        };
        const markUserScroll = () => {
            cancelled = true;
            window.sessionStorage.removeItem(RESIDENT_FORCE_TOP_AFTER_LOGIN_KEY);
        };

        forceScrollToTop();

        const rafIds = [
            requestAnimationFrame(forceScrollToTop),
            requestAnimationFrame(() => requestAnimationFrame(forceScrollToTop)),
        ];
        const timeoutIds = [120, 240].map((delay) => (
            window.setTimeout(forceScrollToTop, delay)
        ));
        const finish = window.setTimeout(() => {
            forceScrollToTop();
            window.sessionStorage.removeItem(RESIDENT_FORCE_TOP_AFTER_LOGIN_KEY);
        }, 320);

        window.addEventListener('scroll', markUserScroll, { passive: true });
        window.addEventListener('touchstart', markUserScroll, { passive: true });
        window.addEventListener('wheel', markUserScroll, { passive: true });

        return () => {
            rafIds.forEach((rafId) => cancelAnimationFrame(rafId));
            timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
            window.clearTimeout(finish);
            window.removeEventListener('scroll', markUserScroll);
            window.removeEventListener('touchstart', markUserScroll);
            window.removeEventListener('wheel', markUserScroll);
        };
    }, [user?.id]);

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

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!userId || loading || typeof window === 'undefined') {
            return;
        }

        let cancelled = false;
        let idleHandle: number | null = null;
        let timeoutId: number | null = null;

        const primeBelowFoldSections = () => {
            void Promise.allSettled([
                loadDashboardBookingSummary(),
                loadDashboardFeedback(),
            ]).then(() => {
                if (cancelled) return;
            });
        };

        const idleWindow = window as Window & typeof globalThis & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleHandle = idleWindow.requestIdleCallback(primeBelowFoldSections, { timeout: 900 });
        } else {
            timeoutId = window.setTimeout(primeBelowFoldSections, 180);
        }

        return () => {
            cancelled = true;
            if (idleHandle !== null) {
                idleWindow.cancelIdleCallback?.(idleHandle);
            }
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [loading, userId]);

    useEffect(() => {
        setSavedAccounts(getInitialSavedAccounts(user));
    }, [user]);

    useEffect(() => {
        if (!userId || loading || typeof window === 'undefined') {
            return;
        }

        const storageKey = `${WEEKLY_SLOTS_TOUR_STORAGE_KEY_PREFIX}${userId}`;
        if (window.localStorage.getItem(storageKey) === '1') {
            return;
        }

        let isDisposed = false;
        let autoDismissTimer: number | null = null;
        const cleanupTour = () => {
            const activeTour = weeklySlotsTourRef.current;
            weeklySlotsTourRef.current = null;
            weeklySlotsButtonRef.current?.classList.remove('resident-shepherd-target');

            if (!activeTour) return;

            try {
                activeTour.cancel();
            } catch {
                // Tour may already be closed.
            }

            if (activeTour.destroy) {
                try {
                    activeTour.destroy();
                } catch {
                    // Shepherd can throw if destroy races with cancel.
                }
            }
        };

        const tourTimeout = window.setTimeout(() => {
            const weeklySlotsButton = weeklySlotsButtonRef.current;
            if (!weeklySlotsButton) return;

            void import('shepherd.js').then(({ default: Shepherd }) => {
                if (isDisposed) return;
                if (window.localStorage.getItem(storageKey) === '1') return;

                const tour = new Shepherd.Tour({
                    defaultStepOptions: {
                        classes: 'resident-shepherd-step',
                        cancelIcon: { enabled: true },
                        modalOverlayOpeningPadding: 8,
                        modalOverlayOpeningRadius: 999,
                        scrollTo: false,
                    },
                    useModalOverlay: false,
                });
                weeklySlotsTourRef.current = tour;

                tour.addStep({
                    title: t.weeklySlotsTourTitle,
                    text: t.weeklySlotsTourText,
                    attachTo: {
                        element: weeklySlotsButton,
                        on: 'bottom',
                    },
                    buttons: [{
                        text: t.weeklySlotsTourButton,
                        action: () => tour.complete(),
                    }],
                });

                tour.on('show', () => {
                    weeklySlotsButton.classList.add('resident-shepherd-target');
                    window.localStorage.setItem(storageKey, '1');
                    autoDismissTimer = window.setTimeout(() => tour.complete(), 6500);
                });
                tour.on('complete', () => {
                    weeklySlotsButton.classList.remove('resident-shepherd-target');
                    window.localStorage.setItem(storageKey, '1');
                    weeklySlotsTourRef.current = null;
                    if (autoDismissTimer !== null) {
                        window.clearTimeout(autoDismissTimer);
                    }
                });
                tour.on('cancel', () => {
                    weeklySlotsButton.classList.remove('resident-shepherd-target');
                    window.localStorage.setItem(storageKey, '1');
                    weeklySlotsTourRef.current = null;
                    if (autoDismissTimer !== null) {
                        window.clearTimeout(autoDismissTimer);
                    }
                });
                tour.on('destroy', () => {
                    weeklySlotsButton.classList.remove('resident-shepherd-target');
                    weeklySlotsTourRef.current = null;
                    if (autoDismissTimer !== null) {
                        window.clearTimeout(autoDismissTimer);
                    }
                });
                tour.start();
            }).catch((error) => {
                console.error('Failed to load weekly slots tour', error);
            });
        }, 850);

        return () => {
            isDisposed = true;
            window.clearTimeout(tourTimeout);
            if (autoDismissTimer !== null) {
                window.clearTimeout(autoDismissTimer);
            }
            cleanupTour();
        };
    }, [loading, t.weeklySlotsTourButton, t.weeklySlotsTourText, t.weeklySlotsTourTitle, userId]);

    useEffect(() => {
        setRecentBookings(cachedRecentBookings ?? []);
        setRecentBookingsHydrated(hasCachedRecentBookings);
        setRecentBookingsLoading(Boolean(userId) && !hasCachedRecentBookings);
    }, [cachedRecentBookings, hasCachedRecentBookings, userId]);
    /* eslint-enable react-hooks/set-state-in-effect */

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

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!residentLoadSlow || !loading || !hasCoreResidentSnapshot) {
            return;
        }

        setLoadIssue('saved');
        setLoadErrorMessage(t.showingSavedDescription);
        setLoading(false);
    }, [hasCoreResidentSnapshot, loading, residentLoadSlow, t.showingSavedDescription]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!userId) {
            return;
        }

        if (typeof window === 'undefined') {
            preloadBookingRoute();
            preloadWeeklySlotsRoute();
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
                    preloadWeeklySlotsRoute();
                }, { timeout: 1400 });
        } else {
            timeoutHandle = window.setTimeout(() => {
                preloadBookingRoute();
                preloadWeeklySlotsRoute();
            }, 420);
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
            setLoadErrorMessage(t.dashboardRetryDescription);
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

                warmBannerImages(snapshot.banners ?? [], 1);
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
    }, [dashboardWeekIds, navigate, reloadKey, t.dashboardRetryDescription, userId]);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!userId) {
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
    }, [hasCachedRecentBookings, reloadKey, userId]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const isNextWeekOpen = settings.forceShowNextWeek || isAutoBookingWindowOpen(new Date(), settings);
    const activeBookingWeekStart = settings.forceShowNextWeek
        ? addBelarusDays(getBelarusWeekStart(getBelarusDate()), 7)
        : getActiveBookingWeekStart(new Date(), settings);
    const activeBookingWeekId = getBelarusWeekId(activeBookingWeekStart);

    const isSystemClosed = settings.forceCloseBookings || !isNextWeekOpen;

    const getMachineRealTimeStatus = (machine: Machine) => {
        const maintenanceDay = settings.maintenanceDay ?? 3;
        const state = getMachineOperatingState({
            machine,
            bookings: weekBookings,
            maintenanceDay,
        });

        if (state === 'maintenance') {
            const isMaintenanceDay = getBelarusWeekday(getBelarusDate()) === maintenanceDay;
            return { state, label: isMaintenanceDay ? t.maintenanceDay : t.underMaintenance, color: '#ef4444' };
        }

        if (state === 'occupied') return { state, label: t.inUse, color: '#f59e0b' };
        if (state === 'closed') return { state, label: t.closedForToday, color: '#ef4444' };

        return { state, label: t.readyToUse, color: '#10b981' };
    };


    const slotCapacity = useMemo(() => {
        const activeMachines = machines.filter(m => m.status === 'available');
        const slotsPerDay = TIME_SLOTS.length * activeMachines.length;

        const maintenanceDay = settings.maintenanceDay ?? 3;
        const weekDates = Array.from({ length: 7 }, (_, i) => addBelarusDays(activeBookingWeekStart, i));
        const bookableDates = weekDates.filter(d => getBelarusWeekday(d) !== maintenanceDay).map(formatBelarusDate);

        const totalSlots = slotsPerDay * bookableDates.length;
        const bookedInTargetWeek = weekBookings.filter(
            b => b.weekId === activeBookingWeekId && bookableDates.includes(b.date)
        ).length;
        const remainingSlots = Math.max(totalSlots - bookedInTargetWeek, 0);

        return { totalSlots, remainingSlots, bookableDays: bookableDates.length, slotsPerDay };
    }, [activeBookingWeekId, activeBookingWeekStart, machines, settings.maintenanceDay, weekBookings]);

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

    const handleOpenBookingStatus = () => {
        preloadBookingRoute();
        navigate('/book?status=1');
    };

    const handleOpenWeeklySlots = () => {
        preloadWeeklySlotsRoute();
        navigate('/weekly-slots');
    };

    const clearRoommateHold = () => {
        if (roommateHoldTimerRef.current) {
            window.clearTimeout(roommateHoldTimerRef.current);
            roommateHoldTimerRef.current = null;
        }
    };

    const startRoommateHold = () => {
        if (!canOpenRoommateMenu) return;

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

        setIsRoommateMenuOpen((current) => !current);
        hapticSelection();
    };

    const resetAddAccountForm = () => {
        setAccountLookupRoom('');
        setAccountLookupPin('');
        setAccountLookupError(null);
        setAccountLookupCandidates([]);
    };

    const handleOpenAddAccount = () => {
        setIsRoommateMenuOpen(true);
        setIsAddAccountMode(true);
        resetAddAccountForm();
        hapticSelection();
    };

    const handleAddAccountSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const normalizedRoom = accountLookupRoom.trim();
        const normalizedPin = accountLookupPin.trim();

        if (!normalizedRoom || !normalizedPin || accountLookupLoading) {
            return;
        }

        setAccountLookupLoading(true);
        setAccountLookupError(null);
        setAccountLookupCandidates([]);

        try {
            const roomStudents = await residentFirestoreService.getStudentsByRoom(normalizedRoom);
            if (roomStudents.length === 0) {
                setAccountLookupError(t.accountNotFound);
                return;
            }

            const correctPin = roomStudents[0]?.pin;
            if (correctPin && normalizedPin !== correctPin) {
                setAccountLookupError(t.accountWrongPin);
                return;
            }

            const candidates = dedupeRoommates(roomStudents);
            const hasUnsavedCandidate = candidates.some((student) => !savedAccounts.some((account) => account.id === student.id));
            setAccountLookupCandidates(candidates);
            if (!hasUnsavedCandidate) {
                setAccountLookupError(t.accountAlreadySaved);
            }
        } catch (error) {
            console.error('Failed to verify saved account', error);
            setAccountLookupError(t.accountLookupFailed);
        } finally {
            setAccountLookupLoading(false);
        }
    };

    const saveAccounts = (nextAccounts: Student[]) => {
        const normalizedAccounts = buildSavedAccountList(user, nextAccounts);
        bookingService.setSavedAccounts(normalizedAccounts);
        setSavedAccounts(normalizedAccounts);
    };

    const handleSavedAccountRemove = (studentId: string) => {
        if (studentId === user?.id) {
            return;
        }

        saveAccounts(savedAccounts.filter((student) => student.id !== studentId));
        hapticSelection();
    };

    const handleRoommateSwitch = (nextResident: Student) => {
        if (!user || nextResident.id === user.id) {
            setIsRoommateMenuOpen(false);
            return;
        }

        const cachedBookings = residentSnapshotService.getCachedWarmSnapshot(dashboardWeekIds, nextResident.id, true)?.recentBookings
            ?? residentFirestoreService.getCachedRecentBookingsForStudent(nextResident.id, RECENT_BOOKINGS_LIMIT);

        const nextSavedAccounts = buildSavedAccountList(nextResident, [...savedAccounts, user, nextResident]);
        bookingService.setSavedAccounts(nextSavedAccounts);
        bookingService.setCurrentUser(nextResident);
        startTransition(() => {
            setUser(nextResident);
            setRecentBookings(cachedBookings ?? []);
        });
        setSavedAccounts(buildSavedAccountList(nextResident, bookingService.getSavedAccounts()));
        setLoading(false);
        setRecentBookingsHydrated(cachedBookings !== undefined);
        setRecentBookingsLoading(cachedBookings === undefined);
        setLoadIssue(null);
        setLoadErrorMessage(null);
        setIsRoommateMenuOpen(false);
        setIsAddAccountMode(false);
        resetAddAccountForm();
        preloadBookingRoute();
        preloadWeeklySlotsRoute();
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
        setRecentBookingsLoading(!hasCachedRecentBookings);
        if (!hasResidentSnapshot) {
            setBannersLoading(banners.length === 0);
        }
        setReloadKey((current) => current + 1);
    };

    const hasBookedForActiveWeek = weekBookings.some((booking) => booking.studentId === userId && booking.weekId === activeBookingWeekId);

    let mainActionLabel = t.bookNow;
    let mainActionSubtitle = t.bookSubtitle;

    if (isSystemClosed) {
        mainActionSubtitle = t.bookingsClosed;
    } else if (hasBookedForActiveWeek) {
        mainActionLabel = t.booked;
        mainActionSubtitle = t.bookedSubtitle;
    }

    const showBlockingDashboardNotice = (loading && residentLoadSlow && !hasCoreResidentSnapshot)
        || (!loading && loadIssue === 'error' && !hasCoreResidentSnapshot);
    const isDashboardShellBooting = loading && !hasCoreResidentSnapshot;
    const showStatusSkeleton = loading && machines.length === 0;

    if (isDashboardShellBooting) {
        mainActionLabel = t.openSlots;
        mainActionSubtitle = t.loadingLatest;
    }

    if (showBlockingDashboardNotice) {
        return (
            <div className="container animate-fade-in flex-center" style={{ minHeight: '100vh', padding: '24px' }}>
                <DataLoadNotice
                    tone="error"
                    title={residentLoadSlow ? t.dashboardSlowTitle : t.dashboardFailedTitle}
                    description={loadErrorMessage ?? t.dashboardRetryDescription}
                    onRetry={retryDashboardData}
                    retryLabel={t.retryDashboard}
                />
            </div>
        );
    }

    if (!user) return null;

    const shouldShowRecentBookingsLoading = !recentBookingsHydrated || recentBookingsLoading;
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

    const handleResidentBookingCancelled = (cancelledBookingId: string) => {
        startTransition(() => {
            setWeekBookings((currentBookings) => currentBookings.filter((booking) => booking.id !== cancelledBookingId));
            setRecentBookings((currentBookings) => currentBookings.filter((booking) => booking.id !== cancelledBookingId));
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
            <header
                className="resident-header"
                style={{
                    marginBottom: '32px',
                    marginTop: settings.topAlert?.isActive ? '48px' : '16px',
                    transition: 'margin-top 0.3s ease'
                }}
            >
                <div className="resident-header-main">
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
                            aria-label={canOpenRoommateMenu ? t.switchRoommateProfile : t.currentResidentProfile}
                        >
                            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '0.04em' }}>
                                {getResidentInitialsForLanguage(user.name, isRussian)}
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
                                    <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{t.bookForRoommate}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                {t.savedAccountsHint}
                                            </div>
                                        </div>
                                        {isAddAccountMode && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsAddAccountMode(false);
                                                    resetAddAccountForm();
                                                }}
                                                className="glass-button"
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '999px',
                                                    padding: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}
                                                aria-label={t.cancelAddAccount}
                                                title={t.cancelAddAccount}
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        {savedAccounts.map((resident) => {
                                            const isActiveResident = resident.id === user.id;
                                            return (
                                                <div
                                                    key={resident.id}
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: isActiveResident ? '1fr' : '1fr auto',
                                                        gap: '8px',
                                                        alignItems: 'stretch'
                                                    }}
                                                >
                                                    <button
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
                                                                {getResidentInitialsForLanguage(resident.name, isRussian)}
                                                            </div>
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {getResidentShortNameForLanguage(resident.name, isRussian)}
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                                    {t.roomLabel(resident.roomNumber)}
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

                                                    {!isActiveResident && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSavedAccountRemove(resident.id)}
                                                            className="glass-button"
                                                            aria-label={`Remove ${getResidentShortNameForLanguage(resident.name, isRussian)}`}
                                                            style={{
                                                                width: '42px',
                                                                borderRadius: '14px',
                                                                padding: 0,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: 'var(--text-muted)'
                                                            }}
                                                        >
                                                            <X size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {savedAccounts.length <= 1 && !isAddAccountMode && (
                                            <div style={{ padding: '8px 4px 2px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {t.noOtherRoommates}
                                            </div>
                                        )}

                                        {isAddAccountMode && (
                                            <form onSubmit={handleAddAccountSubmit} style={{ display: 'grid', gap: '10px', paddingTop: '6px' }}>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {t.addAccountDescription}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: '8px' }}>
                                                    <label style={{ display: 'grid', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        {t.accountRoomLabel}
                                                        <input
                                                            type="text"
                                                            value={accountLookupRoom}
                                                            onChange={(event) => setAccountLookupRoom(event.target.value)}
                                                            placeholder={t.accountRoomPlaceholder}
                                                            autoComplete="off"
                                                            style={{
                                                                width: '100%',
                                                                minWidth: 0,
                                                                boxSizing: 'border-box',
                                                                borderRadius: '12px',
                                                                border: '1px solid var(--glass-border)',
                                                                background: 'rgba(15, 23, 42, 0.42)',
                                                                color: 'var(--text-main)',
                                                                padding: '11px 12px',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </label>
                                                    <label style={{ display: 'grid', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        {t.accountPinLabel}
                                                        <input
                                                            type="password"
                                                            inputMode="numeric"
                                                            maxLength={3}
                                                            value={accountLookupPin}
                                                            onChange={(event) => setAccountLookupPin(event.target.value)}
                                                            placeholder={t.accountPinPlaceholder}
                                                            style={{
                                                                width: '100%',
                                                                minWidth: 0,
                                                                boxSizing: 'border-box',
                                                                borderRadius: '12px',
                                                                border: '1px solid var(--glass-border)',
                                                                background: 'rgba(15, 23, 42, 0.42)',
                                                                color: 'var(--text-main)',
                                                                padding: '11px 12px',
                                                                outline: 'none',
                                                                textAlign: 'center',
                                                                letterSpacing: '0.1em'
                                                            }}
                                                        />
                                                    </label>
                                                </div>

                                                <button
                                                    type="submit"
                                                    className="primary-button"
                                                    disabled={accountLookupLoading}
                                                    style={{
                                                        width: '100%',
                                                        padding: '11px 14px',
                                                        borderRadius: '12px',
                                                        fontSize: '13px',
                                                        opacity: accountLookupLoading ? 0.72 : 1
                                                    }}
                                                >
                                                    {accountLookupLoading ? t.refreshingRoommates : t.verifyAccount}
                                                </button>

                                                {accountLookupError && (
                                                    <div style={{ fontSize: '12px', color: accountLookupCandidates.length > 0 ? 'var(--text-muted)' : '#fca5a5' }}>
                                                        {accountLookupError}
                                                    </div>
                                                )}

                                                {accountLookupCandidates.length > 0 && (
                                                    <div style={{ display: 'grid', gap: '8px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                            {t.chooseAccount}
                                                        </div>
                                                        {accountLookupCandidates.map((resident) => {
                                                            const isSaved = savedAccounts.some((account) => account.id === resident.id);
                                                            return (
                                                                <button
                                                                    key={resident.id}
                                                                    type="button"
                                                                    onClick={() => handleRoommateSwitch(resident)}
                                                                    className="glass-button"
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '11px 12px',
                                                                        borderRadius: '14px',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'space-between',
                                                                        gap: '10px',
                                                                        textAlign: 'left',
                                                                        background: isSaved ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.08)'
                                                                    }}
                                                                >
                                                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {getResidentShortNameForLanguage(resident.name, isRussian)}
                                                                    </span>
                                                                    {isSaved && <Check size={14} color="var(--success)" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </form>
                                        )}
                                    </div>
                            </div>
                        )}
                    </div>

                    <div className="resident-header-copy">
                        <div className="resident-header-title-row">
                            <h2 className="resident-header-title">
                                {t.hello}, {getResidentFirstNameForLanguage(user.name, isRussian)} 👋
                            </h2>
                            <button
                                onClick={handleLogout}
                                className="glass-button resident-header-logout"
                                style={{
                                    padding: '8px',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <LogOut size={20} />
                            </button>
                        </div>
                        <div className="resident-header-meta">
                            <p className="resident-header-room">
                                {t.roomLabel(user.roomNumber)}
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    onClick={handleOpenAddAccount}
                                    className="glass-button"
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '999px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        color: 'var(--text-main)'
                                    }}
                                >
                                    <UserPlus size={15} />
                                    {t.addAccount}
                                </button>
                                {canOpenRoommateMenu && (
                                    <button
                                        type="button"
                                        onClick={handleRoommateButtonClick}
                                        className="resident-header-switch-hint"
                                        style={{
                                            border: 0,
                                            padding: 0,
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            color: 'var(--text-muted)',
                                            fontSize: '13px'
                                        }}
                                    >
                                        {t.accountsAvailable(savedAccounts.length)}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="resident-header-actions">
                    <button
                        ref={weeklySlotsButtonRef}
                        type="button"
                        onClick={handleOpenWeeklySlots}
                        onMouseEnter={preloadWeeklySlotsRoute}
                        onTouchStart={preloadWeeklySlotsRoute}
                        className="glass-button weekly-slots-dashboard-button"
                        aria-label={t.weeklySlotsAria}
                        title={t.weeklySlots}
                    >
                        <CalendarSearch size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const nextLanguage: ResidentPortalLanguage = language === 'ru' ? 'en' : 'ru';
                            setLanguage(nextLanguage);
                            setResidentPortalLanguage(nextLanguage);
                        }}
                        className="glass-button"
                        style={{
                            padding: '8px 14px',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Languages size={16} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.switchLanguage}</span>
                    </button>
                </div>
            </header>

            {loadIssue === 'saved' && (
                <div style={{ marginBottom: '20px' }}>
                    <DataLoadNotice
                        compact
                        title={t.showingSavedTitle}
                        description={loadErrorMessage ?? t.showingSavedDescription}
                        onRetry={retryDashboardData}
                        retryLabel={t.refreshData}
                    />
                </div>
            )}

            {/* Announcements Carousel */}
            <div>
                <BannerCarousel
                    banners={banners}
                    isLoading={bannersLoading}
                    onPrimaryBannerReady={handlePrimaryBannerReady}
                />
            </div>

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
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600 }}>{t.needToWash}</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                        {mainActionSubtitle}
                    </p>
                </div>
                <div className="main-action-buttons">
                    <button
                        onClick={handleOpenBooking}
                        onMouseEnter={preloadBookingRoute}
                        onTouchStart={preloadBookingRoute}
                        className="primary-button"
                        style={{
                            padding: '11px 24px',
                            borderRadius: '12px',
                            background: isSystemClosed
                                ? 'var(--error)'
                                : hasBookedForActiveWeek
                                    ? 'var(--resident-ready-green)'
                                    : 'var(--primary)',
                            boxShadow: isSystemClosed
                                ? '0 0 15px rgba(239, 68, 68, 0.3)'
                                : hasBookedForActiveWeek
                                    ? '0 10px 24px rgba(16, 185, 129, 0.26)'
                                    : '0 0 15px var(--primary-glow)',
                            minWidth: '118px',
                            flexShrink: 0,
                            fontSize: '14px',
                            fontWeight: 700,
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {mainActionLabel}
                    </button>
                    <button
                        onClick={handleOpenBookingStatus}
                        onMouseEnter={preloadBookingRoute}
                        onTouchStart={preloadBookingRoute}
                        className="glass-button check-status-button"
                    >
                        <span className="check-status-clock" aria-hidden="true">
                            <Clock size={15} />
                        </span>
                        <span>{t.checkStatus}</span>
                    </button>
                </div>
            </div>


            {/* Machine Status - Live View */}
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {t.status}
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 'normal',
                                background: 'var(--glass-button-bg)',
                                border: '1px solid var(--glass-border)',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            color: 'var(--text-muted)'
                        }}>
                            {formatBelarusClockLabel(new Date(), dateLocale)}
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
                        <div className="glass-panel dashboard-status-overview" style={{
                            marginBottom: '20px',
                            padding: '20px',
                            borderRadius: '16px',
                            position: 'relative',
                            overflow: 'hidden',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%)',
                            border: '1px solid rgba(99, 102, 241, 0.2)'
                        }}>
                            <div className="dashboard-status-overview-row" style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="dashboard-status-state" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
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
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>{t.systemStatus}</div>
                                        <div style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{
                                                width: '8px', height: '8px', borderRadius: '50%',
                                                background: isSystemClosed ? 'var(--error)' : 'var(--success)',
                                                boxShadow: `0 0 10px ${isSystemClosed ? 'var(--error)' : 'var(--success)'}`
                                            }}></span>
                                            {isSystemClosed ? t.closed : t.active}
                                        </div>
                                    </div>
                                </div>

                                <div className="dashboard-status-slots" style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>{t.weekSlots}</div>
                                    <div className="dashboard-status-slot-count" style={{ display: 'flex', alignItems: 'baseline', gap: '4px', justifyContent: 'flex-end' }}>
                                        <span className="dashboard-status-slot-remaining" style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
                                            {slotCapacity.remainingSlots}
                                        </span>
                                        <span className="dashboard-status-slot-total" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
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
                            {machines.map((machine) => {
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
                                                {status.state === 'maintenance' || status.state === 'closed' ? <AlertCircle size={24} color={status.color} /> : <Washer size={24} color={status.color} />}
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
                                                {status.state === 'available' ? t.ready : status.state === 'occupied' ? t.finishesSoon : t.closedShort}
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
                style={{
                    minHeight: '220px',
                    contentVisibility: 'auto',
                    containIntrinsicSize: '220px'
                }}
            >
                <div className={isBookingSummaryActive ? 'scroll-reveal-content' : undefined}>
                    <Suspense fallback={null}>
                        <LazyDashboardBookingSummary
                            key={userId}
                            user={user}
                            machines={machines}
                            recentBookings={recentBookings}
                            recentBookingsLoading={shouldShowRecentBookingsLoading}
                            weekBookings={weekBookings}
                            settings={settings}
                            isNextWeekOpen={isNextWeekOpen}
                            isRussian={isRussian}
                            onBookingCreated={handleResidentBookingCreated}
                            onBookingCancelled={handleResidentBookingCancelled}
                        />
                    </Suspense>
                </div>
            </div>

            {/* Inline Feedback Section */}
            <div
                ref={feedbackSectionRef}
                className={`scroll-reveal${isFeedbackActive ? ' scroll-reveal--visible' : ''}`}
                style={{
                    minHeight: '132px',
                    contentVisibility: 'auto',
                    containIntrinsicSize: '132px'
                }}
            >
                <div className={isFeedbackActive ? 'scroll-reveal-content' : undefined}>
                    <Suspense fallback={null}>
                        <LazyDashboardFeedback isRussian={isRussian} />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
