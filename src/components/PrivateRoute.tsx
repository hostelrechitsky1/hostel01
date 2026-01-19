import { Navigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';

export function PrivateRoute({ children, adminOnly: _adminOnly }: { children: React.ReactNode, adminOnly?: boolean }) {
    const user = bookingService.getCurrentUser();
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    // In a real app we would check user.role === 'admin' if adminOnly is true
    return <>{children}</>;
}
