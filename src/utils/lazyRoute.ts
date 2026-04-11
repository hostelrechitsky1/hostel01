import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type LoadableComponent<T extends ComponentType<object>> = LazyExoticComponent<T> & {
    preload: () => Promise<{ default: T }>;
};

export const lazyRoute = <T extends ComponentType<object>>(
    load: () => Promise<{ default: T }>
) => {
    const Component = lazy(load) as LoadableComponent<T>;
    Component.preload = load;
    return Component;
};
