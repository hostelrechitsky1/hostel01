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

const BANNER_WIDTH_STEPS = [160, 240, 320, 480, 640, 768, 960];
const PROXIED_BANNER_HOSTS = [
    'drive.google.com',
    'lh3.googleusercontent.com',
    'googleusercontent.com',
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
] as const;
const warmedBannerSources = new Set<string>();
const warmingBannerSources = new Map<string, Promise<void>>();

type BannerImageDescriptor = Partial<Pick<
    Banner,
    'id' | 'imageUrl' | 'previewImageUrl' | 'optimizedImageUrl' | 'mobileImageUrl' | 'desktopImageUrl' | 'responsiveSrcSet' | 'responsiveSizes'
>> & {
    imageUrl: string;
};

type BannerImageSource = BannerImageDescriptor | string;

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

const canUseSessionStorage = () => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const asBannerImageObject = (source: BannerImageSource): BannerImageDescriptor => (
    typeof source === 'string'
        ? { imageUrl: source }
        : source
);

const roundBannerWidth = (requestedWidth: number) => {
    return BANNER_WIDTH_STEPS.find((step) => step >= requestedWidth) ?? BANNER_WIDTH_STEPS[BANNER_WIDTH_STEPS.length - 1];
};

const getResponsiveBannerWidths = (priority: boolean) => {
    const connection = getConnectionInfo();
    const effectiveType = connection?.effectiveType;
    const saveData = connection?.saveData === true;

    if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
        return priority ? [240, 320] : [160, 240];
    }

    if (effectiveType === '3g') {
        return priority ? [320, 480, 640] : [240, 320, 480];
    }

    return priority ? [320, 480, 640, 768, 960] : [240, 320, 480, 640];
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

const shouldProxyBannerSource = (source: string) => {
    if (typeof window === 'undefined') return false;
    if (!source) return false;

    try {
        const requestUrl = new URL(source, window.location.href);

        if (!['http:', 'https:'].includes(requestUrl.protocol)) {
            return false;
        }

        if (requestUrl.origin === window.location.origin) {
            return false;
        }

        return PROXIED_BANNER_HOSTS.some((host) => (
            requestUrl.hostname === host || requestUrl.hostname.endsWith(`.${host}`)
        ));
    } catch {
        return false;
    }
};

const buildBannerProxyUrl = (source: string, requestedWidth?: number) => {
    const normalizedSource = normalizeBannerSource(source);
    if (!shouldProxyBannerSource(normalizedSource)) {
        return normalizedSource;
    }

    const params = new URLSearchParams({
        src: normalizedSource,
    });

    if (isDriveThumbnailBanner(normalizedSource) && requestedWidth) {
        params.set('w', String(roundBannerWidth(requestedWidth)));
    }

    return `/.netlify/functions/banner-asset?${params.toString()}`;
};

const proxyResponsiveSrcSet = (srcSet: string) => (
    srcSet
        .split(',')
        .map((candidate) => candidate.trim())
        .filter(Boolean)
        .map((candidate) => {
            const parts = candidate.split(/\s+/);
            const descriptor = parts.length > 1 ? parts.pop() : undefined;
            const url = parts.join(' ');
            const width = descriptor?.endsWith('w') ? Number(descriptor.slice(0, -1)) : undefined;
            const proxiedUrl = buildBannerProxyUrl(url, Number.isFinite(width) ? width : undefined);
            return descriptor ? `${proxiedUrl} ${descriptor}` : proxiedUrl;
        })
        .join(', ')
);

