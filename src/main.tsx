import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { observeResidentWebPaintMetrics } from './utils/performance';

const CONNECTION_HINTS = [
  'https://firestore.googleapis.com',
  'https://www.googleapis.com',
  'https://lh3.googleusercontent.com',
  'https://drive.google.com',
];

const ensureConnectionHints = () => {
  if (typeof document === 'undefined') return;

  CONNECTION_HINTS.forEach((href) => {
    const dnsPrefetchSelector = `link[rel="dns-prefetch"][href="${href}"]`;
    if (!document.head.querySelector(dnsPrefetchSelector)) {
      const dnsPrefetch = document.createElement('link');
      dnsPrefetch.rel = 'dns-prefetch';
      dnsPrefetch.href = href;
      document.head.appendChild(dnsPrefetch);
    }

    const preconnectSelector = `link[rel="preconnect"][href="${href}"]`;
    if (!document.head.querySelector(preconnectSelector)) {
      const preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = href;
      preconnect.crossOrigin = 'anonymous';
      document.head.appendChild(preconnect);
    }
  });
};

const applyPreferredTheme = () => {
  if (typeof window === 'undefined') return;

  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = prefersLight ? 'light' : 'dark';
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0f172a');
};

const syncPreferredTheme = () => {
  if (typeof window === 'undefined') return;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  const updateTheme = () => applyPreferredTheme();
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      updateTheme();
    }
  };

  updateTheme();

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', updateTheme);
  } else {
    mediaQuery.addListener(updateTheme);
  }

  window.addEventListener('pageshow', updateTheme);
  window.addEventListener('focus', updateTheme);
  document.addEventListener('visibilitychange', handleVisibility);
};

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  const startRegistration = () => {
    let didRefreshForController = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (didRefreshForController) return;
      didRefreshForController = true;
      window.location.reload();
    });

    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting) {
        void registration.update().catch(() => { /* update failed silently */ });
      }

      void registration.update().catch(() => { /* update failed silently */ });
    }).catch(() => { /* registration failed silently */ });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(startRegistration, { timeout: 2000 });
    return;
  }

  setTimeout(startRegistration, 1200);
};

ensureConnectionHints();
syncPreferredTheme();
registerServiceWorker();
observeResidentWebPaintMetrics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
