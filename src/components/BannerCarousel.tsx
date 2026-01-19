import { useState, useEffect, useRef } from 'react';
import type { Banner } from '../types';

interface InternalBannerCarouselProps {
    banners: Banner[];
}

// Helper component to handle image loading and retries
const SmartImage = ({ src, alt, className, style }: { src: string, alt: string, className?: string, style?: any }) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [error, setError] = useState(false);

    useEffect(() => {
        setImgSrc(src);
        setError(false);
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
    };

    if (error) return null; // Hide completely on final error

    return (
        <img
            src={imgSrc}
            alt={alt}
            className={className}
            style={style}
            onError={handleError}
            referrerPolicy="no-referrer"
        />
    );
};

export default function BannerCarousel({ banners }: InternalBannerCarouselProps) {
    // Filter active banners and sort
    const activeBanners = banners.filter(b => b.isActive).sort((a, b) => a.priority - b.priority);
    const [currentIndex, setCurrentIndex] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Auto-play
    useEffect(() => {
        if (activeBanners.length <= 1) return;

        const startInterval = () => {
            intervalRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % activeBanners.length);
            }, 5000); // 5 seconds
        };

        startInterval();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [activeBanners.length]);

    // Touch state for swipe
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    // Minimum swipe distance
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            // Next slide
            setCurrentIndex(prev => (prev + 1) % activeBanners.length);
            if (intervalRef.current) clearInterval(intervalRef.current); // Pause auto-play
        } else if (isRightSwipe) {
            // Prev slide - handle negative modulo
            setCurrentIndex(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
            if (intervalRef.current) clearInterval(intervalRef.current); // Pause auto-play
        }
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
                maxHeight: '300px', // Prevent too tall on desktop
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                background: '#1f2937' // Fallback background
            }}
        >
            {/* Slides */}
            <div style={{
                display: 'flex',
                transform: `translateX(-${currentIndex * 100}%)`,
                transition: 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
                height: '100%'
            }}>
                {activeBanners.map(banner => {
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
