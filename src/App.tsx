import { Suspense, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { PrivateRoute } from './components/PrivateRoute';
import { RouteFallback } from './components/RouteFallback';
import { bookingService } from './services/bookingService';
import { lazyRoute } from './utils/lazyRoute';
import { preloadManagerRoutes, preloadResidentRoutes } from './utils/preloadRoutes';
import { warmAdminAppData } from './utils/warmAdminApp';
import { warmResidentAppData } from './utils/warmResidentApp';

const LoginScreen = lazyRoute(() => import('./pages/LoginScreen'));
const Dashboard = lazyRoute(() => import('./pages/Dashboard'));
const BookingFlow = lazyRoute(() => import('./pages/BookingFlow'));
const ManagerPanel = lazyRoute(() => import('./pages/ManagerPanel'));
const ManagerLogin = lazyRoute(() => import('./pages/ManagerLogin'));
const PrintSchedule = lazyRoute(() => import('./pages/PrintSchedule'));
const PrintCredentials = lazyRoute(() => import('./pages/PrintCredentials'));
const HostelAdminLogin = lazyRoute(() => import('./pages/HostelAdminLogin'));
const HostelAdminDashboard = lazyRoute(() => import('./pages/HostelAdminDashboard'));

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

    const rafIds = [
      requestAnimationFrame(() => {
        forceScrollToTop();
      }),
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          forceScrollToTop();
        });
      })
    ];

    const timeoutIds = [60, 180, 320, 520].map((delay) => {
      return window.setTimeout(() => {
        forceScrollToTop();
      }, delay);
    });

    const visualViewport = window.visualViewport;
    const handleViewportShift = () => {
      forceScrollToTop();
    };

    visualViewport?.addEventListener('resize', handleViewportShift);
    visualViewport?.addEventListener('scroll', handleViewportShift);

    return () => {
      rafIds.forEach((rafId) => cancelAnimationFrame(rafId));
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      visualViewport?.removeEventListener('resize', handleViewportShift);
      visualViewport?.removeEventListener('scroll', handleViewportShift);
    };
  }, [pathname, key]);

  return null;
}

const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.15, ease: 'easeOut' }
};

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial="initial"
    animate="animate"
    variants={pageTransition}
    style={{ width: '100%', height: '100%' }}
  >
    {children}
  </motion.div>
);

function RouteWarmup() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentUser = bookingService.getCurrentUser();
      if (currentUser) {
        preloadResidentRoutes();
        void warmResidentAppData(currentUser.id);
        return;
      }

      if (sessionStorage.getItem('manager_auth')) {
        preloadManagerRoutes();
        void warmAdminAppData('manager');
        return;
      }

      if (sessionStorage.getItem('hostel_admin_auth')) {
        preloadManagerRoutes();
        void warmAdminAppData('staff');
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

function App() {
  return (
    <Router>
      <ScrollToTopOnRouteChange />
      <RouteWarmup />
      <AnimatedRoutes />
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
