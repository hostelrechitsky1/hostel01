import type { Booking } from '../types';
import { SLOT_DURATION_MINUTES, TIME_SLOTS } from '../types';
import { getTimeStringMinutes } from './time';

export type NeighborSlotKind = 'before' | 'current' | 'after';

export type MachineSlotNeighborCell = {
    kind: NeighborSlotKind;
    startTime: string;
    booking: Booking | null;
};

export type MachineSlotNeighbors = {
    before: MachineSlotNeighborCell | null;
    current: MachineSlotNeighborCell;
    after: MachineSlotNeighborCell | null;
};

/** Indices of TIME_SLOTS for before / current / after around wall-clock "now" on the laundry grid. */
export function getThreeSlotIndicesAroundNow(
    nowMinutes: number,
    timeSlots: readonly string[] = TIME_SLOTS,
    slotDurationMinutes: number = SLOT_DURATION_MINUTES,
): { before: number | null; current: number; after: number | null } {
    const len = timeSlots.length;
    if (len === 0) {
        return { before: null, current: 0, after: null };
    }

    const lastStart = getTimeStringMinutes(timeSlots[len - 1]);
    const lastEnd = lastStart + slotDurationMinutes;

    for (let i = 0; i < len; i++) {
        const start = getTimeStringMinutes(timeSlots[i]);
        const end = start + slotDurationMinutes;
        if (nowMinutes >= start && nowMinutes < end) {
            return {
                before: i > 0 ? i - 1 : null,
                current: i,
                after: i < len - 1 ? i + 1 : null,
            };
        }
    }

    if (nowMinutes < getTimeStringMinutes(timeSlots[0])) {
        return {
            before: null,
            current: 0,
            after: len > 1 ? 1 : null,
        };
    }

    if (nowMinutes >= lastEnd) {
        return {
            before: len > 1 ? len - 2 : null,
            current: len - 1,
            after: null,
        };
    }

    const idx = len - 1;
    return {
        before: idx > 0 ? idx - 1 : null,
        current: idx,
        after: null,
    };
}

function bookingForMachineAndStart(
    bookings: Booking[],
    machineId: string,
    startTime: string,
): Booking | null {
    const match = bookings.find((b) => b.machineId === machineId && b.startTime === startTime);
    return match ?? null;
}

function cell(
    kind: NeighborSlotKind,
    startTime: string,
    booking: Booking | null,
): MachineSlotNeighborCell {
    return { kind, startTime, booking };
}

/** Before / current / after slots for one machine on a single calendar day (matches Dashboard "in use" window for current index). */
export function getMachineSlotNeighbors(params: {
    bookingsForDate: Booking[];
    machineId: string;
    nowMinutes: number;
    timeSlots?: readonly string[];
    slotDurationMinutes?: number;
}): MachineSlotNeighbors {
    const { bookingsForDate, machineId, nowMinutes } = params;
    const timeSlots = params.timeSlots ?? TIME_SLOTS;
    const slotDurationMinutes = params.slotDurationMinutes ?? SLOT_DURATION_MINUTES;

    const { before, current, after } = getThreeSlotIndicesAroundNow(nowMinutes, timeSlots, slotDurationMinutes);
    const currentTime = timeSlots[current];

    const beforeCell = before === null
        ? null
        : cell('before', timeSlots[before], bookingForMachineAndStart(bookingsForDate, machineId, timeSlots[before]));

    const afterCell = after === null
        ? null
        : cell('after', timeSlots[after], bookingForMachineAndStart(bookingsForDate, machineId, timeSlots[after]));

    return {
        before: beforeCell,
        current: cell('current', currentTime, bookingForMachineAndStart(bookingsForDate, machineId, currentTime)),
        after: afterCell,
    };
}
