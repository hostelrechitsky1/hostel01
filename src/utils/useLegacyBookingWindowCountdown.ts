import { useEffect, useState } from 'react';
import type { AppSettings } from '../types';
import { getNextAutoOpenDate } from './time';

export type LegacyCountdown = { days: number; hours: number; minutes: number; seconds: number };

/**
 * Countdown until the next scheduled auto-open moment (legacy window). Informational only — booking is not gated on this.
 */
export function useLegacyBookingWindowCountdown(settings: AppSettings): LegacyCountdown {
    const [timeLeft, setTimeLeft] = useState<LegacyCountdown>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        if (settings.forceCloseBookings) return;

        const targetTime = getNextAutoOpenDate(new Date(), settings).getTime();

        const tick = () => {
            const difference = targetTime - Date.now();
            if (difference > 0) {
                setTimeLeft({
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60),
                });
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            }
        };

        tick();
        const timer = window.setInterval(tick, 1000);
        return () => window.clearInterval(timer);
    }, [settings]);

    return timeLeft;
}
