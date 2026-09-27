import { useEffect, useMemo, useState } from 'react';
import { BellRing, Mail, RefreshCw, Search } from 'lucide-react';
import type { Student } from '../types';
import './ManagerReminderSubscribers.css';

type Subscriber = { studentId: string; email: string };

export default function ManagerReminderSubscribers({ students }: { students: Student[] }) {
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (students.length === 0) { setSubscribers([]); setLoading(false); return; }
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await fetch('/.netlify/functions/manager-reminder-subscribers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ residents: students.map(({ id, roomNumber, pin }) => ({ studentId: id, roomNumber, pin })) }),
                    signal: controller.signal,
                });
                const result = await response.json();
                if (!response.ok || !Array.isArray(result.subscribers)) throw new Error('Could not load subscribers.');
                setSubscribers(result.subscribers);
            } catch {
                if (!controller.signal.aborted) setError('Could not load subscribers. Please try again.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [students, refreshKey]);

    const studentsById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
    const visible = useMemo(() => subscribers
        .map((subscriber) => ({ ...subscriber, student: studentsById.get(subscriber.studentId) }))
        .filter((subscriber) => subscriber.student)
        .filter(({ student, email }) => {
            const query = search.trim().toLowerCase();
            return !query || student!.name.toLowerCase().includes(query)
                || student!.roomNumber.toLowerCase().includes(query) || email.toLowerCase().includes(query);
        })
        .sort((a, b) => a.student!.roomNumber.localeCompare(b.student!.roomNumber, undefined, { numeric: true })),
    [search, studentsById, subscribers]);

    return (
        <section className="manager-reminders" aria-labelledby="manager-reminders-title">
            <div className="manager-reminders-heading">
                <div className="manager-reminders-icon" aria-hidden="true"><BellRing size={22} /></div>
                <div className="manager-reminders-heading-text">
                    <h3 id="manager-reminders-title">Email reminders</h3>
                    <p>Residents who have turned on booking reminders. Addresses are masked for privacy.</p>
                </div>
                <span className="manager-reminders-count">{loading ? 'Checking…' : `${subscribers.length} subscribed`}</span>
            </div>

            <div className="manager-reminders-toolbar">
                <label className="manager-reminders-search">
                    <Search size={17} aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)}
                        aria-label="Search subscribers" placeholder="Search name, room, or email" />
                </label>
                <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
                    <RefreshCw size={16} aria-hidden="true" /> Refresh
                </button>
            </div>

            {error && <p className="manager-reminders-message manager-reminders-error" role="alert">{error}</p>}
            {loading && subscribers.length === 0 ? (
                <p className="manager-reminders-message" role="status">Checking reminder subscriptions…</p>
            ) : visible.length === 0 ? (
                <p className="manager-reminders-message">{search ? 'No matching subscribers.' : 'No residents have subscribed yet.'}</p>
            ) : (
                <div className="manager-reminders-list">
                    {visible.map(({ studentId, student, email }) => (
                        <div className="manager-reminders-row" key={studentId}>
                            <span className="manager-reminders-avatar" aria-hidden="true">{student!.name.trim().charAt(0).toUpperCase()}</span>
                            <div className="manager-reminders-person">
                                <strong>{student!.name}</strong>
                                <span>Room {student!.roomNumber}</span>
                            </div>
                            <div className="manager-reminders-email"><Mail size={15} aria-hidden="true" /><span>{email}</span></div>
                            <span className="manager-reminders-active"><span aria-hidden="true" /> On</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
