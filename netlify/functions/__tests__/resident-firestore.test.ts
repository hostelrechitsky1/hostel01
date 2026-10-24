import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('Firestore collection pagination', () => {
    it('loads all pages so VIP students beyond the first 400 are not treated as missing', async () => {
        vi.stubEnv('FIREBASE_PROJECT_ID', 'test-project');
        vi.stubEnv('FIREBASE_API_KEY', 'test-key');
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ documents: [{ name: 'students/first' }], nextPageToken: 'page 2' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ documents: [{ name: 'students/vip' }] }) });
        vi.stubGlobal('fetch', fetchMock);
        const { listFirestoreCollectionDocuments } = await import('../_resident-firestore.js');
        expect(await listFirestoreCollectionDocuments('students', 400, ['id', 'name'])).toEqual([
            { name: 'students/first' }, { name: 'students/vip' },
        ]);
        const secondUrl = new URL(fetchMock.mock.calls[1][0]);
        expect(secondUrl.searchParams.get('pageToken')).toBe('page 2');
        expect(secondUrl.searchParams.getAll('mask.fieldPaths')).toEqual(['id', 'name']);
    });
});
