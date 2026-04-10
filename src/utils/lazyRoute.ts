import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type LoadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
    preload: () => Promise<{ default: T }>;
};

export const lazyRoute = <T extends ComponentType<any>>(
    load: () => Promise<{ default: T }>
) => {
    const Component = lazy(load) as LoadableComponent<T>;
    Component.preload = load;
    return Component;
};
