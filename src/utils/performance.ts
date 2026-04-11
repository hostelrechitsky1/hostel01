type ResidentPerfMeta = Record<string, string | number | boolean | null | undefined>;

type ResidentPerfMetric = {
    name: string;
    duration: number;
    recordedAt: number;
    meta?: Record<string, string | number | boolean | null>;
};

declare global {
    interface Window {
        __HOSTEL_RESIDENT_PERF__?: ResidentPerfMetric[];
    }
}

const ACTIVE_SPANS_KEY = 'hostel-resident-perf:active-spans';
const METRICS_KEY = 'hostel-resident-perf:metrics';
const MAX_METRICS = 40;

let observersStarted = false;

const canUseBrowserPerf = () => (
    typeof window !== 'undefined'
    && typeof window.sessionStorage !== 'undefined'
    && typeof window.performance !== 'undefined'
);

const readJson = <T>(key: string, fallback: T): T => {
    if (!canUseBrowserPerf()) return fallback;

    try {
        const raw = window.sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
};

const writeJson = (key: string, value: unknown) => {
    if (!canUseBrowserPerf()) return;

    try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore quota or serialization issues for non-critical metrics.
    }
};

const sanitizeMeta = (meta?: ResidentPerfMeta) => {
    if (!meta) return undefined;

    const entries = Object.entries(meta).filter(([, value]) => typeof value !== 'undefined');
    if (entries.length === 0) return undefined;

    return Object.fromEntries(entries) as Record<string, string | number | boolean | null>;
};

export const recordResidentPerfMetric = (name: string, duration: number, meta?: ResidentPerfMeta) => {
    if (!canUseBrowserPerf() || !Number.isFinite(duration) || duration < 0) {
        return null;
    }

    const metric: ResidentPerfMetric = {
        name,
        duration: Math.round(duration * 10) / 10,
        recordedAt: Date.now(),
        meta: sanitizeMeta(meta),
    };

    const metrics = [...readJson<ResidentPerfMetric[]>(METRICS_KEY, []), metric].slice(-MAX_METRICS);
    writeJson(METRICS_KEY, metrics);
    window.__HOSTEL_RESIDENT_PERF__ = metrics;

    window.dispatchEvent(new CustomEvent('hostel:resident-performance', {
        detail: metric,
    }));

    if (import.meta.env.DEV) {
        console.info(`[resident-perf] ${metric.name}: ${metric.duration}ms`, metric.meta ?? {});
    }

    return metric;
};

export const getResidentPerfMetrics = () => {
    return readJson<ResidentPerfMetric[]>(METRICS_KEY, []);
};

export const shouldShowResidentPerfDebug = () => {
    if (typeof window === 'undefined') return false;

    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('perf') === '1') {
            window.localStorage.setItem('hostel_perf_debug', '1');
            return true;
        }

        const storedPreference = window.localStorage.getItem('hostel_perf_debug');
        if (storedPreference === '1') {
            return true;
        }

        if (storedPreference === '0') {
            return false;
        }

        return false;
    } catch {
        return false;
    }
};

export const setResidentPerfDebug = (enabled: boolean) => {
    if (typeof window === 'undefined') return;

    try {
        if (enabled) {
            window.localStorage.setItem('hostel_perf_debug', '1');
        } else {
            window.localStorage.setItem('hostel_perf_debug', '0');
        }
    } catch {
        // Ignore debug preference persistence issues.
    }
};

export const startResidentPerfSpan = (name: string) => {
    if (!canUseBrowserPerf()) return;

    const spans = readJson<Record<string, number>>(ACTIVE_SPANS_KEY, {});
    spans[name] = window.performance.now();
    writeJson(ACTIVE_SPANS_KEY, spans);
};

export const finishResidentPerfSpan = (name: string, meta?: ResidentPerfMeta) => {
    if (!canUseBrowserPerf()) {
        return null;
    }

    const spans = readJson<Record<string, number>>(ACTIVE_SPANS_KEY, {});
    const startedAt = spans[name];
    if (typeof startedAt !== 'number') {
        return null;
    }

    delete spans[name];
    writeJson(ACTIVE_SPANS_KEY, spans);

    return recordResidentPerfMetric(name, window.performance.now() - startedAt, meta);
};

export const observeResidentWebPaintMetrics = () => {
    if (observersStarted || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
        return;
    }

    observersStarted = true;

    try {
        const paintObserver = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                if (entry.name === 'first-contentful-paint') {
                    recordResidentPerfMetric('browser:first-contentful-paint', entry.startTime);
                }
            });
        });
        paintObserver.observe({ type: 'paint', buffered: true });
    } catch {
        // Ignore unsupported paint observers.
    }

    try {
        let latestLcp = 0;
        const lcpObserver = new PerformanceObserver((list) => {
            const latestEntry = list.getEntries().at(-1);
            if (latestEntry) {
                latestLcp = latestEntry.startTime;
            }
        });

        const flushLargestContentfulPaint = () => {
            if (latestLcp > 0) {
                recordResidentPerfMetric('browser:largest-contentful-paint', latestLcp);
                latestLcp = 0;
            }
        };

        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        window.addEventListener('pagehide', flushLargestContentfulPaint, { once: true });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushLargestContentfulPaint();
            }
        }, { passive: true });
    } catch {
        // Ignore unsupported LCP observers.
    }
};
