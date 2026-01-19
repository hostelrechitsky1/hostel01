import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen from './pages/LoginScreen';
import Dashboard from './pages/Dashboard';
import BookingFlow from './pages/BookingFlow';
import ManagerPanel from './pages/ManagerPanel';
import ManagerLogin from './pages/ManagerLogin';
import PrintSchedule from './pages/PrintSchedule';
import PrintCredentials from './pages/PrintCredentials';
import HostelAdminLogin from './pages/HostelAdminLogin';
import HostelAdminDashboard from './pages/HostelAdminDashboard';
import TicketGenerator from './pages/TicketGenerator';
import TicketScanner from './pages/TicketScanner';
import { PrivateRoute } from './components/PrivateRoute';
// import UserProfile from './pages/UserProfile'; // UserProfile page not found/implemented yet

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        {/* <Route path="/profile" element={<PrivateRoute><UserProfile /></PrivateRoute>} /> */}

        <Route path="/" element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } />

        <Route path="/book" element={
          <PrivateRoute>
            <BookingFlow />
          </PrivateRoute>
        } />

        <Route path="/manager/login" element={<ManagerLogin />} />
        <Route path="/manager" element={<PrivateRoute adminOnly><ManagerPanel /></PrivateRoute>} />
        <Route path="/manager/print-schedule" element={<PrintSchedule />} />
        <Route path="/manager/print-credentials" element={<PrintCredentials />} />
        <Route path="/manager/tickets" element={<PrivateRoute adminOnly><TicketGenerator /></PrivateRoute>} />
        <Route path="/manager/scanner" element={<PrivateRoute adminOnly><TicketScanner /></PrivateRoute>} />

        <Route path="/hostel-admin" element={<HostelAdminLogin />} />
        <Route path="/hostel-admin/dashboard" element={<HostelAdminDashboard />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
