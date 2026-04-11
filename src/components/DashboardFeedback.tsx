import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
    MessageSquare,
    Reply,
    Send,
    Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import type { Feedback, FeedbackType } from '../types';

const FEEDBACK_HISTORY_LIMIT = 8;

const inferFeedbackType = (text: string): FeedbackType => {
    const normalized = text.trim().toLowerCase();

    if (/(bug|broken|issue|problem|error|fail|crash|not working)/.test(normalized)) {
        return 'bug';
    }

    if (/(feature|suggest|idea|improve|add|please make|can you)/.test(normalized)) {
        return 'feature';
    }

    return 'other';
};

export default function DashboardFeedback() {
    const user = bookingService.getCurrentUser();
    const cachedFeedbacks = useMemo(() => {
        if (!user) return undefined;
        return firestoreService.getCachedFeedbacksForResident(
            user.id ?? '',
            user.name,
            user.roomNumber,
            FEEDBACK_HISTORY_LIMIT
        );
    }, [user?.id, user?.name, user?.roomNumber]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedbacks, setFeedbacks] = useState<Feedback[]>(() => cachedFeedbacks ?? []);
    const repliedFeedbacks = useMemo(() => {
        return [...feedbacks]
            .filter((feedback) => Boolean(feedback.adminReply?.text?.trim()))
            .sort((left, right) => (right.adminReply?.repliedAt ?? 0) - (left.adminReply?.repliedAt ?? 0));
    }, [feedbacks]);

    useEffect(() => {
        setFeedbacks(cachedFeedbacks ?? []);
    }, [cachedFeedbacks]);

    useEffect(() => {
        if (!user) return;

        return firestoreService.subscribeToFeedbacksForResident(
            user.id ?? '',
            user.name,
            user.roomNumber,
            FEEDBACK_HISTORY_LIMIT,
            setFeedbacks,
            (error) => {
                console.error('Failed to subscribe to resident feedback', error);
            }
        );
    }, [user?.id, user?.name, user?.roomNumber]);

    const handleSubmit = async () => {
        const trimmedText = text.trim();
        if (!trimmedText || !user) return;

        setLoading(true);

        try {
            await firestoreService.addFeedback({
                id: Date.now().toString(),
                studentId: user.id,
                studentName: user.name,
                roomNumber: user.roomNumber,
                text: trimmedText,
                type: inferFeedbackType(trimmedText),
                timestamp: Date.now(),
                read: false
            });

            setText('');
            toast.success('Feedback sent. Admin replies will appear below.');
        } catch (error) {
            console.error('Failed to send feedback', error);
            toast.error('Failed to send feedback.');
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div style={{ marginTop: '40px', paddingBottom: '40px' }}>
            <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} />
                Feedback
            </h3>

            <div
                className="glass-panel"
                style={{
                    padding: '16px',
                    borderRadius: '18px',
                    marginBottom: '18px',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(20, 24, 58, 0.92) 100%)',
                    border: '1px solid rgba(129, 140, 248, 0.18)',
                    boxShadow: '0 16px 32px rgba(12, 18, 42, 0.28)'
                }}
            >
                <p style={{ margin: '0 0 12px', color: 'rgba(255,255,255,0.72)', fontSize: '13px', lineHeight: 1.5 }}>
                    Have a suggestion or found a bug? Let us know directly.
                </p>

                <div
                    style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        padding: '8px',
                        borderRadius: '16px',
                        background: 'rgba(13, 18, 44, 0.56)',
                        border: '1px solid rgba(129, 140, 248, 0.12)'
                    }}
                >
                    <input
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                if (!loading && text.trim()) {
                                    void handleSubmit();
                                }
                            }
                        }}
                        placeholder="Type your feedback here..."
                        style={{
                            flex: 1,
                            height: '44px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '12px',
                            padding: '0 14px',
                            color: 'white',
                            outline: 'none',
                            fontSize: '14px'
                        }}
                    />

                    <button
                        onClick={() => void handleSubmit()}
                        disabled={loading || !text.trim()}
                        className="primary-button"
                        style={{
                            width: '48px',
                            height: '48px',
                            minWidth: '48px',
                            borderRadius: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #7c7cff 0%, #8b5cf6 100%)',
                            boxShadow: '0 8px 20px rgba(124, 124, 255, 0.38)',
                            opacity: loading || !text.trim() ? 0.72 : 1
                        }}
                    >
                        <Send size={18} />
                    </button>
                </div>

                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Room {user.roomNumber} • {user.name}
                </div>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
                {repliedFeedbacks.length === 0 ? (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '20px',
                            borderRadius: '18px',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(20, 24, 58, 0.72) 100%)',
                            border: '1px solid rgba(255,255,255,0.06)'
                        }}
                    >
                        <Sparkles size={18} style={{ marginBottom: '10px' }} />
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                            Admin replies will appear here
                        </div>
                        <div style={{ fontSize: '14px' }}>
                            Once the hostel team answers, you’ll see the reply in this section.
                        </div>
                    </div>
                ) : (
                    repliedFeedbacks.map((feedback) => {
                        return (
                            <div
                                key={feedback.id}
                                className="glass-panel"
                                style={{
                                    padding: '18px',
                                    borderRadius: '18px',
                                    border: '1px solid rgba(129, 140, 248, 0.18)',
                                    background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.12) 0%, rgba(20, 24, 58, 0.9) 100%)',
                                    boxShadow: '0 18px 30px rgba(12, 18, 42, 0.22)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div
                                            style={{
                                                width: '42px',
                                                height: '42px',
                                                borderRadius: '14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.22) 0%, rgba(168, 85, 247, 0.18) 100%)',
                                                border: '1px solid rgba(129, 140, 248, 0.2)'
                                            }}
                                        >
                                            <Reply size={18} color="#c4b5fd" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: 'white' }}>Admin Reply</div>
                                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>
                                                Hostel team response
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '999px',
                                            fontSize: '12px',
                                            color: '#d6bcfa',
                                            background: 'rgba(129, 140, 248, 0.12)',
                                            border: '1px solid rgba(129, 140, 248, 0.16)'
                                        }}
                                    >
                                        {format(feedback.adminReply!.repliedAt, 'MMM d, HH:mm')}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        padding: '16px',
                                        borderRadius: '16px',
                                        background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.14) 0%, rgba(109, 40, 217, 0.08) 100%)',
                                        border: '1px solid rgba(129, 140, 248, 0.14)',
                                        color: 'white',
                                        lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap'
                                    }}
                                >
                                    {feedback.adminReply?.text}
                                </div>

                                <div
                                    style={{
                                        marginTop: '12px',
                                        padding: '12px 14px',
                                        borderRadius: '14px',
                                        background: 'rgba(10, 14, 38, 0.44)',
                                        border: '1px solid rgba(255,255,255,0.06)'
                                    }}
                                >
                                    <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.48)', marginBottom: '6px' }}>
                                        Your message
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontSize: '14px' }}>
                                        {feedback.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
