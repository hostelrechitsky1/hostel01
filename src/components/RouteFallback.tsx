import { DataLoadNotice } from './DataLoadNotice';
import { useSlowLoadFlag } from '../utils/useSlowLoadFlag';

export function RouteFallback() {
    const showLoadHelp = useSlowLoadFlag(true, 3500);

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
            {showLoadHelp && (
                <div style={{ marginTop: '24px' }}>
                    <DataLoadNotice
                        compact
                        title="Still loading this page"
                        description="The page bundle is taking longer than usual. Reload once if it does not finish."
                        onRetry={() => window.location.reload()}
                        retryLabel="Reload Page"
                    />
                </div>
            )}
        </div>
    );
}
