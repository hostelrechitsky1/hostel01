import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type DialogMode = 'alert' | 'confirm' | 'prompt';

interface DialogState {
    mode: DialogMode;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    placeholder?: string;
    defaultValue?: string;
    isDanger?: boolean;
    inputType?: 'text' | 'password';
}

export function useAdminDialog() {
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [inputValue, setInputValue] = useState('');
    const resolverRef = useRef<((value: boolean | string | null) => void) | null>(null);

    const closeWithValue = (value: boolean | string | null) => {
        resolverRef.current?.(value);
        resolverRef.current = null;
        setDialog(null);
        setInputValue('');
    };

    const alertDialog = (title: string, message?: string, confirmText = 'OK') => {
        return new Promise<void>((resolve) => {
            resolverRef.current = () => resolve();
            setDialog({ mode: 'alert', title, message, confirmText });
        });
    };

    const confirmDialog = (title: string, message?: string, options?: { confirmText?: string; cancelText?: string; isDanger?: boolean }) => {
        return new Promise<boolean>((resolve) => {
            resolverRef.current = (value) => resolve(Boolean(value));
            setDialog({
                mode: 'confirm',
                title,
                message,
                confirmText: options?.confirmText || 'Confirm',
                cancelText: options?.cancelText || 'Cancel',
                isDanger: options?.isDanger
            });
        });
    };

    const promptDialog = (
        title: string,
        message?: string,
        options?: { placeholder?: string; defaultValue?: string; confirmText?: string; cancelText?: string; inputType?: 'text' | 'password' }
    ) => {
        return new Promise<string | null>((resolve) => {
            resolverRef.current = (value) => resolve(typeof value === 'string' ? value : null);
            setInputValue(options?.defaultValue || '');
            setDialog({
                mode: 'prompt',
                title,
                message,
                placeholder: options?.placeholder,
                defaultValue: options?.defaultValue,
                confirmText: options?.confirmText || 'Continue',
                cancelText: options?.cancelText || 'Cancel',
                inputType: options?.inputType || 'text'
            });
        });
    };

    const dialogNode = dialog ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-card glass-panel" style={{ width: 'min(95%, 480px)', textAlign: 'left', padding: '24px' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '22px' }}>{dialog.title}</h3>
                {dialog.message && <p style={{ margin: 0, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>{dialog.message}</p>}

                {dialog.mode === 'prompt' && (
                    <input
                        type={dialog.inputType || 'text'}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={dialog.placeholder}
                        autoFocus
                        style={{
                            marginTop: '18px',
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-main)',
                            outline: 'none'
                        }}
                    />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    {dialog.mode !== 'alert' && (
                        <button className="glass-button" style={{ padding: '10px 16px', borderRadius: '10px' }} onClick={() => closeWithValue(false)}>
                            {dialog.cancelText || 'Cancel'}
                        </button>
                    )}
                    <button
                        className={dialog.isDanger ? 'glass-button' : 'primary-button'}
                        style={{
                            padding: '10px 16px',
                            borderRadius: '10px',
                            ...(dialog.isDanger
                                ? { background: 'rgba(239, 68, 68, 0.16)', border: '1px solid rgba(239, 68, 68, 0.45)', color: '#fca5a5' }
                                : {})
                        }}
                        onClick={() => closeWithValue(dialog.mode === 'prompt' ? inputValue : true)}
                    >
                        {dialog.confirmText || 'OK'}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const portalNode = typeof document !== 'undefined' && dialogNode
        ? createPortal(dialogNode, document.body)
        : dialogNode;

    return { alertDialog, confirmDialog, promptDialog, dialogNode: portalNode };
}
