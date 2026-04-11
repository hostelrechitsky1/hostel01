import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
    MessageSquare,
    Reply,
    Send
} from 'lucide-react';
import { toast } from 'sonner';
import { bookingService } from '../services/bookingService';
import { residentFirestoreService } from '../services/residentFirestoreService';
import type { Feedback, FeedbackType } from '../types';

const FEEDBACK_HISTORY_LIMIT = 8;
let residentLiveServicePromise: Promise<typeof import('../services/residentLiveService')> | null = null;
let residentMutationsServicePromise: Promise<typeof import('../services/residentMutationsService')> | null = null;

const loadResidentLiveService = () => {
    residentLiveServicePromise ??= import('../services/residentLiveService');
    return residentLiveServicePromise;
};

const loadResidentMutationsService = () => {
    residentMutationsServicePromise ??= import('../services/residentMutationsService');
    return residentMutationsServicePromise;
};

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
        return residentFirestoreService.getCachedFeedbacksForResident(
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

        let isMounted = true;
        let unsubscribeFeedbacks = () => { /* noop */ };
        let liveAttachTimeoutId: number | null = null;

        if (!cachedFeedbacks) {
            void residentFirestoreService.getFeedbacksForResident(
                user.id ?? '',
                user.name,
                user.roomNumber,
                FEEDBACK_HISTORY_LIMIT
            ).then((nextFeedbacks) => {
                if (!isMounted) return;
                setFeedbacks(nextFeedbacks);
            }).catch((error) => {
                console.error('Failed to fetch resident feedback', error);
            });
        }

        liveAttachTimeoutId = window.setTimeout(() => {
            void loadResidentLiveService()
                .then(({ residentLiveService }) => {
                    if (!isMounted) return;

                    unsubscribeFeedbacks = residentLiveService.subscribeToFeedbacksForResident(
                        user.id ?? '',
                        user.name,
                        user.roomNumber,
                        FEEDBACK_HISTORY_LIMIT,
                        setFeedbacks,
                        (error) => {
                            console.error('Failed to subscribe to resident feedback', error);
                        }
                    );
                })
                .catch((error) => {
                    console.error('Failed to attach resident feedback live stream', error);
                });
        }, 260);

        return () => {
            isMounted = false;
            if (liveAttachTimeoutId !== null) {
                window.clearTimeout(liveAttachTimeoutId);
            }
            unsubscribeFeedbacks();
        };
    }, [user?.id, user?.name, user?.roomNumber]);

    const handleSubmit = async () => {
        const trimmedText = text.trim();
        if (!trimmedText || !user) return;

        setLoading(true);

        try {
            const { residentMutationsService } = await loadResidentMutationsService();
            await residentMutationsService.addFeedback({
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

            {repliedFeedbacks.length > 0 && (
                <div style={{ display: 'grid', gap: '14px' }}>
                    {repliedFeedbacks.map((feedback, index) => {
                        return (
                            <div
                                key={feedback.id}
                                className="glass-panel"
                                style={{
                                    padding: '18px',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(129, 140, 248, 0.18)',
                                    background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.14) 0%, rgba(20, 24, 58, 0.92) 52%, rgba(88, 28, 135, 0.24) 100%)',
                                    boxShadow: '0 20px 36px rgba(8, 12, 32, 0.3)',
                                    animationDelay: `${Math.min(index * 0.08, 0.18)}s`
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div
                                            style={{
                                                width: '46px',
                                                height: '46px',
                                                borderRadius: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.24) 0%, rgba(217, 70, 239, 0.2) 100%)',
                                                border: '1px solid rgba(196, 181, 253, 0.2)',
                                                boxShadow: '0 10px 24px rgba(124, 58, 237, 0.2)'
                                            }}
                                        >
                                            <Reply size={18} color="#ddd6fe" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: 'white' }}>Hostel Team</div>
                                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.62)' }}>
                                                Replied to your feedback
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '999px',
                                            fontSize: '12px',
                                            color: '#e9d5ff',
                                            background: 'rgba(139, 92, 246, 0.14)',
                                            border: '1px solid rgba(196, 181, 253, 0.14)'
                                        }}
                                    >
                                        {format(feedback.adminReply!.repliedAt, 'MMM d, HH:mm')}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        position: 'relative',
                                        padding: '16px 16px 16px 18px',
                                        borderRadius: '18px',
                                        background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.18) 0%, rgba(76, 29, 149, 0.18) 100%)',
                                        border: '1px solid rgba(196, 181, 253, 0.12)',
                                        color: 'white',
                                        lineHeight: 1.7,
                                        whiteSpace: 'pre-wrap',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 12,
                                            bottom: 12,
                                            width: '4px',
                                            borderRadius: '999px',
                                            background: 'linear-gradient(180deg, rgba(196, 181, 253, 0.95) 0%, rgba(129, 140, 248, 0.35) 100%)'
                                        }}
                                    />
                                    {feedback.adminReply?.text}
                                </div>

                                <div
                                    style={{
                                        marginTop: '12px',
                                        padding: '12px 14px',
                                        borderRadius: '16px',
                                        background: 'rgba(8, 12, 32, 0.34)',
                                        border: '1px solid rgba(255,255,255,0.06)'
                                    }}
                                >
                                    <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.48)', marginBottom: '6px' }}>
                                        Your feedback
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontSize: '14px' }}>
                                        {feedback.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
