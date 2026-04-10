export function RouteFallback() {
    return (
        <div className="container animate-fade-in" style={{ minHeight: '100vh', padding: '24px' }}>
            <div style={{ height: '32px', width: '220px', borderRadius: '10px', background: 'var(--glass-border)', marginBottom: '12px' }} className="skeleton-pulse"></div>
            <div style={{ height: '18px', width: '140px', borderRadius: '10px', background: 'var(--glass-border)', marginBottom: '28px' }} className="skeleton-pulse"></div>
            <div style={{ height: '160px', width: '100%', borderRadius: '24px', background: 'var(--glass-border)', marginBottom: '20px' }} className="skeleton-pulse"></div>
            <div className="grid-cols-2">
                {[1, 2, 3, 4].map((card) => (
                    <div
                        key={card}
                        style={{ height: '128px', width: '100%', borderRadius: '18px', background: 'var(--glass-border)' }}
                        className="skeleton-pulse"
                    ></div>
                ))}
            </div>
        </div>
    );
}
