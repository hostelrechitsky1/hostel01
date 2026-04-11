const CYRILLIC_REPLACEMENTS: Array<[RegExp, string]> = [
    [/Дж/g, 'J'],
    [/дж/g, 'j'],
    [/ДЖ/g, 'J'],
    [/дЖ/g, 'j'],
];

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
    А: 'A', а: 'a',
    Б: 'B', б: 'b',
    В: 'V', в: 'v',
    Г: 'G', г: 'g',
    Д: 'D', д: 'd',
    Е: 'E', е: 'e',
    Ё: 'Yo', ё: 'yo',
    Ж: 'Zh', ж: 'zh',
    З: 'Z', з: 'z',
    И: 'I', и: 'i',
    Й: 'Y', й: 'y',
    К: 'K', к: 'k',
    Л: 'L', л: 'l',
    М: 'M', м: 'm',
    Н: 'N', н: 'n',
    О: 'O', о: 'o',
    П: 'P', п: 'p',
    Р: 'R', р: 'r',
    С: 'S', с: 's',
    Т: 'T', т: 't',
    У: 'U', у: 'u',
    Ф: 'F', ф: 'f',
    Х: 'H', х: 'h',
    Ц: 'Ts', ц: 'ts',
    Ч: 'Ch', ч: 'ch',
    Ш: 'Sh', ш: 'sh',
    Щ: 'Shch', щ: 'shch',
    Ъ: '', ъ: '',
    Ы: 'Y', ы: 'y',
    Ь: '', ь: '',
    Э: 'E', э: 'e',
    Ю: 'Yu', ю: 'yu',
    Я: 'Ya', я: 'ya',
};

const applyCyrillicReplacements = (name: string) => (
    CYRILLIC_REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), name)
);

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

export const transliterateResidentName = (name: string) => (
    Array.from(applyCyrillicReplacements(name))
        .map((character) => CYRILLIC_TO_LATIN_MAP[character] ?? character)
        .join('')
);

export const getResidentNameForLanguage = (name: string, isRussian = false) => (
    isRussian ? name : transliterateResidentName(name)
);

export const getResidentShortNameForLanguage = (name: string, isRussian = false) => (
    getResidentShortName(getResidentNameForLanguage(name, isRussian))
);

export const getResidentInitialsForLanguage = (name: string, isRussian = false) => (
    getResidentInitials(getResidentNameForLanguage(name, isRussian))
);

export const getResidentFirstNameForLanguage = (name: string, isRussian = false) => (
    getResidentNameForLanguage(name, isRussian).trim().split(/\s+/).filter(Boolean)[0] ?? ''
);
