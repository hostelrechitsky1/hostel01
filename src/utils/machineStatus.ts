import type { Booking, Machine } from '../types';
import { TIME_SLOTS } from '../types';
import { formatBelarusDate, getBelarusDate, getBelarusNow, getBelarusWeekday, getTimeStringMinutes } from './time';

export type MachineOperatingState = 'available' | 'occupied' | 'maintenance' | 'closed';

interface MachineOperatingStatusInput {
    machine: Machine;
    bookings: Booking[];
    maintenanceDay: number;
    now?: Date;
}

export const getMachineOperatingState = ({
    machine,
    bookings,
    maintenanceDay,
    now = new Date(),
}: MachineOperatingStatusInput): MachineOperatingState => {
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
        const endMinutes = startMinutes + 90;
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    });

    if (currentBooking) {
        return 'occupied';
    }

    const firstSlotStartMinutes = getTimeStringMinutes(TIME_SLOTS[0]);
    const lastSlotStartMinutes = getTimeStringMinutes(TIME_SLOTS[TIME_SLOTS.length - 1]);

    if (nowMinutes < firstSlotStartMinutes || nowMinutes >= lastSlotStartMinutes) {
        return 'closed';
    }

    return 'available';
};
