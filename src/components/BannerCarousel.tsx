import { useState, useEffect, useRef } from 'react';
import type { Banner } from '../types';

interface InternalBannerCarouselProps {
    banners: Banner[];
}

// Helper component to handle image loading and retries
const SmartImage = ({ src, alt, className, style, priority }: { src: string, alt: string, className?: string, style?: any, priority?: boolean }) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        // Adaptive sizing for Google Drive images
        let optimizedSrc = src;
        const isMobile = window.innerWidth < 768;

        if (src.includes('drive.google.com/thumbnail') && src.includes('sz=w1920') && isMobile) {
            // Downscale to w800 for mobile devices to save bandwidth/load faster
            optimizedSrc = src.replace('sz=w1920', 'sz=w800');
        }

        setImgSrc(optimizedSrc);
        setError(false);
        setLoaded(false);
    }, [src]);

    const handleError = () => {
        // If it's a Google Drive thumbnail link that failed, try the view link as fallback
        if (imgSrc.includes('drive.google.com/thumbnail')) {
            const idMatch = imgSrc.match(/id=([^&]+)/);
            if (idMatch && idMatch[1]) {
                setImgSrc(`https://drive.google.com/uc?export=view&id=${idMatch[1]}`);
                return;
            }
        }
        setError(true);
        setLoaded(true); // Stop loading state even on error
    };

    if (error) return null;

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
                src={imgSrc}
                alt={alt}
                className={className}
                style={{
                    ...style,
                    opacity: loaded ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out',
                    zIndex: 1
                }}
                onLoad={() => setLoaded(true)}
                onError={handleError}
                referrerPolicy="no-referrer"
                loading={priority ? "eager" : "lazy"}
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

export default function BannerCarousel({ banners }: InternalBannerCarouselProps) {
    // Filter    // activeBanners filtering is redundant if done inside the component, but good to keep clean
    const activeBanners = banners.filter(b => b.isActive).sort((a, b) => a.priority - b.priority);
    const [currentIndex, setCurrentIndex] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Swipe State
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState(0);

    // Minimum swipe distance to trigger slide change
    const minSwipeDistance = 50;

    // Auto-play
    useEffect(() => {
        if (activeBanners.length <= 1 || isDragging) return;

        const startInterval = () => {
            intervalRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % activeBanners.length);
            }, 5000); // 5 seconds
        };

        startInterval();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [activeBanners.length, isDragging]);

    // Preload ALL active images logic
    useEffect(() => {
        if (activeBanners.length > 0) {
            activeBanners.forEach(banner => {
                if (banner.imageUrl) {
                    const img = new Image();
                    // Apply same mobile optimization to preload url
                    let src = banner.imageUrl;
                    if (window.innerWidth < 768 && src.includes('drive.google.com/thumbnail') && src.includes('sz=w1920')) {
                        src = src.replace('sz=w1920', 'sz=w800');
                    }
                    img.src = src;
                }
            });
        }
    }, [activeBanners]);

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

    if (activeBanners.length === 0) return null;

    return (
        <div
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
                                priority={index === currentIndex} // Prioritize loading visible slide
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