const getViewportScaledWidth = (priority: boolean) => {
    const viewportWidth = typeof window === 'undefined' ? 1280 : Math.max(window.innerWidth, 360);
    const devicePixelRatio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const connection = getConnectionInfo();
    const effectiveType = connection?.effectiveType;
    const saveData = connection?.saveData === true;

    let requestedWidth = Math.ceil(viewportWidth * devicePixelRatio * (priority ? 0.95 : 0.7));

    if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
        requestedWidth = Math.min(requestedWidth, priority ? 320 : 240);
    } else if (effectiveType === '3g') {
        requestedWidth = Math.min(requestedWidth, priority ? 640 : 480);
    } else {
        requestedWidth = Math.min(requestedWidth, priority ? 960 : 640);
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

const getBannerDisplayMemoryKey = (source: BannerImageSource) => {
    const banner = asBannerImageObject(source);
    const normalizedSource = normalizeBannerSource(banner.imageUrl);
    return `hostel-banner:display:${banner.id ?? normalizedSource}`;
};

const normalizeOptionalBannerSource = (source?: string) => {
    if (!source) return undefined;
    const normalized = normalizeBannerSource(source);
    return normalized || undefined;
};

const getPreferredBannerFullSource = (source: BannerImageSource, options?: { priority?: boolean }) => {
    const banner = asBannerImageObject(source);
    const viewportWidth = typeof window === 'undefined' ? 1280 : Math.max(window.innerWidth, 360);
    const prefersMobile = viewportWidth <= 768;
    const preferredSource = prefersMobile
        ? banner.mobileImageUrl ?? banner.optimizedImageUrl ?? banner.desktopImageUrl ?? banner.imageUrl
        : banner.desktopImageUrl ?? banner.optimizedImageUrl ?? banner.mobileImageUrl ?? banner.imageUrl;

    return getAdaptiveBannerSrc(preferredSource, options);
};

const getPreferredBannerPreviewSource = (source: BannerImageSource) => {
    const banner = asBannerImageObject(source);
    if (banner.previewImageUrl) {
        return normalizeBannerSource(banner.previewImageUrl);
    }

    const fallbackSource = banner.optimizedImageUrl ?? banner.mobileImageUrl ?? banner.desktopImageUrl ?? banner.imageUrl;
    return getTinyBannerSrc(fallbackSource);
};

const createExplicitResponsiveSrcSet = (source: BannerImageSource) => {
    const banner = asBannerImageObject(source);
    const candidates = [
        banner.mobileImageUrl ? { src: normalizeBannerSource(banner.mobileImageUrl), width: 480 } : null,
        banner.optimizedImageUrl ? { src: normalizeBannerSource(banner.optimizedImageUrl), width: 720 } : null,
        banner.desktopImageUrl ? { src: normalizeBannerSource(banner.desktopImageUrl), width: 960 } : null,
        banner.imageUrl ? { src: normalizeBannerSource(banner.imageUrl), width: 1280 } : null,
    ].filter((candidate): candidate is { src: string; width: number } => Boolean(candidate?.src));

    const uniqueCandidates = candidates.filter((candidate, index) => (
        candidates.findIndex((other) => other.src === candidate.src) === index
    ));

    if (uniqueCandidates.length <= 1) {
        return undefined;
    }

    return uniqueCandidates
        .map((candidate) => `${buildBannerProxyUrl(candidate.src, candidate.width)} ${candidate.width}w`)
        .join(', ');
};

const createDerivedDriveBannerAssets = (source: string) => {
    const normalizedSource = normalizeBannerSource(source);
    if (!isDriveThumbnailBanner(normalizedSource)) {
        return {};
    }

    const previewImageUrl = replaceDriveThumbnailWidth(normalizedSource, 240);
    const mobileImageUrl = replaceDriveThumbnailWidth(normalizedSource, 480);
    const optimizedImageUrl = replaceDriveThumbnailWidth(normalizedSource, 768);
    const desktopImageUrl = replaceDriveThumbnailWidth(normalizedSource, 960);

    return {
        previewImageUrl,
        mobileImageUrl,
        optimizedImageUrl,
        desktopImageUrl,
        responsiveSrcSet: [
            `${mobileImageUrl} 480w`,
            `${optimizedImageUrl} 768w`,
            `${desktopImageUrl} 960w`,
        ].join(', '),
        responsiveSizes: '(max-width: 640px) calc(100vw - 40px), (max-width: 960px) min(92vw, 640px), 640px',
    };
};

export const normalizeBannerRecord = (banner: Banner): Banner => {
    const derivedAssets = createDerivedDriveBannerAssets(banner.imageUrl);

    return {
        ...banner,
        ...derivedAssets,
        imageUrl: normalizeBannerSource(banner.imageUrl),
        previewImageUrl: normalizeOptionalBannerSource(banner.previewImageUrl) ?? derivedAssets.previewImageUrl,
        optimizedImageUrl: normalizeOptionalBannerSource(banner.optimizedImageUrl) ?? derivedAssets.optimizedImageUrl,
        mobileImageUrl: normalizeOptionalBannerSource(banner.mobileImageUrl) ?? derivedAssets.mobileImageUrl,
        desktopImageUrl: normalizeOptionalBannerSource(banner.desktopImageUrl) ?? derivedAssets.desktopImageUrl,
        responsiveSrcSet: banner.responsiveSrcSet?.trim() || derivedAssets.responsiveSrcSet || undefined,
        responsiveSizes: banner.responsiveSizes?.trim() || derivedAssets.responsiveSizes || undefined,
    };
};

export const getAdaptiveBannerSrc = (source: string, options?: { priority?: boolean }) => {
    const normalizedSource = normalizeBannerSource(source);
    const requestedWidth = isDriveThumbnailBanner(normalizedSource)
        ? getViewportScaledWidth(Boolean(options?.priority))
        : undefined;
    const sizedSource = requestedWidth
        ? replaceDriveThumbnailWidth(normalizedSource, requestedWidth)
        : normalizedSource;
    return buildBannerProxyUrl(sizedSource, requestedWidth);
};

export const getTinyBannerSrc = (source: string) => {
    const normalizedSource = normalizeBannerSource(source);
    const viewportWidth = typeof window === 'undefined' ? 640 : Math.max(window.innerWidth, 360);
    const requestedWidth = isDriveThumbnailBanner(normalizedSource)
        ? roundBannerWidth(Math.max(180, Math.min(Math.ceil(viewportWidth * 0.28), 360)))
        : undefined;
    const sizedSource = requestedWidth
        ? replaceDriveThumbnailWidth(normalizedSource, requestedWidth)
        : normalizedSource;
    return buildBannerProxyUrl(sizedSource, requestedWidth);
};

export const getBannerWarmSources = (source: BannerImageSource, options?: { priority?: boolean }) => {
    return {
        previewSource: getPreferredBannerPreviewSource(source),
        fullSource: getPreferredBannerFullSource(source, options)
    };
};

export const getBannerResponsiveSrcSet = (source: BannerImageSource, options?: { priority?: boolean }) => {
    const banner = asBannerImageObject(source);
    if (banner.responsiveSrcSet?.trim()) {
        return proxyResponsiveSrcSet(banner.responsiveSrcSet.trim());
    }

    const explicitResponsiveSet = createExplicitResponsiveSrcSet(source);
    if (explicitResponsiveSet) {
        return explicitResponsiveSet;
    }

    const normalizedSource = normalizeBannerSource(banner.optimizedImageUrl ?? banner.desktopImageUrl ?? banner.mobileImageUrl ?? banner.imageUrl);
    if (!isDriveThumbnailBanner(normalizedSource)) {
        return undefined;
    }

    return getResponsiveBannerWidths(Boolean(options?.priority))
        .map((width) => `${buildBannerProxyUrl(replaceDriveThumbnailWidth(normalizedSource, width), width)} ${width}w`)
        .join(', ');
};

export const getBannerResponsiveSizes = (source?: BannerImageSource) => {
    if (source && typeof source !== 'string' && source.responsiveSizes?.trim()) {
        return source.responsiveSizes.trim();
    }

    return '(max-width: 640px) calc(100vw - 40px), (max-width: 960px) min(92vw, 640px), 640px';
};

export const getRememberedBannerDisplaySource = (source: BannerImageSource) => {
    if (!canUseSessionStorage()) {
        return undefined;
    }

    try {
        return window.sessionStorage.getItem(getBannerDisplayMemoryKey(source)) ?? undefined;
    } catch {
        return undefined;
    }
};

export const rememberBannerDisplaySource = (source: BannerImageSource, displaySource: string) => {
    if (!displaySource || !canUseSessionStorage()) {
        return;
    }

    try {
        window.sessionStorage.setItem(getBannerDisplayMemoryKey(source), displaySource);
    } catch {
        // Ignore storage failures and keep runtime warm cache only.
    }
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

export const warmBannerSource = (source: BannerImageSource, options?: { priority?: boolean; eagerFull?: boolean; previewOnly?: boolean }) => {
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

    return Promise.allSettled(activeBanners.map((banner, index) => {
        return warmBannerSource(banner, {
            priority: index === 0,
            eagerFull: index === 0,
            previewOnly: index > 0,
        });
    })).then(() => undefined);
};
