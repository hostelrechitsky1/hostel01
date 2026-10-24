import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../serviceWorker';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('service worker registration', () => {
    it('activates the worker without reloading the login form on first control or an update', async () => {
        vi.stubEnv('PROD', true);
        const reload = vi.fn();
        const worker = new EventTarget();
        const registration = new EventTarget();
        const waiting = { postMessage: vi.fn() };
        const update = vi.fn().mockResolvedValue(undefined);
        Object.assign(registration, { waiting, update });
        const register = vi.fn().mockResolvedValue(registration);
        Object.assign(worker, { register });
        vi.stubGlobal('navigator', { serviceWorker: worker });
        vi.stubGlobal('window', { location: { hostname: 'hostelone.netlify.app', reload }, requestIdleCallback: (callback: () => void) => callback() });
        registerServiceWorker();
        await Promise.resolve();
        expect(register).toHaveBeenCalledWith('/sw.js');
        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        worker.dispatchEvent(new Event('controllerchange'));
        worker.dispatchEvent(new Event('controllerchange'));
        expect(reload).not.toHaveBeenCalled();
    });
    it('treats unavailable service workers as optional', () => {
        vi.stubEnv('PROD', true);
        vi.stubGlobal('navigator', {});
        expect(() => registerServiceWorker()).not.toThrow();
    });
});
