const BELARUS_UTC_OFFSET_HOURS = 3;
const BELARUS_TIME_ZONE = 'Europe/Minsk';

interface AutoOpenConfig {
    autoOpenWeekday?: number;
    autoOpenTime?: string;
    autoOpenDurationHours?: number;
}

const DEFAULT_AUTO_OPEN_WEEKDAY = 6;
const DEFAULT_AUTO_OPEN_TIME = '16:00';
const DEFAULT_AUTO_OPEN_DURATION_HOURS = 28;
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const normalizeAutoOpenConfig = (config: AutoOpenConfig = {}) => {
    const weekday = typeof config.autoOpenWeekday === 'number' ? config.autoOpenWeekday : DEFAULT_AUTO_OPEN_WEEKDAY;
    const time = typeof config.autoOpenTime === 'string' && /^\d{2}:\d{2}$/.test(config.autoOpenTime)
        ? config.autoOpenTime
        : DEFAULT_AUTO_OPEN_TIME;
    const duration = typeof config.autoOpenDurationHours === 'number' && config.autoOpenDurationHours > 0
        ? config.autoOpenDurationHours
        : DEFAULT_AUTO_OPEN_DURATION_HOURS;

    const [hourRaw, minuteRaw] = time.split(':').map(Number);
    const hour = Number.isFinite(hourRaw) ? Math.min(Math.max(hourRaw, 0), 23) : 16;
    const minute = Number.isFinite(minuteRaw) ? Math.min(Math.max(minuteRaw, 0), 59) : 0;

    return {
        weekday: Math.min(Math.max(weekday, 0), 6),
        hour,
        minute,
        durationHours: duration
    };
};

const getOpeningForBelarusWeek = (belarusWeekStart: Date, config: ReturnType<typeof normalizeAutoOpenConfig>) => {
    const offsetFromMonday = config.weekday === 0 ? 6 : config.weekday - 1;
    const openingDate = addBelarusDays(belarusWeekStart, offsetFromMonday);
    const openingBelarusTime = new Date(openingDate.getTime());
    openingBelarusTime.setUTCHours(config.hour, config.minute, 0, 0);
    return openingBelarusTime;
};

const formatBelarusWithOptions = (date: Date, options: Intl.DateTimeFormatOptions, locale = 'en-US') => {
    return new Intl.DateTimeFormat(locale, {
        timeZone: BELARUS_TIME_ZONE,
        ...options
    }).format(date);
};

export const parseBelarusDateTime = (dateString: string, timeString = '00:00') => {
    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes] = timeString.split(':').map(Number);

    return new Date(Date.UTC(
        year,
        Math.max((month || 1) - 1, 0),
        day || 1,
        hours || 0,
        minutes || 0,
        0,
        0
    ));
};

export const addBelarusMinutes = (date: Date, minutes: number) => {
    return new Date(date.getTime() + minutes * 60 * 1000);
};

export const getTimeStringMinutes = (timeString: string) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
};

export const addMinutesToTimeString = (timeString: string, minutesToAdd: number) => {
    const totalMinutes = getTimeStringMinutes(timeString) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

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

export const formatBelarusWeekdayLabel = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { weekday: 'long' }, locale);
};

export const formatBelarusMonthDayLabel = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { month: 'short', day: 'numeric' }, locale);
};

export const formatBelarusMonthDayYearLabel = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { month: 'short', day: 'numeric', year: 'numeric' }, locale);
};

export const formatBelarusShortDateLabel = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { weekday: 'short', month: 'short', day: 'numeric' }, locale);
};

export const formatBelarusLongDateLabel = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { weekday: 'long', month: 'long', day: 'numeric' }, locale);
};

export const formatBelarusLongDateYearLabel = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, locale);
};

export const formatBelarusCompactTimestamp = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, locale);
};

export const formatBelarusClockLabel = (date: Date, locale = 'en-US') => {
    return formatBelarusWithOptions(date, { hour: 'numeric', minute: '2-digit', hour12: true }, locale);
};

export const getBelarusWeekId = (date: Date) => {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${weekNumber}`;
};

export const isAutoBookingWindowOpen = (now: Date = new Date(), configInput: AutoOpenConfig = {}) => {
    const config = normalizeAutoOpenConfig(configInput);
    const belarusNow = getBelarusNow(now);
    const thisWeekStart = getBelarusWeekStart(belarusNow);

    const openingThisWeek = getOpeningForBelarusWeek(thisWeekStart, config);
    const openingLastWeek = new Date(openingThisWeek.getTime() - (7 * 24 * 60 * 60 * 1000));
    const windowDurationMs = config.durationHours * 60 * 60 * 1000;

    const isInsideWindow = (opening: Date) => {
        const closing = new Date(opening.getTime() + windowDurationMs);
        return belarusNow >= opening && belarusNow < closing;
    };

    return isInsideWindow(openingThisWeek) || isInsideWindow(openingLastWeek);
};

export const getNextAutoOpenDate = (now: Date = new Date(), configInput: AutoOpenConfig = {}) => {
    const config = normalizeAutoOpenConfig(configInput);
    const belarusNow = getBelarusNow(now);
    const thisWeekStart = getBelarusWeekStart(belarusNow);
    const openingThisWeek = getOpeningForBelarusWeek(thisWeekStart, config);

    const nextOpeningBelarus = belarusNow < openingThisWeek
        ? openingThisWeek
        : new Date(openingThisWeek.getTime() + (7 * 24 * 60 * 60 * 1000));
    return new Date(nextOpeningBelarus.getTime() - (BELARUS_UTC_OFFSET_HOURS * 60 * 60 * 1000));
};

export const getAutoOpenWindowDisplay = (configInput: AutoOpenConfig = {}) => {
    const config = normalizeAutoOpenConfig(configInput);
    const thisWeekStart = getBelarusWeekStart(getBelarusDate());
    const opening = getOpeningForBelarusWeek(thisWeekStart, config);
    const closing = new Date(opening.getTime() + (config.durationHours * 60 * 60 * 1000));

    const formatTime = (date: Date) => `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;

    return {
        openDay: WEEKDAY_LABELS[opening.getUTCDay()],
        openTime: formatTime(opening),
        closeDay: WEEKDAY_LABELS[closing.getUTCDay()],
        closeTime: formatTime(closing)
    };
};

export const getNextSaturday1600 = (now: Date = new Date()) => {
    return getNextAutoOpenDate(now, {
        autoOpenWeekday: DEFAULT_AUTO_OPEN_WEEKDAY,
        autoOpenTime: DEFAULT_AUTO_OPEN_TIME,
        autoOpenDurationHours: DEFAULT_AUTO_OPEN_DURATION_HOURS
    });
};
