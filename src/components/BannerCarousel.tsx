import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Banner } from '../types';
import {
    ensureBannerPreloadLink,
    getBannerWarmSources,
    getRememberedBannerDisplaySource,
    getBannerResponsiveSizes,
    getBannerResponsiveSrcSet,
    hasWarmBannerImage,
    markBannerImageLoaded,
    preloadBannerImage,
    rememberBannerDisplaySource,
    warmBannerSource,
} from '../utils/bannerImages';

interface InternalBannerCarouselProps {
    banners: Banner[];
    isLoading?: boolean;
    onPrimaryBannerReady?: () => void;
}

// Helper component to handle image loading and retries
const SmartImage = ({
    source,
    alt,
    className,
    style,
    priority,
    shouldLoad,
    onDisplayReady,
    onFullLoad
}: {
    source: Banner;
    alt: string;
    className?: string;
    style?: CSSProperties;
    priority?: boolean;
    shouldLoad?: boolean;
    onDisplayReady?: () => void;
    onFullLoad?: () => void;
}) => {
    const initialSources = getBannerWarmSources(source, { priority });
    const initialPreviewSrc = initialSources.previewSource;
    const initialAdaptiveSrc = initialSources.fullSource;
    const initialRememberedSrc = getRememberedBannerDisplaySource(source);
    const initialDisplaySrc = hasWarmBannerImage(initialAdaptiveSrc)
        ? initialAdaptiveSrc
        : (initialRememberedSrc ?? initialPreviewSrc);
    const [imgSrc, setImgSrc] = useState(initialDisplaySrc);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(() => hasWarmBannerImage(initialDisplaySrc) || initialRememberedSrc === initialDisplaySrc);
    const [previewLoaded, setPreviewLoaded] = useState(() => (
        hasWarmBannerImage(initialPreviewSrc)
        || initialRememberedSrc === initialPreviewSrc
        || initialRememberedSrc === initialAdaptiveSrc
    ));
    const imgRef = useRef<HTMLImageElement>(null);
    const displayReadySourceRef = useRef<string | null>(null);
    const [adaptiveSrc, setAdaptiveSrc] = useState(initialAdaptiveSrc);
    const [previewSrc, setPreviewSrc] = useState(initialPreviewSrc);
    const [rememberedDisplaySrc, setRememberedDisplaySrc] = useState<string | undefined>(initialRememberedSrc);
    const [responsiveSrcSet, setResponsiveSrcSet] = useState<string | undefined>(getBannerResponsiveSrcSet(source, { priority }));

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const { previewSource, fullSource } = getBannerWarmSources(source, { priority });
        const rememberedDisplaySrc = getRememberedBannerDisplaySource(source);
        const nextDisplaySrc = hasWarmBannerImage(fullSource)
            ? fullSource
            : (rememberedDisplaySrc ?? previewSource);

        setAdaptiveSrc(fullSource);
        setPreviewSrc(previewSource);
        setRememberedDisplaySrc(rememberedDisplaySrc);
        setResponsiveSrcSet(getBannerResponsiveSrcSet(source, { priority }));
        displayReadySourceRef.current = null;
        setPreviewLoaded(
            hasWarmBannerImage(previewSource)
            || rememberedDisplaySrc === previewSource
            || rememberedDisplaySrc === fullSource
        );
        setLoaded(hasWarmBannerImage(nextDisplaySrc) || rememberedDisplaySrc === nextDisplaySrc);
        setImgSrc(nextDisplaySrc);
        setError(false);

        if (!shouldLoad) {
            return;
        }

        ensureBannerPreloadLink(previewSource);
        void preloadBannerImage(previewSource);

        if (previewSource === fullSource) {
            ensureBannerPreloadLink(fullSource);
            void preloadBannerImage(fullSource);
            return;
        }

        if (priority || hasWarmBannerImage(previewSource)) {
            ensureBannerPreloadLink(fullSource);
            void preloadBannerImage(fullSource);
            return;
        }

        void preloadBannerImage(previewSource).then(() => {
            ensureBannerPreloadLink(fullSource);
            return preloadBannerImage(fullSource);
        });
    }, [priority, shouldLoad, source]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!shouldLoad) return;
        if (!previewLoaded || !adaptiveSrc || !previewSrc) return;
        if (previewSrc === adaptiveSrc) return;
        if (imgSrc === adaptiveSrc) return;

        const nextAdaptiveSrc = adaptiveSrc;
        let isActive = true;

        void preloadBannerImage(nextAdaptiveSrc).then(() => {
            if (!isActive) return;
            setImgSrc((currentSrc) => currentSrc === nextAdaptiveSrc ? currentSrc : nextAdaptiveSrc);
        });

        return () => {
            isActive = false;
        };
    }, [adaptiveSrc, imgSrc, previewLoaded, previewSrc, shouldLoad]);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!shouldLoad) return;
        if (imgRef.current?.complete && hasWarmBannerImage(imgSrc)) {
            setLoaded(true);
            setPreviewLoaded(true);
        }
    }, [imgSrc, shouldLoad]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!loaded) return;
        if (displayReadySourceRef.current === imgSrc) return;
        displayReadySourceRef.current = imgSrc;
        onDisplayReady?.();
    }, [imgSrc, loaded, onDisplayReady]);

    useEffect(() => {
        if (!loaded) return;
        if (!adaptiveSrc) return;
        if (imgSrc !== adaptiveSrc) return;
        onFullLoad?.();
    }, [adaptiveSrc, imgSrc, loaded, onFullLoad]);

    const handleError = () => {
        if (rememberedDisplaySrc && imgSrc === rememberedDisplaySrc && previewSrc && previewSrc !== imgSrc) {
            setImgSrc(previewSrc);
            setLoaded(false);
            setError(false);
            return;
        }

        // If it's a Google Drive thumbnail link that failed, try the view link as fallback
        if (imgSrc.includes('drive.google.com/thumbnail')) {
            const idMatch = imgSrc.match(/id=([^&]+)/);
            if (idMatch && idMatch[1]) {
                const newSrc = `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
                setAdaptiveSrc(newSrc);
                setPreviewSrc(newSrc);
                setImgSrc(newSrc);
                // We are trying a new source, so we are "loading" again
                setLoaded(false);
                return;
            }
        }
        setError(true);
        setLoaded(true); // Stop loading state even on error
    };

    if (error) return null;
    if (!shouldLoad) {
        return null;
    }

    const shouldUseResponsiveSourceSet = Boolean(
        loaded
        && adaptiveSrc
        && imgSrc === adaptiveSrc
        && responsiveSrcSet
    );

    return (
        <>
            {/* Skeleton Loader - Visible while image is loading */}
            {!loaded && (
                <div
                    className="banner-shimmer-surface"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 0
                    }}
                />
            )}
            <img
                ref={imgRef}
                src={imgSrc}
                alt={alt}
                className={className}
                style={{
                    ...style,
                    opacity: loaded ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out',
                    zIndex: 1
                }}
                onLoad={() => {
                    markBannerImageLoaded(imgSrc);
                    rememberBannerDisplaySource(source, imgSrc);
                    setPreviewLoaded(true);
                    setLoaded(true);
                }}
                onError={handleError}
                referrerPolicy="no-referrer"
                decoding={priority ? 'sync' : 'async'}
                draggable={false}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : "auto"}
                srcSet={shouldUseResponsiveSourceSet ? responsiveSrcSet : undefined}
                sizes={shouldUseResponsiveSourceSet ? getBannerResponsiveSizes(source) : undefined}
            />
        </>
    );
};

function BannerCarousel({ banners, isLoading = false, onPrimaryBannerReady }: InternalBannerCarouselProps) {
    const activeBanners = useMemo(
        () => banners.filter(b => b.isActive).sort((a, b) => a.priority - b.priority),
        [banners]
    );
    const [currentIndex, setCurrentIndex] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(true);
    const [isPageVisible, setIsPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');

    // Swipe State
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState(0);
    const [activatedIndexes, setActivatedIndexes] = useState<Set<number>>(() => new Set([0]));
    const [fullyReadyIndexes, setFullyReadyIndexes] = useState<Set<number>>(() => new Set());
    const [pendingAutoAdvanceIndex, setPendingAutoAdvanceIndex] = useState<number | null>(null);
    const pendingAutoAdvanceIndexRef = useRef<number | null>(null);

    // Minimum swipe distance to trigger slide change
    const minSwipeDistance = 50;

    const requestIndexTransition = (index: number) => {
        const nextBanner = activeBanners[index];
        if (!nextBanner?.imageUrl) {
            return;
        }

        prepareBannerIndex(index, true);

        const { fullSource } = getBannerWarmSources(nextBanner, { priority: true });
        if (hasWarmBannerImage(fullSource) || fullyReadyIndexes.has(index)) {
            setCurrentIndex(index);
            setPendingAutoAdvanceIndex(null);
            return;
        }

        setPendingAutoAdvanceIndex(index);
    };

    const markIndexActivated = (index: number) => {
        setActivatedIndexes((currentIndexes) => {
            if (currentIndexes.has(index)) {
                return currentIndexes;
            }

            const nextIndexes = new Set(currentIndexes);
            nextIndexes.add(index);
            return nextIndexes;
        });
    };

    const markIndexReady = (index: number) => {
        setFullyReadyIndexes((currentIndexes) => {
            if (currentIndexes.has(index)) {
                return currentIndexes;
            }

            const nextIndexes = new Set(currentIndexes);
            nextIndexes.add(index);
            return nextIndexes;
        });

        if (pendingAutoAdvanceIndexRef.current === index) {
            setCurrentIndex(index);
            setPendingAutoAdvanceIndex(null);
        }
    };

    const prepareBannerIndex = (index: number, priority = false, previewOnly = false) => {
        const banner = activeBanners[index];
        if (!banner?.imageUrl) return;

        markIndexActivated(index);

        const { fullSource } = getBannerWarmSources(banner, { priority });
        if (!previewOnly && hasWarmBannerImage(fullSource)) {
            markIndexReady(index);
        }

        void warmBannerSource(banner, {
            priority,
            eagerFull: priority,
            previewOnly
        }).then(() => {
            if (!previewOnly) {
                markIndexReady(index);
            }
        });
    };

    // Auto-play
    useEffect(() => {
        if (typeof document === 'undefined') return;

        const handleVisibilityChange = () => {
            setIsPageVisible(document.visibilityState === 'visible');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        if (!containerRef.current || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(([entry]) => {
            setIsVisible(entry.isIntersecting);
        }, { rootMargin: '160px 0px' });

        observer.observe(containerRef.current);
        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        pendingAutoAdvanceIndexRef.current = pendingAutoAdvanceIndex;
    }, [pendingAutoAdvanceIndex]);

    useEffect(() => {
        if (activeBanners.length <= 1 || isDragging || !isVisible || !isPageVisible || pendingAutoAdvanceIndex !== null) return;

        const startInterval = () => {
            intervalRef.current = setInterval(() => {
                const nextIndex = (currentIndex + 1) % activeBanners.length;
                requestIndexTransition(nextIndex);
            }, 5000); // 5 seconds
        };

        startInterval();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [activeBanners, currentIndex, fullyReadyIndexes, isDragging, isPageVisible, isVisible, pendingAutoAdvanceIndex]);

    useEffect(() => {
        if (activeBanners.length === 0 || !isVisible) return;
        prepareBannerIndex(currentIndex, true);
    }, [activeBanners, currentIndex, isVisible]);

    useEffect(() => {
        if (activeBanners.length <= 1 || !isVisible || !isPageVisible) return;

        const nextIndex = (currentIndex + 1) % activeBanners.length;
        const nextBanner = activeBanners[nextIndex];
        if (!nextBanner?.imageUrl) return;

        const warmNextBannerTimer = window.setTimeout(() => {
            prepareBannerIndex(nextIndex, false, true);
        }, 900);

        return () => {
            window.clearTimeout(warmNextBannerTimer);
        };
    }, [activeBanners, currentIndex, isPageVisible, isVisible]);

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchStart(e.targetTouches[0].clientX);
        setTouchEnd(null);
        setIsDragging(true);
        setDragOffset(0);

        // Pause auto-play immediately on touch
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (touchStart === null) return;

        const currentTouch = e.targetTouches[0].clientX;
        setTouchEnd(currentTouch);

        // Calculate raw offset
        const diff = currentTouch - touchStart;
        setDragOffset(diff);
    };

    const onTouchEnd = () => {
        setIsDragging(false);
        if (!touchStart || !touchEnd) {
            // If just a tap, reset
            setDragOffset(0);
            return;
        }

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            // Next slide
            const nextIndex = (currentIndex + 1) % activeBanners.length;
            requestIndexTransition(nextIndex);
        } else if (isRightSwipe) {
            // Prev slide
            const previousIndex = (currentIndex - 1 + activeBanners.length) % activeBanners.length;
            requestIndexTransition(previousIndex);
        }

        // Reset drag offset - CSS transition will handle the snap
        setDragOffset(0);
        setTouchStart(null);
        setTouchEnd(null);
    };

    if (isLoading && activeBanners.length === 0) {
        return (
            <div
                className="banner-carousel-container"
                style={{
                    width: '100%',
                    marginBottom: '24px',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    position: 'relative',
                    aspectRatio: '16/9',
                    maxHeight: '300px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    background: '#1f2937'
                }}
            >
                <div
                    className="banner-shimmer-surface"
                    style={{
                        position: 'absolute',
                        inset: 0
                    }}
                />
            </div>
        );
    }

    if (activeBanners.length === 0) return null;

    return (
        <div
            ref={containerRef}
            className="banner-carousel-container"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
                width: '100%',
                marginBottom: '24px',
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                aspectRatio: '16/9',
                maxHeight: '300px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                background: '#1f2937', // Fallback background
                touchAction: 'pan-y', // Allow vertical scroll but reserve horizontal for custom swipe
                userSelect: 'none',   // Prevent text selection while dragging
                WebkitUserSelect: 'none'
            }}
        >
            {/* Slides Track */}
            <div style={{
                display: 'flex',
                // Using calc to combine the index offset with the manual drag offset
                transform: `translateX(calc(-${currentIndex * 100}% + ${dragOffset}px))`,
                // disable transition while dragging for instant feedback, enable it on release for smooth snap
                transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
                height: '100%',
                width: '100%'
            }}>
                {activeBanners.map((banner, index) => {
                    // Check if title should be shown (ignore legacy default "Announcement")
                    const showTitle = banner.title &&
                        banner.title.trim() !== '' &&
                        banner.title !== 'Announcement';

                    const showMessage = banner.message && banner.message.trim() !== '';

                    return (
                        <a
                            key={banner.id}
                            href={banner.linkUrl || '#'}
                            target={banner.linkUrl ? "_blank" : "_self"}
                            rel="noopener noreferrer"
                            style={{
                                minWidth: '100%',
                                height: '100%',
                                position: 'relative',
                                textDecoration: 'none',
                                display: 'block',
                                pointerEvents: banner.linkUrl ? 'auto' : 'none',
                                backgroundColor: '#1f2937'
                            }}
                        >
                            <SmartImage
                                source={banner}
                                alt={showTitle ? banner.title : 'Banner'}
                                priority={index === currentIndex}
                                shouldLoad={activatedIndexes.has(index) || index === currentIndex}
                                onDisplayReady={index === 0 ? onPrimaryBannerReady : undefined}
                                onFullLoad={() => markIndexReady(index)}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block'
                                }}
                            />

                            {/* Gradient Overlay for Text */}
                            {(showTitle || showMessage) && (
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0) 100%)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'flex-end',
                                    padding: '20px'
                                }}>
                                    {showTitle && (
                                        <h3 style={{
                                            margin: 0,
                                            color: 'white',
                                            fontSize: 'clamp(18px, 4vw, 24px)',
                                            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                                        }}>
                                            {banner.title}
                                        </h3>
                                    )}
                                    {showMessage && (
                                        <p style={{
                                            margin: '4px 0 0 0',
                                            color: 'rgba(255,255,255,0.9)',
                                            fontSize: '14px'
                                        }}>
                                            {banner.message}
                                        </p>
                                    )}
                                </div>
                            )}
                        </a>
                    );
                })}
            </div>

            {/* Pagination Dots */}
            {activeBanners.length > 1 && (
                <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '12px',
                    display: 'flex',
                    gap: '6px',
                    zIndex: 10
                }}>
                {activeBanners.map((_, idx) => (
                        <div
                            key={idx}
                            onClick={() => {
                                requestIndexTransition(idx);
                                if (intervalRef.current) clearInterval(intervalRef.current);
                            }}
                            style={{
                                width: idx === currentIndex ? '16px' : '6px',
                                height: '6px',
                                borderRadius: '3px',
                                background: idx === currentIndex ? 'white' : 'rgba(255,255,255,0.5)',
                                transition: 'all 0.3s',
                                cursor: 'pointer'
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default memo(BannerCarousel);
