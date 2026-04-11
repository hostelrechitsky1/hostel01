import { useCallback, useEffect, useState } from 'react';

interface ViewportActivationOptions {
    rootMargin?: string;
    initiallyActive?: boolean;
    idleTimeout?: number | null;
}

export function useViewportActivation<T extends HTMLElement = HTMLDivElement>({
    rootMargin = '280px 0px',
    initiallyActive = false,
    idleTimeout = null,
}: ViewportActivationOptions = {}) {
    const [node, setNode] = useState<T | null>(null);
    const [isActive, setIsActive] = useState(initiallyActive);

    const activate = useCallback(() => {
        setIsActive(true);
    }, []);

    const ref = useCallback((value: T | null) => {
        setNode(value);
    }, []);

    useEffect(() => {
        if (isActive) return;
        if (typeof window === 'undefined') {
            setIsActive(true);
            return;
        }
        if (!node) return;

        let observer: IntersectionObserver | null = null;
        let idleCallbackId: number | null = null;
        let idleFallbackTimeoutId: number | null = null;

        const activateSection = () => {
            setIsActive(true);
        };

        if (typeof IntersectionObserver === 'function') {
            observer = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting) return;
                activateSection();
                observer?.disconnect();
                observer = null;
            }, { rootMargin });

            observer.observe(node);
        } else {
            activateSection();
        }

        if (idleTimeout !== null) {
            const idleWindow = window as Window & typeof globalThis & {
                requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                cancelIdleCallback?: (handle: number) => void;
            };

            if (typeof idleWindow.requestIdleCallback === 'function') {
                idleCallbackId = idleWindow.requestIdleCallback(activateSection, { timeout: idleTimeout });
            } else {
                idleFallbackTimeoutId = window.setTimeout(activateSection, idleTimeout);
            }
        }

        return () => {
            observer?.disconnect();
            if (idleCallbackId !== null) {
                const idleWindow = window as Window & typeof globalThis & {
                    cancelIdleCallback?: (handle: number) => void;
                };
                idleWindow.cancelIdleCallback?.(idleCallbackId);
            }
            if (idleFallbackTimeoutId !== null) {
                window.clearTimeout(idleFallbackTimeoutId);
            }
        };
    }, [idleTimeout, isActive, node, rootMargin]);

    return {
        ref,
        isActive,
        activate,
    };
}
