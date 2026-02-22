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
import StudyMaterials from './pages/StudyMaterials';
import { PrivateRoute } from './components/PrivateRoute';
function ScrollToTopOnRouteChange() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}

function App() {
  return (
    <Router>
      <ScrollToTopOnRouteChange />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />

        <Route path="/" element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } />

        import StudyMaterials from './pages/StudyMaterials';

        // ... (in App.tsx before the component)

        <Route path="/book" element={
          <PrivateRoute>
            <BookingFlow />
          </PrivateRoute>
        } />

        <Route path="/study" element={
          <PrivateRoute>
            <StudyMaterials />
          </PrivateRoute>
        } />

        <Route path="/manager/login" element={<ManagerLogin />} />
        <Route path="/manager" element={<ManagerPanel />} />
        <Route path="/manager/print-schedule" element={<PrintSchedule />} />
        <Route path="/manager/print-credentials" element={<PrintCredentials />} />

        <Route path="/hostel-admin" element={<HostelAdminLogin />} />
        <Route path="/hostel-admin/dashboard" element={<HostelAdminDashboard />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
