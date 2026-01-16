
import { format, addDays, startOfToday, isSameDay, getWeek, endOfWeek, isAfter } from 'date-fns';

const runTest = () => {
    // Mock Settings
    const settings = { forceShowNextWeek: true, forceCloseBookings: false };

    // Logic from BookingFlow.tsx
    // Check if bookings are open
    let isNextWeekOpen = false;
    if (settings.forceShowNextWeek) {
        isNextWeekOpen = true;
    } else {
        const now = new Date();
        const day = now.getDay();
        const belarusHour = now.getUTCHours() + 3;

        // Auto Open Logic: Sat 16:00 -> Mon 09:00
        if (day === 6 && belarusHour >= 16) isNextWeekOpen = true;
        if (day === 0) isNextWeekOpen = true;
        if (day === 1 && belarusHour < 9) isNextWeekOpen = true;
    }

    console.log('isNextWeekOpen:', isNextWeekOpen);

    // Generate date options
    let start = startOfToday();
    // Simulate Friday Jan 16th if needed, but let's see what *actual* system time does first.
    // To strictly simulate the user's "Friday", we rely on the system time being correct (as noted in metadata).

    console.log('Start of Today (System):', start.toString());

    const currentWeekEnd = endOfWeek(start, { weekStartsOn: 1 }); // 1 = Monday start, so Sunday end
    console.log('Current Week End:', currentWeekEnd.toString());

    let maxDate = currentWeekEnd;

    if (isNextWeekOpen) {
        // Start from Next Monday
        const nextMonday = addDays(currentWeekEnd, 1);
        console.log('Next Monday:', nextMonday.toString());

        // If today is actually BEFORE next Monday (e.g. Sat/Sun), jump to next Monday
        // Note: isAfter(date, comparison) -> true if date > comparison
        // !isAfter(start, currentWeekEnd) -> start <= currentWeekEnd
        if (!isAfter(start, currentWeekEnd)) {
            start = nextMonday;
            console.log('Jumped start to Next Monday');
        } else {
            console.log('Start is AFTER current week end?');
        }

        // End at Next Sunday
        maxDate = addDays(currentWeekEnd, 7);
        console.log('Max Date:', maxDate.toString());
    }

    // Generate dates
    const dates = [];
    let current = start;
    while (!isAfter(current, maxDate)) {
        dates.push(current);
        current = addDays(current, 1);
    }

    console.log('Generated Dates:', dates.map(d => format(d, 'yyyy-MM-dd')));
    console.log('Total Dates:', dates.length);
}

runTest();
