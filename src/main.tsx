import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'shepherd.js/dist/css/shepherd.css';
import './index.css';
import App from './App.tsx';
import { observeResidentWebPaintMetrics } from './utils/performance';

const CONNECTION_HINTS = [
  'https://firestore.googleapis.com',
  'https://www.googleapis.com',
  'https://lh3.googleusercontent.com',
  'https://drive.google.com',
];
const ASSET_RECOVERY_STORAGE_KEY = 'hostel_asset_recovery_attempted';
const ASSET_RECOVERY_COOLDOWN_MS = 30_000;

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

const clearBrowserRuntimeCaches = async () => {
  const cleanupTasks: Promise<unknown>[] = [];

  if ('serviceWorker' in navigator) {
    cleanupTasks.push(
      navigator.serviceWorker.getRegistrations().then((registrations) => (
        Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)))
      ))
    );
  }

  if ('caches' in window) {
    cleanupTasks.push(
      caches.keys().then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
    );
  }

  await Promise.allSettled(cleanupTasks);
};

const getRecoverableAssetMessage = (errorLike: unknown) => {
  if (!errorLike) return '';
  if (typeof errorLike === 'string') return errorLike;
  if (errorLike instanceof Error) return errorLike.message;
  if (typeof errorLike === 'object' && 'message' in errorLike && typeof errorLike.message === 'string') {
    return errorLike.message;
  }
  return String(errorLike);
};

const isRecoverableAssetMessage = (message: string) => (
  /Failed to fetch dynamically imported module/i.test(message)
  || /Importing a module script failed/i.test(message)
  || /error loading dynamically imported module/i.test(message)
  || /Failed to load module script/i.test(message)
  || /ChunkLoadError/i.test(message)
  || /Loading chunk/i.test(message)
);

const isAssetLoadTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  if (tagName !== 'script' && tagName !== 'link') return false;

  const source = target instanceof HTMLScriptElement
    ? target.src
    : target instanceof HTMLLinkElement
      ? target.href
      : '';

  return source.includes('/assets/');
};

const recoverFromStaleAsset = () => {
  const lastAttempt = Number(window.sessionStorage.getItem(ASSET_RECOVERY_STORAGE_KEY) ?? '0');
  const now = Date.now();
  if (now - lastAttempt < ASSET_RECOVERY_COOLDOWN_MS) return;

  window.sessionStorage.setItem(ASSET_RECOVERY_STORAGE_KEY, String(now));

  void clearBrowserRuntimeCaches().finally(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('app_refresh', String(now));
    window.location.replace(nextUrl.toString());
  });
};

const installAssetRecoveryHandlers = () => {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    if (isAssetLoadTarget(event.target)) {
      recoverFromStaleAsset();
      return;
    }

    if (isRecoverableAssetMessage(event.message) || isRecoverableAssetMessage(getRecoverableAssetMessage(event.error))) {
      recoverFromStaleAsset();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (isRecoverableAssetMessage(getRecoverableAssetMessage(event.reason))) {
      recoverFromStaleAsset();
    }
  });
};

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  if (isDeployPreviewHost()) {
    cleanupPreviewServiceWorker();
    return;
  }

  const startRegistration = () => {
    let didRefreshForController = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (didRefreshForController) return;
      didRefreshForController = true;
      window.location.reload();
    });

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

installAssetRecoveryHandlers();
ensureConnectionHints();
registerServiceWorker();
observeResidentWebPaintMetrics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
