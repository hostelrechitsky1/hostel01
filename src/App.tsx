import { lazy, Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
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
const PrintCredentials = lazyRoute(() => import('./pages/PrintCredentials'));
const HostelAdminLogin = lazyRoute(() => import('./pages/HostelAdminLogin'));
const HostelAdminDashboard = lazyRoute(() => import('./pages/HostelAdminDashboard'));
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
    let userStartedScrolling = false;

    const rafIds = [
      requestAnimationFrame(() => {
        if (!userStartedScrolling) {
          forceScrollToTop();
        }
      }),
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!userStartedScrolling) {
            forceScrollToTop();
          }
        });
      })
    ];

    const timeoutIds = [60, 180, 320, 520].map((delay) => {
      return window.setTimeout(() => {
        if (!userStartedScrolling) {
          forceScrollToTop();
        }
      }, delay);
    });

    const visualViewport = window.visualViewport;
    const handleViewportShift = () => {
      if (!userStartedScrolling) {
        forceScrollToTop();
      }
    };
    const markUserScroll = () => {
      userStartedScrolling = true;
    };

    visualViewport?.addEventListener('resize', handleViewportShift);
    window.addEventListener('scroll', markUserScroll, { passive: true });
    window.addEventListener('touchstart', markUserScroll, { passive: true });
    window.addEventListener('wheel', markUserScroll, { passive: true });

    return () => {
      rafIds.forEach((rafId) => cancelAnimationFrame(rafId));
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      visualViewport?.removeEventListener('resize', handleViewportShift);
      window.removeEventListener('scroll', markUserScroll);
      window.removeEventListener('touchstart', markUserScroll);
      window.removeEventListener('wheel', markUserScroll);
    };
  }, [pathname, key]);

  return null;
}

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="animate-fade-in" style={{ width: '100%', height: '100%' }}>
    {children}
  </div>
);

function RouteWarmup() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentUser = bookingService.getCurrentUser();
      if (currentUser) {
        preloadResidentRoutes();
        void import('./utils/warmResidentApp').then(({ warmResidentAppData }) => warmResidentAppData(currentUser.id));
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
    }, 200);

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
      <Toaster
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
    </Router>
  );
}

export default App;
