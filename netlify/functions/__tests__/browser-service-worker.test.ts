import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/sw.js', 'utf8');
const createWorker = (cached?: Response) => {
    const handlers = new Map();
    const network = vi.fn();
    const cache = { match: vi.fn().mockResolvedValue(cached), put: vi.fn().mockResolvedValue(undefined) };
    runInNewContext(source, {
        self: { location: { origin: 'https://hostelone.netlify.app' }, addEventListener: (name, callback) => handlers.set(name, callback) },
        caches: { open: async () => cache }, fetch: network, URL, Response, Promise,
    });
    const fetchAsset = () => {
        let response: Promise<Response>;
        handlers.get('fetch')({
            request: { method: 'GET', destination: 'script', url: 'https://hostelone.netlify.app/assets/Dashboard-abcdefgh.js' },
            respondWith: (result: Promise<Response>) => { response = result; },
        });
        return response!;
    };
    return { fetchAsset, network };
};

describe('browser service worker asset loading', () => {
    it('serves cached hashed routes without waiting for the network', async () => {
        const cached = new Response('export default {}');
        const worker = createWorker(cached);
        expect(await worker.fetchAsset()).toBe(cached);
        expect(worker.network).not.toHaveBeenCalled();
    });
    it('preserves a missing asset error instead of returning JavaScript which reloads the page', async () => {
        const worker = createWorker();
        worker.network.mockResolvedValue(new Response('Not found', { status: 404 }));
        const response = await worker.fetchAsset();
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain('location.reload');
    });
    it('lets a failed optional preload reject instead of reloading a room selection offline', async () => {
        const worker = createWorker();
        worker.network.mockRejectedValue(new Error('network failed'));
        await expect(worker.fetchAsset()).rejects.toThrow('offline');
    });
});
