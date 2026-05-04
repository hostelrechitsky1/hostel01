import { lazy, Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PrivateRoute } from './components/PrivateRoute';
import { RouteFallback } from './components/RouteFallback';
import { bookingService } from './services/bookingService';
import { lazyRoute } from './utils/lazyRoute';
import { shouldShowResidentPerfDebug } from './utils/performance';
import { preloadManagerRoutes, preloadResidentRoutes } from './utils/preloadRoutes';

const LoginScreen = lazyRoute(() => import('./pages/LoginScreen'));
const Dashboard = lazyRoute(() => import('./pages/Dashboard'));
const BookingFlow = lazyRoute(() => import('./pages/BookingFlow'));
const ManagerPanel = lazyRoute(() => import('./pages/ManagerPanel'));
const ManagerLogin = lazyRoute(() => import('./pages/ManagerLogin'));
const PrintSchedule = lazyRoute(() => import('./pages/PrintSchedule'));
const PrintMachineQr = lazyRoute(() => import('./pages/PrintMachineQr'));
const PrintCredentials = lazyRoute(() => import('./pages/PrintCredentials'));
const HostelAdminLogin = lazyRoute(() => import('./pages/HostelAdminLogin'));
const HostelAdminDashboard = lazyRoute(() => import('./pages/HostelAdminDashboard'));
const LazyToaster = lazy(() => import('sonner').then((module) => ({ default: module.Toaster })));
const LazyResidentPerfDebug = lazy(() =>
  import('./components/ResidentPerfDebug').then((module) => ({ default: module.ResidentPerfDebug }))
);

function ScrollToTopOnRouteChange() {
  const { pathname, key } = useLocation();

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return;

    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  const forceScrollToTop = () => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  useLayoutEffect(() => {
    forceScrollToTop();
  }, [pathname, key]);

  useEffect(() => {
    forceScrollToTop();
    let cancelled = false;
    const markUserScroll = () => {
      cancelled = true;
    };

    const safeForceScrollToTop = () => {
      if (!cancelled) {
        forceScrollToTop();
      }
    };

    const rafIds = [
      requestAnimationFrame(safeForceScrollToTop),
      requestAnimationFrame(() => requestAnimationFrame(safeForceScrollToTop)),
    ];
    const timeoutIds = [120, 240].map((delay) => (
      window.setTimeout(safeForceScrollToTop, delay)
    ));

    window.addEventListener('scroll', markUserScroll, { passive: true });
    window.addEventListener('touchstart', markUserScroll, { passive: true });
    window.addEventListener('wheel', markUserScroll, { passive: true });

    return () => {
      rafIds.forEach((rafId) => cancelAnimationFrame(rafId));
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      window.removeEventListener('scroll', markUserScroll);
      window.removeEventListener('touchstart', markUserScroll);
      window.removeEventListener('wheel', markUserScroll);
    };
  }, [pathname, key]);

  return null;
}

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: '100%', height: '100%' }}>
    {children}
  </div>
);

function RouteWarmup() {
  useEffect(() => {
    const startWarmup = () => {
      const currentUser = bookingService.getCurrentUser();
      if (currentUser) {
        preloadResidentRoutes();
        void import('./utils/warmResidentApp').then(({ warmResidentAppData }) => warmResidentAppData(currentUser.id, {
          includeRecentBookings: true,
          roomNumber: currentUser.roomNumber,
        }));
        return;
      }

      if (sessionStorage.getItem('manager_auth')) {
        preloadManagerRoutes();
        void import('./utils/warmAdminApp').then(({ warmAdminAppData }) => warmAdminAppData('manager'));
        return;
      }

      if (sessionStorage.getItem('hostel_admin_auth')) {
        preloadManagerRoutes();
        void import('./utils/warmAdminApp').then(({ warmAdminAppData }) => warmAdminAppData('staff'));
      }
    };

    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(startWarmup, { timeout: 1600 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(startWarmup, 450);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<PageWrapper><LoginScreen /></PageWrapper>} />

        <Route path="/" element={
          <PrivateRoute>
            <PageWrapper><Dashboard /></PageWrapper>
          </PrivateRoute>
        } />

        <Route path="/book" element={
          <PrivateRoute>
            <PageWrapper><BookingFlow /></PageWrapper>
          </PrivateRoute>
        } />

        <Route path="/manager/login" element={<PageWrapper><ManagerLogin /></PageWrapper>} />
        <Route path="/manager" element={<PageWrapper><ManagerPanel /></PageWrapper>} />
        <Route path="/manager/print-schedule" element={<PageWrapper><PrintSchedule /></PageWrapper>} />
        <Route path="/manager/print-qr" element={<PageWrapper><PrintMachineQr /></PageWrapper>} />
        <Route path="/manager/print-credentials" element={<PageWrapper><PrintCredentials /></PageWrapper>} />

        <Route path="/hostel-admin" element={<PageWrapper><HostelAdminLogin /></PageWrapper>} />
        <Route path="/hostel-admin/dashboard" element={<PageWrapper><HostelAdminDashboard /></PageWrapper>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function PerfDebugGate() {
  const location = useLocation();
  const shouldRender = useMemo(() => shouldShowResidentPerfDebug(), [location.search]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyResidentPerfDebug />
    </Suspense>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTopOnRouteChange />
      <RouteWarmup />
      <AnimatedRoutes />
      <PerfDebugGate />
      <Suspense fallback={null}>
        <LazyToaster
          position="top-center"
          richColors
          theme="system"
          toastOptions={{
            style: {
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--glass-border)',
            },
            className: 'glass-panel'
          }}
        />
      </Suspense>
    </Router>
  );
}

export default App;
