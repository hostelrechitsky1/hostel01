import { useEffect, useState, type FormEvent } from 'react';
import { BellRing, CheckCircle2, Mail, Send } from 'lucide-react';
import type { Student } from '../types';
import type { ResidentPortalLanguage } from '../utils/residentPortalLanguage';

type ReminderStatus = { enabled: boolean; email: string; pendingEmail: string };
type ReminderAction = 'status' | 'subscribe' | 'remove';

const labels = {
    en: {
        eyebrow: 'OPTIONAL EMAIL REMINDERS', title: 'Stay on schedule',
        description: 'Get a reminder 15 minutes before your booking starts and another 15 minutes before your slot ends, so you know when to collect your clothes.',
        placeholder: 'Your email address', subscribe: 'Enable reminders', change: 'Change email', remove: 'Turn off',
        active: 'Reminders on', pending: 'Check your inbox', pendingDescription: 'Open the confirmation link we sent to',
        privacy: 'We’ll send a confirmation link first. Your email is only used for booking reminders.',
        failed: 'Could not update reminders. Please try again.', loading: 'Loading reminders…',
    },
    ru: {
        eyebrow: 'НАПОМИНАНИЯ ПО ЖЕЛАНИЮ', title: 'Не пропустите своё время',
        description: 'Получите письмо за 15 минут до начала брони и ещё одно за 15 минут до её окончания, чтобы вовремя забрать вещи.',
        placeholder: 'Ваш адрес электронной почты', subscribe: 'Включить напоминания', change: 'Изменить адрес', remove: 'Отключить',
        active: 'Напоминания включены', pending: 'Проверьте почту', pendingDescription: 'Откройте ссылку подтверждения в письме, отправленном на',
        privacy: 'Сначала мы отправим ссылку для подтверждения. Адрес используется только для напоминаний о бронировании.',
        failed: 'Не удалось обновить напоминания. Попробуйте ещё раз.', loading: 'Загружаем напоминания…',
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
    const [status, setStatus] = useState<ReminderStatus | null>(null);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const refresh = () => {
            void requestPreference(student, 'status')
                .then((nextStatus) => { if (active) { setStatus(nextStatus); setError(''); setLoading(false); } })
                .catch(() => { if (active) { setError(t.failed); setLoading(false); } });
        };
        refresh();
        window.addEventListener('focus', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); };
    }, [student, t.failed]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!email.trim()) return;
        setBusy(true);
        setError('');
        try { setStatus(await requestPreference(student, 'subscribe', email.trim())); setEmail(''); }
        catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        setBusy(true);
        setError('');
        try { setStatus(await requestPreference(student, 'remove')); setEmail(''); }
        catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
        finally { setBusy(false); }
    };

    return (
        <section className="reminder-card" aria-labelledby="reminder-card-title">
            <div className="reminder-card-icon" aria-hidden="true"><BellRing size={23} /></div>
            <div className="reminder-card-content">
                <div className="reminder-card-eyebrow">{t.eyebrow}</div>
                <h3 id="reminder-card-title">{t.title}</h3>
                <p className="reminder-card-description">{t.description}</p>
                {status?.enabled && <div className="reminder-card-status"><CheckCircle2 size={16} /> {t.active} <span>· {status.email}</span></div>}
                {status?.pendingEmail && <div className="reminder-card-pending"><Mail size={16} /><span><strong>{t.pending}.</strong> {t.pendingDescription} {status.pendingEmail}.</span></div>}
                <form className="reminder-card-form" onSubmit={submit}>
                    <label className="sr-only" htmlFor="reminder-email">{t.placeholder}</label>
                    <input id="reminder-email" type="email" autoComplete="email" required maxLength={254}
                        value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t.placeholder} disabled={busy || loading} />
                    <button type="submit" disabled={busy || loading || !email.trim()}><Send size={16} />{status?.enabled ? t.change : t.subscribe}</button>
                </form>
                <div className="reminder-card-bottom">
                    <p>{loading ? t.loading : t.privacy}</p>
                    {status?.enabled && <button type="button" className="reminder-card-remove" onClick={remove} disabled={busy}>{t.remove}</button>}
                </div>
                {error && <p className="reminder-card-error" role="alert">{error}</p>}
            </div>
        </section>
    );
}
