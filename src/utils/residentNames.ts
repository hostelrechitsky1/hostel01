const getResidentNameParts = (name: string) => name.trim().split(/\s+/).filter(Boolean);

const areResidentNamePartsEqual = (left: string, right: string) => (
    left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0
);

export const getResidentDisplayParts = (name: string) => {
    const parts = getResidentNameParts(name);
    if (parts.length === 0) return [];
    if (parts.length === 1) return parts;

    const primaryPart = parts[0];
    const secondaryPart = [...parts.slice(1)]
        .reverse()
        .find((part) => !areResidentNamePartsEqual(part, primaryPart))
        ?? parts[1];

    if (areResidentNamePartsEqual(primaryPart, secondaryPart)) {
        return [primaryPart];
    }

    return [primaryPart, secondaryPart];
};

export const getResidentInitials = (name: string) => {
    const parts = getResidentDisplayParts(name);
    if (parts.length === 0) return 'R';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

export const getResidentShortName = (name: string) => getResidentDisplayParts(name).join(' ');
