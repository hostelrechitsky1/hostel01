import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Banner } from '../types';
import {
    ensureBannerPreloadLink,
    getAdaptiveBannerSrc,
    getTinyBannerSrc,
    hasWarmBannerImage,
    markBannerImageLoaded,
    preloadBannerImage,
} from '../utils/bannerImages';

interface InternalBannerCarouselProps {
    banners: Banner[];
    isLoading?: boolean;
}

// Helper component to handle image loading and retries
const SmartImage = ({
    src,
    alt,
    className,
    style,
    priority,
    shouldLoad
}: {
    src: string;
    alt: string;
    className?: string;
    style?: any;
    priority?: boolean;
    shouldLoad?: boolean;
}) => {
    const initialAdaptiveSrc = getAdaptiveBannerSrc(src, { priority });
    const initialPreviewSrc = priority ? initialAdaptiveSrc : getTinyBannerSrc(src);
    const [imgSrc, setImgSrc] = useState(initialPreviewSrc);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(() => hasWarmBannerImage(initialPreviewSrc));
    const [previewLoaded, setPreviewLoaded] = useState(() => hasWarmBannerImage(initialPreviewSrc));
    const imgRef = useRef<HTMLImageElement>(null);
    const adaptiveSrcRef = useRef<string | null>(null);
    const previewSrcRef = useRef<string | null>(null);

    useEffect(() => {
        const tinySrc = getTinyBannerSrc(src);
        const optimizedSrc = getAdaptiveBannerSrc(src, { priority });
        const nextPreviewSrc = priority ? optimizedSrc : tinySrc;

        adaptiveSrcRef.current = optimizedSrc;
        previewSrcRef.current = nextPreviewSrc;
        setPreviewLoaded(hasWarmBannerImage(nextPreviewSrc));
        setLoaded(hasWarmBannerImage(nextPreviewSrc));
        setImgSrc(nextPreviewSrc);
        setError(false);

        if (!shouldLoad) {
            return;
        }

        ensureBannerPreloadLink(optimizedSrc);
        void preloadBannerImage(priority ? optimizedSrc : nextPreviewSrc);
    }, [priority, shouldLoad, src]);

    useEffect(() => {
        if (!shouldLoad) return;
        if (!previewLoaded || !adaptiveSrcRef.current || !previewSrcRef.current) return;
        if (previewSrcRef.current === adaptiveSrcRef.current) return;
        if (imgSrc === adaptiveSrcRef.current) return;

        const nextAdaptiveSrc = adaptiveSrcRef.current;
        let isActive = true;

        void preloadBannerImage(nextAdaptiveSrc).then(() => {
            if (!isActive) return;
            setImgSrc((currentSrc) => currentSrc === nextAdaptiveSrc ? currentSrc : nextAdaptiveSrc);
        });

        return () => {
            isActive = false;
        };
    }, [imgSrc, previewLoaded, shouldLoad]);

    useEffect(() => {
        if (!shouldLoad) return;
        if (imgRef.current?.complete && hasWarmBannerImage(imgSrc)) {
            setLoaded(true);
            setPreviewLoaded(true);
        }
    }, [imgSrc, shouldLoad]);

    const handleError = () => {
        // If it's a Google Drive thumbnail link that failed, try the view link as fallback
        if (imgSrc.includes('drive.google.com/thumbnail')) {
            const idMatch = imgSrc.match(/id=([^&]+)/);
            if (idMatch && idMatch[1]) {
                const newSrc = `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
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

    return (
        <>
            {/* Skeleton Loader - Visible while image is loading */}
            {!loaded && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, #1f2937 25%, #374151 50%, #1f2937 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                    zIndex: 0
                }} />
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
                    setPreviewLoaded(true);
                    setLoaded(true);
                }}
                onError={handleError}
                referrerPolicy="no-referrer"
                decoding={priority ? 'sync' : 'async'}
                draggable={false}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : "auto"}
            />
            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </>
    );
};

function BannerCarousel({ banners, isLoading = false }: InternalBannerCarouselProps) {
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

    // Minimum swipe distance to trigger slide change
    const minSwipeDistance = 50;

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
        if (activeBanners.length <= 1 || isDragging || !isVisible || !isPageVisible) return;

        const startInterval = () => {
            intervalRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % activeBanners.length);
            }, 5000); // 5 seconds
        };

        startInterval();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [activeBanners.length, isDragging, isPageVisible, isVisible]);

    useEffect(() => {
        if (activeBanners.length === 0 || !isVisible) return;

        setActivatedIndexes((currentIndexes) => {
            if (currentIndexes.has(currentIndex)) {
                return currentIndexes;
            }

            const nextIndexes = new Set(currentIndexes);
            nextIndexes.add(currentIndex);
            return nextIndexes;
        });

        const banner = activeBanners[currentIndex];
        if (!banner?.imageUrl) return;

        const source = getAdaptiveBannerSrc(banner.imageUrl, { priority: true });
        ensureBannerPreloadLink(source);
        void preloadBannerImage(source);
    }, [activeBanners, currentIndex, isVisible]);

    useEffect(() => {
        if (activeBanners.length <= 1 || !isVisible || !isPageVisible) return;

        const nextIndex = (currentIndex + 1) % activeBanners.length;
        const nextBanner = activeBanners[nextIndex];
        if (!nextBanner?.imageUrl) return;

        const warmNextBannerTimer = window.setTimeout(() => {
            const source = getAdaptiveBannerSrc(nextBanner.imageUrl, { priority: true });
            ensureBannerPreloadLink(source);
            void preloadBannerImage(source);
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
            setCurrentIndex(prev => (prev + 1) % activeBanners.length);
        } else if (isRightSwipe) {
            // Prev slide
            setCurrentIndex(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
        }

        // Reset drag offset - CSS transition will handle the snap
        setDragOffset(0);
        setTouchStart(null);
        setTouchEnd(null);
    };

    if (isLoading) {
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
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, #1f2937 25%, #374151 50%, #1f2937 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite'
                }} />
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}</style>
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
                                src={banner.imageUrl}
                                alt={showTitle ? banner.title : 'Banner'}
                                priority={index === currentIndex}
                                shouldLoad={activatedIndexes.has(index) || index === currentIndex}
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
                                setCurrentIndex(idx);
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
