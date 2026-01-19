type AnnouncementBannerProps = {
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaUrl: string;
    imageUrl?: string;
};

export default function AnnouncementBanner({ title, subtitle, ctaLabel, ctaUrl, imageUrl }: AnnouncementBannerProps) {
    return (
        <div
            className="glass-panel"
            style={{
                padding: '20px 24px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(236, 253, 245, 0.8) 0%, rgba(240, 249, 255, 0.85) 50%, rgba(255, 247, 237, 0.85) 100%)',
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
                overflow: 'hidden'
            }}
        >
            <div style={{ display: 'flex', gap: '16px', transform: 'translateX(0)', transition: 'transform 300ms ease' }}>
                <div
                    style={{
                        minWidth: '100%',
                        display: 'grid',
                        gap: '16px',
                        alignItems: 'center',
                        gridTemplateColumns: imageUrl ? 'auto 1fr auto' : '1fr auto'
                    }}
                >
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt=""
                            style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '16px',
                                objectFit: 'cover',
                                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)'
                            }}
                        />
                    ) : null}
                    <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(15, 23, 42, 0.55)' }}>
                            Announcement
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>{title}</div>
                        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{subtitle}</div>
                    </div>
                    <a
                        href={ctaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="primary-button"
                        style={{
                            padding: '10px 18px',
                            borderRadius: '12px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {ctaLabel}
                    </a>
                </div>
            </div>
        </div>
    );
}
