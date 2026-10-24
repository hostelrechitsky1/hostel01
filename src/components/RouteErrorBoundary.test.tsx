import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteErrorBoundary } from './RouteErrorBoundary';

describe('route error recovery', () => {
    it('shows a recovery action when a page module cannot open', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const FailedPage = (): never => { throw new Error('Importing a module script failed'); };
        render(<RouteErrorBoundary><FailedPage /></RouteErrorBoundary>);
        expect(screen.getByText('Could not open this page')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reload Page' })).toBeEnabled();
        errorSpy.mockRestore();
    });
});
