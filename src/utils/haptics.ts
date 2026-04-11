type HapticPattern = number | number[];

const canVibrate = () => {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
};

export const triggerHaptic = (pattern: HapticPattern) => {
    if (!canVibrate()) return;
    navigator.vibrate(pattern);
};

export const hapticSelection = () => {
    triggerHaptic(12);
};

export const hapticSoftPulse = () => {
    triggerHaptic([10, 28, 14]);
};

export const hapticSuccess = () => {
    triggerHaptic([20, 40, 20, 80, 20]);
};
