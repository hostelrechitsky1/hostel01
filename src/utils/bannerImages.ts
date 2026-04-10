import type { Banner } from '../types';

interface NetworkInformation {
    effectiveType?: string;
    saveData?: boolean;
}

type NavigatorWithConnection = Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
};

const BANNER_WIDTH_STEPS = [240, 360, 480, 640, 800, 960, 1200, 1440];
const warmedBannerSources = new Set<string>();
const warmingBannerSources = new Map<string, Promise<void>>();

const getConnectionInfo = () => {
    if (typeof navigator === 'undefined') return undefined;
    const navigatorConnection = navigator as NavigatorWithConnection;
    return navigatorConnection.connection || navigatorConnection.mozConnection || navigatorConnection.webkitConnection;
};

const roundBannerWidth = (requestedWidth: number) => {
    return BANNER_WIDTH_STEPS.find((step) => step >= requestedWidth) ?? BANNER_WIDTH_STEPS[BANNER_WIDTH_STEPS.length - 1];
};

const isDriveThumbnailBanner = (source: string) => {
    return source.includes('drive.google.com/thumbnail');
};

const replaceDriveThumbnailWidth = (source: string, width: number) => {
    return source.replace(/sz=w\d+/, `sz=w${width}`);
};

const getViewportScaledWidth = (priority: boolean) => {
    const viewportWidth = typeof window === 'undefined' ? 1280 : Math.max(window.innerWidth, 360);
    const devicePixelRatio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const connection = getConnectionInfo();
    const effectiveType = connection?.effectiveType;
    const saveData = connection?.saveData === true;

    let requestedWidth = Math.ceil(viewportWidth * devicePixelRatio * (priority ? 1.05 : 0.8));

    if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
        requestedWidth = Math.min(requestedWidth, priority ? 480 : 360);
    } else if (effectiveType === '3g') {
        requestedWidth = Math.min(requestedWidth, priority ? 800 : 640);
    } else {
        requestedWidth = Math.min(requestedWidth, priority ? 1200 : 960);
    }

    return roundBannerWidth(requestedWidth);
};

export const getAdaptiveBannerSrc = (source: string, options?: { priority?: boolean }) => {
    if (!isDriveThumbnailBanner(source)) return source;
    return replaceDriveThumbnailWidth(source, getViewportScaledWidth(Boolean(options?.priority)));
};

export const getTinyBannerSrc = (source: string) => {
    if (!isDriveThumbnailBanner(source)) return source;
    const viewportWidth = typeof window === 'undefined' ? 640 : Math.max(window.innerWidth, 360);
    return replaceDriveThumbnailWidth(source, roundBannerWidth(Math.max(240, Math.min(Math.ceil(viewportWidth * 0.35), 480))));
};

export const hasWarmBannerImage = (source: string) => {
    return warmedBannerSources.has(source);
};

export const markBannerImageLoaded = (source: string) => {
    if (source) {
        warmedBannerSources.add(source);
    }
};

export const ensureBannerPreloadLink = (source: string) => {
    if (!source || typeof document === 'undefined') return;

    const selector = `link[rel="preload"][as="image"][href="${source}"]`;
    if (document.head.querySelector(selector)) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = source;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
};

export const preloadBannerImage = (source: string) => {
    if (!source || typeof window === 'undefined') {
        return Promise.resolve();
    }

    if (warmedBannerSources.has(source)) {
        return Promise.resolve();
    }

    const existingLoad = warmingBannerSources.get(source);
    if (existingLoad) {
        return existingLoad;
    }

    const loadPromise = new Promise<void>((resolve) => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        img.onload = () => {
            warmedBannerSources.add(source);
            warmingBannerSources.delete(source);
            resolve();
        };
        img.onerror = () => {
            warmingBannerSources.delete(source);
            resolve();
        };
        img.src = source;

        if (img.complete) {
            warmedBannerSources.add(source);
            warmingBannerSources.delete(source);
            resolve();
        }
    });

    warmingBannerSources.set(source, loadPromise);
    return loadPromise;
};

export const warmBannerImages = (banners: Banner[], count = 2) => {
    const activeBanners = banners
        .filter((banner) => banner.isActive)
        .sort((left, right) => left.priority - right.priority)
        .slice(0, count);

    activeBanners.forEach((banner, index) => {
        const source = getAdaptiveBannerSrc(banner.imageUrl, { priority: index === 0 });
        ensureBannerPreloadLink(source);
        void preloadBannerImage(source);
    });
};
