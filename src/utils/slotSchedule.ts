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

const roundToSlotStep = (minutes: number) => (
    Math.round(minutes / SLOT_DURATION_STEP_MINUTES) * SLOT_DURATION_STEP_MINUTES
);

export const normalizeSlotDurationMinutes = (
    value: unknown,
    fallback = DEFAULT_SLOT_DURATION_MINUTES
) => {
    const numericValue = typeof value === 'string' ? Number(value) : value;
    const minutes = typeof numericValue === 'number' && Number.isFinite(numericValue)
        ? numericValue
        : fallback;
    const rounded = roundToSlotStep(minutes);

    return Math.min(Math.max(rounded, MIN_SLOT_DURATION_MINUTES), MAX_SLOT_DURATION_MINUTES);
};

export const getSlotDurationMinutes = (settings?: Partial<AppSettings> | null) => (
    normalizeSlotDurationMinutes(settings?.slotDurationMinutes)
);

export const buildTimeSlots = (
    slotDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
    startTime = SLOT_DAY_START_TIME,
    endTime = SLOT_DAY_END_TIME
) => {
    const duration = normalizeSlotDurationMinutes(slotDurationMinutes);
    const startMinutes = getTimeStringMinutes(startTime);
    const endMinutes = getTimeStringMinutes(endTime);

    if (endMinutes <= startMinutes || duration <= 0) {
        return [...TIME_SLOTS];
    }

    const slots: string[] = [];
    for (let minutes = startMinutes; minutes + duration <= endMinutes; minutes += duration) {
        const hours = Math.floor(minutes / 60);
        const minute = minutes % 60;
        slots.push(`${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }

    return slots.length > 0 ? slots : [...TIME_SLOTS];
};

export const formatSlotDurationLabel = (minutesInput: number) => {
    const minutes = normalizeSlotDurationMinutes(minutesInput);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours > 0 && remainder > 0) {
        return `${hours}h ${remainder}m`;
    }

    if (hours > 0) {
        return `${hours}h`;
    }

    return `${minutes}m`;
};

export const getBookingEndTime = (booking: Booking, fallbackDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES) => {
    const startMinutes = getTimeStringMinutes(booking.startTime);
    const endMinutes = booking.endTime ? getTimeStringMinutes(booking.endTime) : NaN;

    if (Number.isFinite(endMinutes) && endMinutes > startMinutes) {
        return booking.endTime;
    }

    return addMinutesToTimeString(booking.startTime, normalizeSlotDurationMinutes(fallbackDurationMinutes));
};

export const getBookingDurationMinutes = (
    booking: Booking,
    fallbackDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES
) => {
    const startMinutes = getTimeStringMinutes(booking.startTime);
    const endMinutes = getTimeStringMinutes(getBookingEndTime(booking, fallbackDurationMinutes));
    return Math.max(endMinutes - startMinutes, normalizeSlotDurationMinutes(fallbackDurationMinutes));
};
