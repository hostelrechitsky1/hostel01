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

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  const startRegistration = () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      void registration.update().catch(() => { /* update failed silently */ });
    }).catch(() => { /* registration failed silently */ });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(startRegistration, { timeout: 2000 });
    return;
  }

  setTimeout(startRegistration, 1200);
};

const applyPreferredTheme = (theme: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!themeColorMeta) {
    themeColorMeta = document.createElement('meta');
    themeColorMeta.name = 'theme-color';
    document.head.appendChild(themeColorMeta);
  }

  themeColorMeta.content = theme === 'light' ? '#f8fafc' : '#0f172a';
};

const syncPreferredTheme = () => {
  if (typeof window === 'undefined') return;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  const updateTheme = () => applyPreferredTheme(mediaQuery.matches ? 'light' : 'dark');

  updateTheme();

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', updateTheme);
    return;
  }

  mediaQuery.addListener(updateTheme);
};

ensureConnectionHints();
registerServiceWorker();
syncPreferredTheme();
observeResidentWebPaintMetrics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
