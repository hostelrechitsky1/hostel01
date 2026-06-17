import {
    DEFAULT_SLOT_DURATION_MINUTES,
    SLOT_DAY_END_TIME,
    SLOT_DAY_START_TIME,
    TIME_SLOTS,
} from '../types';
import type { AppSettings, Booking } from '../types';
import { addMinutesToTimeString, getTimeStringMinutes } from './time';

export const MIN_SLOT_DURATION_MINUTES = 30;
export const MAX_SLOT_DURATION_MINUTES = 240;
export const SLOT_DURATION_STEP_MINUTES = 5;
export const SLOT_DURATION_PRESETS = [45, 60, 75, 90, 120] as const;

export const normalizeSlotDurationMinutes = (
    value: unknown,
    fallback = DEFAULT_SLOT_DURATION_MINUTES
) => {
    const numericValue = typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : value;
    const parsed = Number(numericValue);
    const parsedFallback = Number(fallback);
    const safeFallback = Number.isFinite(parsedFallback)
        ? parsedFallback
        : DEFAULT_SLOT_DURATION_MINUTES;
    const source = Number.isFinite(parsed) ? parsed : safeFallback;
    const rounded = Math.round(source / SLOT_DURATION_STEP_MINUTES) * SLOT_DURATION_STEP_MINUTES;

    return Math.min(MAX_SLOT_DURATION_MINUTES, Math.max(MIN_SLOT_DURATION_MINUTES, rounded));
};

export const getSlotDurationMinutes = (settings?: Partial<AppSettings> | null) => (
    normalizeSlotDurationMinutes(settings?.slotDurationMinutes)
);

export const buildTimeSlots = (
    durationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
    startTime = SLOT_DAY_START_TIME,
    endTime = SLOT_DAY_END_TIME
) => {
    const duration = normalizeSlotDurationMinutes(durationMinutes);
    const startMinutes = getTimeStringMinutes(startTime);
    const endMinutes = getTimeStringMinutes(endTime);

    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
        return [...TIME_SLOTS];
    }

    const slots: string[] = [];
    for (let current = startMinutes; current + duration <= endMinutes; current += duration) {
        const hours = Math.floor(current / 60);
        const minutes = current % 60;
        slots.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    }

    return slots.length > 0 ? slots : [...TIME_SLOTS];
};

export const formatSlotDurationLabel = (durationMinutes: number) => {
    const duration = normalizeSlotDurationMinutes(durationMinutes);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;

    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
};

export const getBookingEndTime = (
    booking: Pick<Booking, 'startTime' | 'endTime'>,
    fallbackDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES
) => {
    const startMinutes = getTimeStringMinutes(booking.startTime);
    const endMinutes = booking.endTime ? getTimeStringMinutes(booking.endTime) : NaN;

    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
        return booking.endTime;
    }

    return addMinutesToTimeString(booking.startTime, normalizeSlotDurationMinutes(fallbackDurationMinutes));
};

export const getBookingDurationMinutes = (
    booking: Pick<Booking, 'startTime' | 'endTime'>,
    fallbackDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES
) => {
    const startMinutes = getTimeStringMinutes(booking.startTime);
    const endMinutes = getTimeStringMinutes(getBookingEndTime(booking, fallbackDurationMinutes));

    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
        return endMinutes - startMinutes;
    }

    return normalizeSlotDurationMinutes(fallbackDurationMinutes);
};
