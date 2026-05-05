import { Activity } from 'lucide-react';
import { DataLoadNotice } from './DataLoadNotice';
import { useSlowLoadFlag } from '../utils/useSlowLoadFlag';

export function RouteFallback() {
    const showLoadHelp = useSlowLoadFlag(true, 3500);

    return (
        <div className="container animate-fade-in flex-center" style={{ minHeight: '100vh', padding: '24px' }}>
            <div
                className="glass-panel scroll-loading-shell"
                style={{
                    width: '100%',
                    maxWidth: '420px',
                    padding: '28px',
                    borderRadius: '24px',
                    textAlign: 'center',
                }}
            >
                <div
                    style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '20px',
                        margin: '0 auto 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--success)',
                        background: 'rgba(16, 185, 129, 0.14)',
                        border: '1px solid rgba(16, 185, 129, 0.22)',
                    }}
                >
                    <Activity size={30} />
                </div>
                <h2 style={{ margin: 0, fontSize: '22px', lineHeight: 1.15 }}>Opening hostel booking</h2>
                <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Preparing the latest slots and dashboard data.
                </p>
            </div>
            {showLoadHelp && (
                <div style={{ width: '100%', maxWidth: '520px', marginTop: '20px' }}>
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
