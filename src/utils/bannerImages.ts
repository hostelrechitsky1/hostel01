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

const BANNER_WIDTH_STEPS = [180, 240, 360, 480, 640, 720, 840, 960];
const warmedBannerSources = new Set<string>();
const warmingBannerSources = new Map<string, Promise<void>>();

const getDriveFileId = (source: string) => {
    try {
        const url = new URL(source);
        const idFromQuery = url.searchParams.get('id');
        if (idFromQuery) return idFromQuery;

        const fileMatch = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileMatch?.[1]) return fileMatch[1];

        const thumbnailMatch = url.pathname.includes('/thumbnail') ? url.searchParams.get('id') : null;
        if (thumbnailMatch) return thumbnailMatch;

        return null;
    } catch {
        const idMatch = source.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/);
        return idMatch?.[1] ?? null;
    }
};

const buildDriveThumbnailUrl = (fileId: string, width = 1920) => {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
};

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

const getFetchMode = (source: string): RequestMode => {
    if (typeof window === 'undefined') return 'cors';

    try {
        const requestUrl = new URL(source, window.location.href);
        return requestUrl.origin === window.location.origin ? 'same-origin' : 'no-cors';
    } catch {
        return 'no-cors';
    }
};

const getViewportScaledWidth = (priority: boolean) => {
    const viewportWidth = typeof window === 'undefined' ? 1280 : Math.max(window.innerWidth, 360);
    const devicePixelRatio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const connection = getConnectionInfo();
    const effectiveType = connection?.effectiveType;
    const saveData = connection?.saveData === true;

    let requestedWidth = Math.ceil(viewportWidth * devicePixelRatio * (priority ? 0.95 : 0.7));

    if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
        requestedWidth = Math.min(requestedWidth, priority ? 360 : 240);
    } else if (effectiveType === '3g') {
        requestedWidth = Math.min(requestedWidth, priority ? 640 : 480);
    } else {
        requestedWidth = Math.min(requestedWidth, priority ? 960 : 720);
    }

    return roundBannerWidth(requestedWidth);
};

export const normalizeBannerSource = (source: string) => {
    const trimmedSource = source.trim();
    if (!trimmedSource) return trimmedSource;

    const fileId = getDriveFileId(trimmedSource);
    if (!fileId) return trimmedSource;

    return buildDriveThumbnailUrl(fileId);
};

export const getAdaptiveBannerSrc = (source: string, options?: { priority?: boolean }) => {
    const normalizedSource = normalizeBannerSource(source);
    if (!isDriveThumbnailBanner(normalizedSource)) return normalizedSource;
    return replaceDriveThumbnailWidth(normalizedSource, getViewportScaledWidth(Boolean(options?.priority)));
};

export const getTinyBannerSrc = (source: string) => {
    const normalizedSource = normalizeBannerSource(source);
    if (!isDriveThumbnailBanner(normalizedSource)) return normalizedSource;
    const viewportWidth = typeof window === 'undefined' ? 640 : Math.max(window.innerWidth, 360);
    return replaceDriveThumbnailWidth(normalizedSource, roundBannerWidth(Math.max(180, Math.min(Math.ceil(viewportWidth * 0.28), 360))));
};

export const getBannerWarmSources = (source: string, options?: { priority?: boolean }) => {
    return {
        previewSource: getTinyBannerSrc(source),
        fullSource: getAdaptiveBannerSrc(source, options)
    };
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
        const finish = () => {
            warmedBannerSources.add(source);
            warmingBannerSources.delete(source);
            resolve();
        };

        try {
            void fetch(source, {
                mode: getFetchMode(source),
                credentials: 'omit',
                cache: 'force-cache'
            }).catch(() => undefined);
        } catch {
            // Fallback to image loading only when fetch hints are unavailable.
        }

        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        img.onload = () => {
            if (typeof img.decode === 'function') {
                img.decode()
                    .catch(() => undefined)
                    .finally(finish);
                return;
            }
            finish();
        };
        img.onerror = () => {
            warmingBannerSources.delete(source);
            resolve();
        };
        img.src = source;

        if (img.complete) {
            finish();
        }
    });

    warmingBannerSources.set(source, loadPromise);
    return loadPromise;
};

export const warmBannerSource = (source: string, options?: { priority?: boolean; eagerFull?: boolean; previewOnly?: boolean }) => {
    const { previewSource, fullSource } = getBannerWarmSources(source, options);

    ensureBannerPreloadLink(previewSource);
    const previewWarmup = preloadBannerImage(previewSource);

    if (options?.previewOnly) {
        return previewWarmup.then(() => previewSource);
    }

    if (previewSource === fullSource) {
        return previewWarmup.then(() => fullSource);
    }

    const warmFullSource = () => {
        ensureBannerPreloadLink(fullSource);
        return preloadBannerImage(fullSource).then(() => fullSource);
    };

    if (options?.eagerFull || hasWarmBannerImage(previewSource)) {
        return warmFullSource();
    }

    return previewWarmup.then(warmFullSource);
};

export const warmBannerImages = (banners: Banner[], count = 2) => {
    const activeBanners = banners
        .filter((banner) => banner.isActive)
        .sort((left, right) => left.priority - right.priority)
        .slice(0, count);

    activeBanners.forEach((banner, index) => {
        void warmBannerSource(banner.imageUrl, {
            priority: index === 0,
            eagerFull: index === 0,
            previewOnly: index > 0,
        });
    });
};
