import { describe, expect, it } from 'vitest';
import { getResidentInitials, getResidentShortName } from '../residentNames';

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
});
