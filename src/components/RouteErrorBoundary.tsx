import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DataLoadNotice } from './DataLoadNotice';

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Could not open page', error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div className="container flex-center" style={{ minHeight: '100dvh', padding: '24px' }}>
                <DataLoadNotice
                    title="Could not open this page"
                    description="Please check your connection and try loading the page again."
                    onRetry={() => window.location.reload()}
                    retryLabel="Reload Page"
                    tone="error"
                />
            </div>
        );
    }
}
