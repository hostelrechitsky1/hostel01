import type { Booking, Machine } from '../types';
import { buildTimeSlots, getBookingEndTime, normalizeSlotDurationMinutes } from './slotSchedule';
import { formatBelarusDate, getBelarusDate, getBelarusNow, getBelarusWeekday, getTimeStringMinutes } from './time';

export type MachineOperatingState = 'available' | 'occupied' | 'maintenance' | 'closed';

interface MachineOperatingStatusInput {
    machine: Machine;
    bookings: Booking[];
    maintenanceDay: number;
    slotDurationMinutes?: number;
    timeSlots?: readonly string[];
    now?: Date;
}

export const getMachineOperatingState = ({
    machine,
    bookings,
    maintenanceDay,
    slotDurationMinutes,
    timeSlots,
    now = new Date(),
}: MachineOperatingStatusInput): MachineOperatingState => {
    const durationMinutes = normalizeSlotDurationMinutes(slotDurationMinutes);
    const activeTimeSlots = timeSlots && timeSlots.length > 0
        ? timeSlots
        : buildTimeSlots(durationMinutes);
    const belarusDate = getBelarusDate(now);
    const currentBWeekday = getBelarusWeekday(belarusDate);

    if (currentBWeekday === maintenanceDay || machine.status === 'maintenance') {
        return 'maintenance';
    }

    const belarusNow = getBelarusNow(now);
    const today = formatBelarusDate(belarusDate);
    const nowMinutes = belarusNow.getUTCHours() * 60 + belarusNow.getUTCMinutes();

    const currentBooking = bookings.find((booking) => {
        if (booking.date !== today || booking.machineId !== machine.id) return false;
        const startMinutes = getTimeStringMinutes(booking.startTime);
        const endMinutes = getTimeStringMinutes(getBookingEndTime(booking, durationMinutes));
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    });

    if (currentBooking) {
        return 'occupied';
    }

    const firstSlotStartMinutes = getTimeStringMinutes(activeTimeSlots[0]);
    const lastSlotStartMinutes = getTimeStringMinutes(activeTimeSlots[activeTimeSlots.length - 1]);

    if (nowMinutes < firstSlotStartMinutes || nowMinutes >= lastSlotStartMinutes) {
        return 'closed';
    }

    return 'available';
};
