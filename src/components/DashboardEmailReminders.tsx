import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BellRing, CheckCircle2, Mail, Send } from 'lucide-react';
import type { Student } from '../types';
import type { ResidentPortalLanguage } from '../utils/residentPortalLanguage';
import './DashboardEmailReminders.css';

type ReminderStatus = { enabled: boolean; email: string };
type ReminderAction = 'status' | 'subscribe' | 'remove';
const CACHE_PREFIX = 'hostel_reminder_status_v1:';

const readCachedStatus = (studentId: string): ReminderStatus | null => {
    try {
        const value = window.sessionStorage.getItem(`${CACHE_PREFIX}${studentId}`);
        if (!value) return null;
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || !('enabled' in parsed) || !('email' in parsed)
            || typeof parsed.enabled !== 'boolean' || typeof parsed.email !== 'string') return null;
        return { enabled: parsed.enabled, email: parsed.email };
    } catch { return null; }
};

const cacheStatus = (studentId: string, status: ReminderStatus) => {
    try { window.sessionStorage.setItem(`${CACHE_PREFIX}${studentId}`, JSON.stringify(status)); }
    catch { /* Reminders still work when browser storage is unavailable. */ }
};

const labels = {
    en: {
        title: 'Laundry reminders', optional: 'Optional',
        description: 'An email 15 minutes before your booking starts, and another 15 minutes before it ends.',
        email: 'Email address', placeholder: 'you@example.com', subscribe: 'Turn on reminders', update: 'Save new email',
        change: 'Change email', remove: 'Turn off', active: 'Reminders are on',
        privacy: 'Only for your bookings. Turn them off anytime.',
        failed: 'Reminders are unavailable right now. Please try again.', loading: 'Checking your reminder settings…',
    },
    ru: {
        title: 'Напоминания о стирке', optional: 'По желанию',
        description: 'Письмо за 15 минут до начала брони и ещё одно за 15 минут до её окончания.',
        email: 'Адрес электронной почты', placeholder: 'you@example.com', subscribe: 'Включить напоминания', update: 'Сохранить новый адрес',
        change: 'Изменить адрес', remove: 'Отключить', active: 'Напоминания включены',
        privacy: 'Только о ваших бронированиях. Отключить можно в любой момент.',
        failed: 'Напоминания сейчас недоступны. Попробуйте позже.', loading: 'Проверяем настройки напоминаний…',
    },
};

const requestPreference = async (student: Student, action: ReminderAction, email?: string): Promise<ReminderStatus> => {
    const response = await fetch('/.netlify/functions/resident-email-preference', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, studentId: student.id, roomNumber: student.roomNumber, pin: student.pin, email }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result as ReminderStatus;
};

export default function DashboardEmailReminders({ student, language }: { student: Student; language: ResidentPortalLanguage }) {
    const t = labels[language];
    const [status, setStatus] = useState<ReminderStatus | null>(() => readCachedStatus(student.id));
    const [email, setEmail] = useState('');
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(() => !readCachedStatus(student.id));
    const [error, setError] = useState('');
    const requestVersion = useRef(0);
    const changingPreference = useRef(false);

    useEffect(() => {
        let active = true;
        const refresh = () => {
            if (changingPreference.current) return;
            const version = ++requestVersion.current;
            void requestPreference(student, 'status')
                .then((nextStatus) => {
                    if (active && version === requestVersion.current) {
                        cacheStatus(student.id, nextStatus);
                        setStatus(nextStatus);
                        setError('');
                        setLoading(false);
                    }
                })
                .catch(() => {
                    if (active && version === requestVersion.current) {
                        if (!readCachedStatus(student.id)) setError(t.failed);
                        setLoading(false);
                    }
                });
        };
        refresh();
        window.addEventListener('focus', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); };
    }, [student, t.failed]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!email.trim()) return;
        changingPreference.current = true;
        requestVersion.current += 1;
        setBusy(true);
        setError('');
        try {
            const nextStatus = await requestPreference(student, 'subscribe', email.trim());
            cacheStatus(student.id, nextStatus);
            setStatus(nextStatus);
            setEmail('');
            setEditing(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : t.failed);
        } finally { changingPreference.current = false; setBusy(false); }
    };

    const remove = async () => {
        changingPreference.current = true;
        requestVersion.current += 1;
        setBusy(true);
        setError('');
        try {
            const nextStatus = await requestPreference(student, 'remove');
            cacheStatus(student.id, nextStatus);
            setStatus(nextStatus);
            setEmail('');
            setEditing(false);
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
        finally { changingPreference.current = false; setBusy(false); }
    };

    return (
        <section className="reminder-card" aria-labelledby="reminder-card-title">
            <div className="reminder-card-heading">
                <div className="reminder-card-icon" aria-hidden="true"><BellRing size={21} /></div>
                <div className="reminder-card-title-group">
                    <div className="reminder-card-title-line">
                        <h3 id="reminder-card-title">{t.title}</h3>
                        <span className="reminder-card-optional">{t.optional}</span>
                    </div>
                    <p>{t.description}</p>
                </div>
            </div>

            {loading && !status ? (
                <div className="reminder-card-loading" role="status">{t.loading}</div>
            ) : status?.enabled && !editing ? (
                <div className="reminder-card-saved">
                    <span className="reminder-card-saved-icon"><CheckCircle2 size={18} /></span>
                    <div><strong>{t.active}</strong><span>{status.email}</span></div>
                    <button type="button" onClick={() => setEditing(true)} disabled={busy}>{t.change}</button>
                </div>
            ) : (
                <form className="reminder-card-form" onSubmit={submit}>
                    <label htmlFor="reminder-email">{t.email}</label>
                    <div className="reminder-card-controls">
                        <div className="reminder-card-input-wrap"><Mail size={18} aria-hidden="true" />
                            <input id="reminder-email" type="email" autoComplete="email" required maxLength={254}
                                value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t.placeholder} disabled={busy || loading} />
                        </div>
                        <button type="submit" disabled={busy || loading || !email.trim()}><Send size={16} />{status?.enabled ? t.update : t.subscribe}</button>
                    </div>
                </form>
            )}

            <div className="reminder-card-footer">
                <span>{t.privacy}</span>
                {status?.enabled && <button type="button" onClick={remove} disabled={busy}>{t.remove}</button>}
            </div>
            {error && <p className="reminder-card-error" role="alert">{error}</p>}
        </section>
    );
}
