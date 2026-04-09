import { useEffect, useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import { bookingService } from '../services/bookingService';
import { Send, MessageSquare, Reply, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Feedback } from '../types';

export default function DashboardFeedback() {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [history, setHistory] = useState<Feedback[]>([]);
    const user = bookingService.getCurrentUser();

    useEffect(() => {
        if (!user) return;
        const unsubscribe = firestoreService.subscribeToFeedbacks((feedbacks) => {
            const myFeedbacks = feedbacks.filter((item) =>
                item.studentId === user.id ||
                (item.studentName === user.name && item.roomNumber === user.roomNumber)
            );
            setHistory(myFeedbacks);
        }, () => {
            toast.error('Failed to load feedback history.');
        });

        return unsubscribe;
    }, [user]);

    const handleSubmit = async () => {
        if (!text.trim()) return;
        setLoading(true);

        try {
            await firestoreService.addFeedback({
                id: Date.now().toString(),
                studentId: user?.id || '',
                studentName: user?.name || 'Anonymous',
                roomNumber: user?.roomNumber || '?',
                text,
                type: 'other', // Default simple type
                timestamp: Date.now(),
                read: false
            });
            setSuccess(true);
            setText('');
            toast.success('Feedback sent!');
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            toast.error('Failed to send feedback.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ marginTop: '40px', paddingBottom: '40px' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={20} /> Feedback
            </h3>
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
                <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                    Have a suggestion or found a bug? Let us know directly.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type your feedback here..."
                        style={{
                            flex: 1,
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '12px',
                            padding: '12px',
                            color: 'white',
                            outline: 'none'
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !text.trim() || success}
                        className="primary-button"
                        style={{
                            padding: '0 20px',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '50px',
                            background: success ? 'var(--success)' : 'var(--primary)'
                        }}
                    >
                        {success ? 'Sent!' : <Send size={18} />}
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', marginTop: '16px' }}>
                <h4 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} /> Feedback History
                </h4>

                {history.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                        No feedback yet. Your sent messages and admin replies will appear here.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {history.map(item => (
                            <div
                                key={item.id}
                                style={{
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: '14px',
                                    padding: '14px',
                                    background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {item.type}
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {format(item.timestamp, 'MMM d, HH:mm')}
                                    </span>
                                </div>
                                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
                                    {item.text}
                                </div>

                                {item.adminReply ? (
                                    <div style={{
                                        marginTop: '12px',
                                        borderRadius: '12px',
                                        padding: '12px',
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        border: '1px solid rgba(16, 185, 129, 0.35)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#34d399' }}>
                                                <Reply size={14} /> Admin Reply
                                            </div>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {item.adminReplyAt ? format(item.adminReplyAt, 'MMM d, HH:mm') : ''}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '13px', lineHeight: 1.5 }}>{item.adminReply}</div>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Waiting for admin reply…
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
