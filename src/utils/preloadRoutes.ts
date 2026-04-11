export const preloadDashboardRoute = () => {
    void import('../pages/Dashboard');
};

export const preloadBookingRoute = () => {
    void import('../pages/BookingFlow');
};

export const preloadResidentRoutes = () => {
    preloadDashboardRoute();
    preloadBookingRoute();
};

export const preloadManagerRoutes = () => {
    void import('../pages/ManagerLogin');
    void import('../pages/ManagerPanel');
    void import('../pages/PrintSchedule');
    void import('../pages/PrintCredentials');
    void import('../pages/HostelAdminLogin');
    void import('../pages/HostelAdminDashboard');
};
