const isDeployPreviewHost = () => {
  if (typeof window === 'undefined') return false;

  const { hostname } = window.location;
  return hostname.startsWith('deploy-preview-') || hostname.includes('--');
};

const cleanupPreviewServiceWorker = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });

  if ('caches' in window) {
    void caches.keys().then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))));
  }
};

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  if (isDeployPreviewHost()) {
    cleanupPreviewServiceWorker();
    return;
  }

  const startRegistration = () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      const activateWaitingWorker = () => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      };

      activateWaitingWorker();

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        installingWorker?.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            activateWaitingWorker();
          }
        });
      });

      void registration.update().catch(() => { /* update failed silently */ });
    }).catch(() => { /* registration failed silently */ });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(startRegistration, { timeout: 2000 });
    return;
  }

  setTimeout(startRegistration, 1200);
};
