import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react';
import { PrivateRoute } from './components/PrivateRoute';
import { Toaster } from 'sonner';
const LoginScreen = lazy(() => import('./pages/LoginScreen'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BookingFlow = lazy(() => import('./pages/BookingFlow'));
const ManagerPanel = lazy(() => import('./pages/ManagerPanel'));
const ManagerLogin = lazy(() => import('./pages/ManagerLogin'));
const PrintSchedule = lazy(() => import('./pages/PrintSchedule'));
const PrintCredentials = lazy(() => import('./pages/PrintCredentials'));
const HostelAdminLogin = lazy(() => import('./pages/HostelAdminLogin'));
const HostelAdminDashboard = lazy(() => import('./pages/HostelAdminDashboard'));

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
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  useLayoutEffect(() => {
    forceScrollToTop();
  }, [pathname, key]);

  useEffect(() => {
    forceScrollToTop();

    const rafId = requestAnimationFrame(() => {
      forceScrollToTop();
    });

    const timeoutId = window.setTimeout(() => {
      forceScrollToTop();
    }, 100);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [pathname, key]);

  return null;
}

import { motion } from 'framer-motion';

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

function AnimatedRoutes() {
  return (
    <Routes>
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
  );
}

function App() {
  return (
    <Router>
      <ScrollToTopOnRouteChange />
      <Suspense fallback={<AppShellFallback />}>
        <AnimatedRoutes />
      </Suspense>
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

function AppShellFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
      }}
    >
      Loading…
    </div>
  );
}

export default App;
