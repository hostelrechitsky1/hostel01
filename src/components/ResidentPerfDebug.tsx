import { useEffect, useMemo, useReducer, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { getResidentPerfMetrics, setResidentPerfDebug, shouldShowResidentPerfDebug } from '../utils/performance';

const formatMetricLabel = (name: string) => {
    return name
        .replace(/^resident:/, '')
        .replace(/^browser:/, '')
        .replace(/-/g, ' ')
        .replace(/_/g, ' ');
};

export function ResidentPerfDebug() {
    const location = useLocation();
    const [dismissed, setDismissed] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [metricsVersion, refreshMetrics] = useReducer((current) => current + 1, 0);
    const enabled = useMemo(
        () => shouldShowResidentPerfDebug() && !dismissed,
        [dismissed, location.search]
    );
    const metrics = useMemo(
        () => getResidentPerfMetrics(),
        [location.search, metricsVersion]
    );

    useEffect(() => {
        if (!enabled) return;

        const handleMetric = () => {
            refreshMetrics();
        };

        window.addEventListener('hostel:resident-performance', handleMetric as EventListener);
        return () => {
            window.removeEventListener('hostel:resident-performance', handleMetric as EventListener);
        };
    }, [enabled]);

    const latestMetrics = useMemo(() => {
        return [...metrics]
            .filter((metric) => metric.name.startsWith('resident:') || metric.name.startsWith('browser:'))
            .slice(-8)
            .reverse();
    }, [metrics]);

    if (!enabled) {
        return null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                right: '16px',
                bottom: '16px',
                zIndex: 160,
                width: expanded ? 'min(340px, calc(100vw - 24px))' : 'auto'
            }}
        >
            <div
                className="glass-panel"
                style={{
                    padding: expanded ? '14px' : '10px 12px',
                    borderRadius: expanded ? '18px' : '999px',
                    border: '1px solid rgba(129, 140, 248, 0.18)',
                    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.94) 0%, rgba(17, 24, 39, 0.92) 100%)',
                    boxShadow: '0 18px 40px rgba(2, 6, 23, 0.34)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={() => setExpanded((current) => !current)}
                        className="glass-button"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: expanded ? '0' : '0',
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        <span
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '999px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(99, 102, 241, 0.18)',
                                color: '#c4b5fd',
                                flexShrink: 0
                            }}
                        >
                            <Activity size={16} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>Resident Perf</span>
                            {latestMetrics[0] && (
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                                    {formatMetricLabel(latestMetrics[0].name)} {latestMetrics[0].duration}ms
                                </span>
                            )}
                        </span>
                        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>

                    {expanded && (
                        <button
                            type="button"
                            onClick={() => {
                                setResidentPerfDebug(false);
                                setDismissed(true);
                            }}
                            className="glass-button"
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '999px',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            aria-label="Close resident performance debug"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {expanded && (
                    <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                        {latestMetrics.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.64)' }}>
                                No resident performance timings captured yet.
                            </div>
                        ) : (
                            latestMetrics.map((metric) => (
                                <div
                                    key={`${metric.name}-${metric.recordedAt}`}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        borderRadius: '14px',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', color: 'white', fontWeight: 600, textTransform: 'capitalize' }}>
                                            {formatMetricLabel(metric.name)}
                                        </div>
                                        {metric.meta && Object.keys(metric.meta).length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.52)', marginTop: '4px' }}>
                                                {Object.entries(metric.meta).map(([key, value]) => `${key}:${String(value)}`).join(' • ')}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#c4b5fd', flexShrink: 0 }}>
                                        {metric.duration}ms
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
