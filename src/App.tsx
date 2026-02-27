import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import LoginScreen from './pages/LoginScreen';
import Dashboard from './pages/Dashboard';
import BookingFlow from './pages/BookingFlow';
import ManagerPanel from './pages/ManagerPanel';
import ManagerLogin from './pages/ManagerLogin';
import PrintSchedule from './pages/PrintSchedule';
import PrintCredentials from './pages/PrintCredentials';
import HostelAdminLogin from './pages/HostelAdminLogin';
import HostelAdminDashboard from './pages/HostelAdminDashboard';
import { PrivateRoute } from './components/PrivateRoute';
function ScrollToTopOnRouteChange() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Timeout ensures DOM update has processed before scrolling
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 10);
  }, [pathname]);

  return null;
}

import { AnimatePresence, motion } from 'framer-motion';

const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2 }
};

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial="initial"
    animate="animate"
    exit="exit"
    variants={pageTransition}
    style={{ width: '100%', height: '100%' }}
  >
    {children}
  </motion.div>
);

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
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
    </AnimatePresence>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTopOnRouteChange />
      <AnimatedRoutes />
    </Router>
  );
}

export default App;
