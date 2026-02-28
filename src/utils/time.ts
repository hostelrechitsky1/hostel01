const BELARUS_UTC_OFFSET_HOURS = 3;
const BELARUS_TIME_ZONE = 'Europe/Minsk';

export const getBelarusNow = (now: Date = new Date()) => {
    return new Date(now.getTime() + BELARUS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
};

export const getBelarusDate = (now: Date = new Date()) => {
    const belarusNow = getBelarusNow(now);
    return new Date(Date.UTC(belarusNow.getUTCFullYear(), belarusNow.getUTCMonth(), belarusNow.getUTCDate()));
};

export const addBelarusDays = (date: Date, days: number) => {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
};

export const getBelarusWeekday = (date: Date) => {
    return date.getUTCDay();
};

export const formatBelarusDate = (date: Date) => {
    return date.toISOString().slice(0, 10);
};

export const isSameBelarusDay = (left: Date, right: Date) => {
    return formatBelarusDate(left) === formatBelarusDate(right);
};

export const getBelarusWeekStart = (date: Date) => {
    const weekday = getBelarusWeekday(date);
    const diffToMonday = weekday === 0 ? 6 : weekday - 1;
    return addBelarusDays(date, -diffToMonday);
};

export const getBelarusWeekEnd = (date: Date) => {
    return addBelarusDays(getBelarusWeekStart(date), 6);
};

export const formatBelarusWeekdayLabel = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { timeZone: BELARUS_TIME_ZONE, weekday: 'long' }).format(date);
};

export const formatBelarusMonthDayLabel = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { timeZone: BELARUS_TIME_ZONE, month: 'short', day: 'numeric' }).format(date);
};

export const formatBelarusMonthDayYearLabel = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { timeZone: BELARUS_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

export const getBelarusWeekId = (date: Date) => {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${weekNumber}`;
};

export const isAutoBookingWindowOpen = (now: Date = new Date()) => {
    const belarusNow = getBelarusNow(now);
    const day = belarusNow.getUTCDay();
    const hour = belarusNow.getUTCHours();

    if (day === 6 && hour >= 16) return true;
    if (day === 0 && hour < 20) return true;
    return false;
};

export const getNextSaturday1600 = (now: Date = new Date()) => {
    const belarusNow = getBelarusNow(now);
    const currentDay = belarusNow.getUTCDay();
    const currentHour = belarusNow.getUTCHours();
    let daysUntilSaturday = 6 - currentDay;

    // If it's Saturday past 16:00 or Sunday, next opening is *next* Saturday
    if (currentDay === 6 && currentHour >= 16) daysUntilSaturday += 7;
    if (currentDay === 0) daysUntilSaturday = 6;

    const nextSatBelarusTime = new Date(belarusNow.getTime());
    nextSatBelarusTime.setUTCDate(belarusNow.getUTCDate() + daysUntilSaturday);
    nextSatBelarusTime.setUTCHours(16, 0, 0, 0);

    return new Date(nextSatBelarusTime.getTime() - (BELARUS_UTC_OFFSET_HOURS * 60 * 60 * 1000));
};
