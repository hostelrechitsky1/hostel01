import { useState, useEffect, useRef } from 'react';
import type { Banner } from '../types';

interface InternalBannerCarouselProps {
    banners: Banner[];
}

export default function BannerCarousel({ banners }: InternalBannerCarouselProps) {
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

    if (activeBanners.length === 0) return null;

    return (
        <div className="banner-carousel-container" style={{
            width: '100%',
            marginBottom: '24px',
            borderRadius: '16px',
            overflow: 'hidden',
            position: 'relative',
            aspectRatio: '16/9',
            maxHeight: '300px', // Prevent too tall on desktop
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
            {/* Slides */}
            <div style={{
                display: 'flex',
                transform: `translateX(-${currentIndex * 100}%)`,
                transition: 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
                height: '100%'
            }}>
                {activeBanners.map(banner => (
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
                            pointerEvents: banner.linkUrl ? 'auto' : 'none'
                        }}
                    >
                        {/* Background Image */}
                        <div style={{
                            width: '100%',
                            height: '100%',
                            backgroundImage: `url(${banner.imageUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }} />

                        {/* Gradient Overlay for Text */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0) 100%)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            padding: '20px'
                        }}>
                            <h3 style={{
                                margin: 0,
                                color: 'white',
                                fontSize: 'clamp(18px, 4vw, 24px)',
                                textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                            }}>
                                {banner.title}
                            </h3>
                            {banner.message && (
                                <p style={{
                                    margin: '4px 0 0 0',
                                    color: 'rgba(255,255,255,0.9)',
                                    fontSize: '14px'
                                }}>
                                    {banner.message}
                                </p>
                            )}
                        </div>
                    </a>
                ))}
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
                                // Reset timer
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
