import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

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

ensureConnectionHints();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
