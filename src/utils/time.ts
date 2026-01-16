const BELARUS_UTC_OFFSET_HOURS = 3;

export const getBelarusNow = (now: Date = new Date()) => {
    return new Date(now.getTime() + BELARUS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
};

export const isAutoBookingWindowOpen = (now: Date = new Date()) => {
    const belarusNow = getBelarusNow(now);
    const day = belarusNow.getUTCDay();
    const hour = belarusNow.getUTCHours();

    if (day === 6 && hour >= 16) return true;
    if (day === 0) return true;
    if (day === 1 && hour < 9) return true;
    return false;
};
