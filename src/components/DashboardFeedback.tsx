import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
    Bug,
    CheckCircle2,
    Clock3,
    Lightbulb,
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

const feedbackTypeMeta: Record<FeedbackType, { label: string; color: string; background: string; border: string }> = {
    bug: {
        label: 'Bug',
        color: '#f87171',
        background: 'rgba(239, 68, 68, 0.14)',
        border: 'rgba(239, 68, 68, 0.22)'
    },
    feature: {
        label: 'Suggestion',
        color: '#60a5fa',
        background: 'rgba(59, 130, 246, 0.14)',
        border: 'rgba(59, 130, 246, 0.22)'
    },
    other: {
        label: 'Feedback',
        color: '#c4b5fd',
        background: 'rgba(139, 92, 246, 0.14)',
        border: 'rgba(139, 92, 246, 0.22)'
    }
};

const getFeedbackTypeIcon = (type: FeedbackType) => {
    if (type === 'bug') return Bug;
    if (type === 'feature') return Lightbulb;
    return Sparkles;
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
    const [type, setType] = useState<FeedbackType>('feature');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [feedbacks, setFeedbacks] = useState<Feedback[]>(() => cachedFeedbacks ?? []);

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
        if (!text.trim() || !user) return;

        setLoading(true);

        try {
            await firestoreService.addFeedback({
                id: Date.now().toString(),
                studentId: user.id,
                studentName: user.name,
                roomNumber: user.roomNumber,
                text: text.trim(),
                type,
                timestamp: Date.now(),
                read: false
            });

            setSuccess(true);
            setText('');
            setType('feature');
            toast.success('Feedback sent! Replies will appear here.');
            window.setTimeout(() => setSuccess(false), 2400);
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={20} /> Feedback Center
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Admin replies will show up here automatically
                </div>
            </div>

            <div
                className="glass-panel"
                style={{
                    padding: '20px',
                    borderRadius: '20px',
                    marginBottom: '18px',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(15, 23, 42, 0.35) 100%)',
                    border: '1px solid rgba(96, 165, 250, 0.2)'
                }}
            >
                <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
                    Share a bug, suggestion, or any issue with the hostel app. When the team replies, the answer will appear below.
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    {(Object.keys(feedbackTypeMeta) as FeedbackType[]).map((option) => {
                        const meta = feedbackTypeMeta[option];
                        const Icon = getFeedbackTypeIcon(option);

                        return (
                            <button
                                key={option}
                                onClick={() => setType(option)}
                                className={type === option ? 'primary-button' : 'glass-button'}
                                style={{
                                    padding: '9px 14px',
                                    borderRadius: '999px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: type === option ? meta.color : meta.background,
                                    color: 'white',
                                    border: type === option ? 'none' : `1px solid ${meta.border}`
                                }}
                            >
                                <Icon size={15} />
                                {meta.label}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                    <textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="Tell us what happened or what you would like to improve..."
                        style={{
                            width: '100%',
                            minHeight: '110px',
                            background: 'rgba(0,0,0,0.18)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '16px',
                            padding: '14px 16px',
                            color: 'white',
                            outline: 'none',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                            fontSize: '15px',
                            lineHeight: 1.5
                        }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Room {user.roomNumber} • {user.name}
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={loading || !text.trim() || success}
                            className="primary-button"
                            style={{
                                padding: '12px 18px',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                minWidth: '150px',
                                opacity: loading || !text.trim() ? 0.75 : 1,
                                background: success ? 'var(--success)' : 'var(--primary)'
                            }}
                        >
                            {success ? (
                                <>
                                    <CheckCircle2 size={18} />
                                    Sent
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    {loading ? 'Sending...' : 'Send Feedback'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
                {feedbacks.length === 0 ? (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '24px',
                            borderRadius: '18px',
                            textAlign: 'center',
                            color: 'var(--text-muted)'
                        }}
                    >
                        <MessageSquare size={20} style={{ marginBottom: '10px' }} />
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                            No feedback yet
                        </div>
                        <div style={{ fontSize: '14px' }}>
                            Your sent messages and admin replies will appear here.
                        </div>
                    </div>
                ) : (
                    feedbacks.map((feedback) => {
                        const meta = feedbackTypeMeta[feedback.type];
                        const Icon = getFeedbackTypeIcon(feedback.type);
                        const hasReply = Boolean(feedback.adminReply?.text?.trim());

                        return (
                            <div
                                key={feedback.id}
                                className="glass-panel"
                                style={{
                                    padding: '18px',
                                    borderRadius: '18px',
                                    border: hasReply ? '1px solid rgba(16, 185, 129, 0.25)' : `1px solid ${meta.border}`,
                                    background: hasReply
                                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.28) 100%)'
                                        : 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(15, 23, 42, 0.24) 100%)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 10px',
                                                borderRadius: '999px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color: meta.color,
                                                background: meta.background,
                                                border: `1px solid ${meta.border}`
                                            }}
                                        >
                                            <Icon size={14} />
                                            {meta.label}
                                        </span>
                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 10px',
                                                borderRadius: '999px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color: hasReply ? '#6ee7b7' : '#fbbf24',
                                                background: hasReply ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                                                border: hasReply ? '1px solid rgba(16, 185, 129, 0.22)' : '1px solid rgba(245, 158, 11, 0.22)'
                                            }}
                                        >
                                            {hasReply ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                                            {hasReply ? 'Admin replied' : 'Waiting for reply'}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {format(feedback.timestamp, 'MMM d, HH:mm')}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        padding: '14px 16px',
                                        borderRadius: '14px',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        color: 'var(--text-main)',
                                        lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap'
                                    }}
                                >
                                    {feedback.text}
                                </div>

                                {hasReply && (
                                    <div
                                        style={{
                                            marginTop: '14px',
                                            padding: '16px',
                                            borderRadius: '16px',
                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(16, 185, 129, 0.06) 100%)',
                                            border: '1px solid rgba(16, 185, 129, 0.2)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#a7f3d0' }}>
                                                <Reply size={16} />
                                                Hostel reply
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.72)' }}>
                                                {format(feedback.adminReply!.repliedAt, 'MMM d, HH:mm')}
                                            </div>
                                        </div>

                                        <div style={{ color: 'white', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                            {feedback.adminReply?.text}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
