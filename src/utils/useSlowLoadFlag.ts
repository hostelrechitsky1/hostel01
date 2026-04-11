import { useEffect, useRef, useState } from 'react';

export function useSlowLoadFlag(isLoading: boolean, delayMs = 4500) {
    const [slowCycle, setSlowCycle] = useState<number | null>(null);
    const cycleRef = useRef(0);

    useEffect(() => {
        cycleRef.current += 1;
        const cycle = cycleRef.current;
        if (!isLoading) return;

        const timeoutId = window.setTimeout(() => {
            setSlowCycle((current) => current === cycle ? current : cycle);
        }, delayMs);

        return () => window.clearTimeout(timeoutId);
    }, [delayMs, isLoading]);

    /* eslint-disable-next-line react-hooks/refs */
    return isLoading && slowCycle === cycleRef.current;
}
