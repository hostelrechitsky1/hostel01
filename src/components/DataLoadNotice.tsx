import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

type DataLoadNoticeProps = {
    title: string;
    description: string;
    onRetry?: () => void;
    retryLabel?: string;
    compact?: boolean;
    tone?: 'warning' | 'error';
};

export function DataLoadNotice({
    title,
    description,
    onRetry,
    retryLabel = 'Try Again',
    compact = false,
    tone = 'warning'
}: DataLoadNoticeProps) {
    const isError = tone === 'error';
    const Icon = isError ? AlertTriangle : WifiOff;

    return (
        <div
            className="glass-panel"
            style={{
                padding: compact ? '16px 18px' : '28px',
                borderRadius: compact ? '18px' : '24px',
                border: isError ? '1px solid rgba(239, 68, 68, 0.28)' : '1px solid rgba(245, 158, 11, 0.24)',
                background: isError
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.03) 100%)'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.03) 100%)',
                display: 'flex',
                alignItems: compact ? 'center' : 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
            }}
        >
            <div style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: '14px', flex: '1 1 260px' }}>
                <div
                    style={{
                        width: compact ? '42px' : '48px',
                        height: compact ? '42px' : '48px',
                        borderRadius: compact ? '14px' : '16px',
                        background: isError ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}
                >
                    <Icon size={compact ? 20 : 22} color={isError ? '#f87171' : '#f59e0b'} />
                </div>

                <div>
                    <h3 style={{ margin: 0, fontSize: compact ? '15px' : '20px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {title}
                    </h3>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: compact ? '13px' : '15px', lineHeight: 1.5 }}>
                        {description}
                    </p>
                </div>
            </div>

            {onRetry && (
                <button
                    onClick={onRetry}
                    className="primary-button"
                    style={{
                        padding: compact ? '10px 16px' : '12px 18px',
                        borderRadius: compact ? '12px' : '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        justifyContent: 'center',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <RefreshCw size={compact ? 16 : 18} />
                    {retryLabel}
                </button>
            )}
        </div>
    );
}
