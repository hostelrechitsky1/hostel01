type HapticPattern = number | number[];

const canVibrate = () => {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
};

export const triggerHaptic = (pattern: HapticPattern) => {
    if (!canVibrate()) return;
    navigator.vibrate(0);
    navigator.vibrate(pattern);
};

export const hapticSelection = () => {
    triggerHaptic(20);
};

export const hapticSoftPulse = () => {
    triggerHaptic([18, 30, 18]);
};

export const hapticSuccess = () => {
    triggerHaptic([30, 40, 30, 80, 30]);
};
