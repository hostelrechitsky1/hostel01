import { useEffect, useState } from 'react';

export function useSlowLoadFlag(isLoading: boolean, delayMs = 4500) {
    const [isSlow, setIsSlow] = useState(false);

    useEffect(() => {
        if (!isLoading) {
            setIsSlow(false);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setIsSlow(true);
        }, delayMs);

        return () => window.clearTimeout(timeoutId);
    }, [delayMs, isLoading]);

    return isSlow;
}
