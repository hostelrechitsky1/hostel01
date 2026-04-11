let sonnerPromise: Promise<typeof import('sonner')> | null = null;

const loadSonner = () => {
    sonnerPromise ??= import('sonner');
    return sonnerPromise;
};

export const notifySuccess = (message: string) => {
    void loadSonner().then(({ toast }) => {
        toast.success(message);
    });
};

export const notifyError = (message: string) => {
    void loadSonner().then(({ toast }) => {
        toast.error(message);
    });
};

export const notifyInfo = (message: string) => {
    void loadSonner().then(({ toast }) => {
        toast(message);
    });
};
