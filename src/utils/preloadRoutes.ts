export const preloadDashboardRoute = () => {
    void import('../pages/Dashboard').catch(() => undefined);
};

export const preloadBookingRoute = () => {
    void import('../pages/BookingFlow').catch(() => undefined);
};

export const preloadWeeklySlotsRoute = () => {
    void import('../pages/WeeklySlots').catch(() => undefined);
};

export const preloadResidentRoutes = () => {
    preloadDashboardRoute();
    preloadBookingRoute();
    preloadWeeklySlotsRoute();
};

export const preloadManagerRoutes = () => {
    void import('../pages/ManagerLogin').catch(() => undefined);
    void import('../pages/ManagerPanel').catch(() => undefined);
    void import('../pages/PrintSchedule').catch(() => undefined);
    void import('../pages/PrintCredentials').catch(() => undefined);
    void import('../pages/HostelAdminLogin').catch(() => undefined);
    void import('../pages/HostelAdminDashboard').catch(() => undefined);
};
