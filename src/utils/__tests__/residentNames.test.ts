import { describe, expect, it } from 'vitest';
import {
    getResidentFirstNameForLanguage,
    getResidentInitials,
    getResidentInitialsForLanguage,
    getResidentNameForLanguage,
    getResidentShortName,
    getResidentShortNameForLanguage,
} from '../residentNames';

describe('residentNames', () => {
    it('uses the last distinct token when the surname repeats at the end', () => {
        expect(getResidentShortName('Yasarathna Achariye Hasara Yasarathna')).toBe('Yasarathna Hasara');
        expect(getResidentInitials('Yasarathna Achariye Hasara Yasarathna')).toBe('YH');
    });

    it('keeps two-part names unchanged', () => {
        expect(getResidentShortName('Risvy Ahamed')).toBe('Risvy Ahamed');
        expect(getResidentInitials('Risvy Ahamed')).toBe('RA');
    });

    it('collapses identical repeated names to a single token', () => {
        expect(getResidentShortName('Yasarathna Yasarathna')).toBe('Yasarathna');
        expect(getResidentInitials('Yasarathna Yasarathna')).toBe('YA');
    });

    it('transliterates Cyrillic names for English mode', () => {
        expect(getResidentNameForLanguage('Силва Константирире Айон Шанилка', false)).toBe('Silva Konstantirire Ayon Shanilka');
        expect(getResidentShortNameForLanguage('Силва Константирире Айон Шанилка', false)).toBe('Silva Shanilka');
        expect(getResidentInitialsForLanguage('Силва Константирире Айон Шанилка', false)).toBe('SS');
        expect(getResidentFirstNameForLanguage('Силва Константирире Айон Шанилка', false)).toBe('Silva');
    });

    it('uses hostel-friendly transliteration for H and J sounds', () => {
        expect(getResidentNameForLanguage('Кхан Сара', false)).toBe('Khan Sara');
        expect(getResidentNameForLanguage('Амир Хуссаин Абдул Рахуман', false)).toBe('Amir Hussain Abdul Rahuman');
        expect(getResidentNameForLanguage('Джаясингхе', false)).toBe('Jayasinghe');
        expect(getResidentNameForLanguage('Джунаид Сахид', false)).toBe('Junaid Sahid');
    });

    it('keeps original resident names in Russian mode', () => {
        expect(getResidentNameForLanguage('Силва Константирире Айон Шанилка', true)).toBe('Силва Константирире Айон Шанилка');
    });
});
