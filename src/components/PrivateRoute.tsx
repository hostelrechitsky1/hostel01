import { Navigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';

export function PrivateRoute({ children }: { children: React.ReactNode }) {
    const user = bookingService.getCurrentUser();
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    return children;
}
