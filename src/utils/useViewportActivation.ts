import { useCallback, useEffect, useState } from 'react';

interface ViewportActivationOptions {
    rootMargin?: string;
    initiallyActive?: boolean;
    idleTimeout?: number | null;
    threshold?: number | number[];
}

export function useViewportActivation<T extends HTMLElement = HTMLDivElement>({
    rootMargin = '280px 0px',
    initiallyActive = false,
    idleTimeout = null,
    threshold = 0,
}: ViewportActivationOptions = {}) {
    const [node, setNode] = useState<T | null>(null);
    const [isActive, setIsActive] = useState(() => initiallyActive || typeof window === 'undefined');

    const activate = useCallback(() => {
        setIsActive(true);
    }, []);

    const ref = useCallback((value: T | null) => {
        setNode(value);
    }, []);

    useEffect(() => {
        if (isActive) return;
        if (!node) return;

        let observer: IntersectionObserver | null = null;
        let idleCallbackId: number | null = null;
        let idleFallbackTimeoutId: number | null = null;
        let immediateActivationTimeoutId: number | null = null;

        const activateSection = () => {
            setIsActive(true);
        };

        if (typeof IntersectionObserver === 'function') {
            observer = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting) return;
                activateSection();
                observer?.disconnect();
                observer = null;
            }, { rootMargin, threshold });

            observer.observe(node);
        } else {
            immediateActivationTimeoutId = window.setTimeout(activateSection, 0);
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
            if (immediateActivationTimeoutId !== null) {
                window.clearTimeout(immediateActivationTimeoutId);
            }
        };
    }, [idleTimeout, isActive, node, rootMargin, threshold]);

    return {
        ref,
        isActive,
        activate,
    };
}
