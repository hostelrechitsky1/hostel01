import { useEffect, useMemo, useState } from 'react';
import {
    MessageSquare,
    Reply,
    Send
} from 'lucide-react';
import { bookingService } from '../services/bookingService';
import { residentFirestoreService } from '../services/residentFirestoreService';
import type { Feedback, FeedbackType } from '../types';
import { formatBelarusCompactTimestamp } from '../utils/time';
import { notifyError, notifySuccess } from '../utils/notify';
import { getResidentPortalDateLocale } from '../utils/residentPortalLanguage';
import { getResidentNameForLanguage } from '../utils/residentNames';

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

export default function DashboardFeedback({ isRussian = false }: { isRussian?: boolean }) {
    const user = bookingService.getCurrentUser();
    const dateLocale = getResidentPortalDateLocale(isRussian ? 'ru' : 'en');
    const t = isRussian
        ? {
            heading: 'Обратная связь',
            prompt: 'Есть предложение или нашли ошибку? Напишите нам напрямую.',
            placeholder: 'Введите сообщение...',
            roomLabel: (roomNumber: string) => `Комната ${roomNumber}`,
            sent: 'Сообщение отправлено. Ответы администрации появятся ниже.',
            failed: 'Не удалось отправить сообщение.',
            hostelTeam: 'Команда общежития',
            repliedToFeedback: 'Ответ на ваше сообщение',
            yourFeedback: 'Ваше сообщение',
        }
        : {
            heading: 'Feedback',
            prompt: 'Have a suggestion or found a bug? Let us know directly.',
            placeholder: 'Type your feedback here...',
            roomLabel: (roomNumber: string) => `Room ${roomNumber}`,
            sent: 'Feedback sent. Admin replies will appear below.',
            failed: 'Failed to send feedback.',
            hostelTeam: 'Hostel Team',
            repliedToFeedback: 'Replied to your feedback',
            yourFeedback: 'Your feedback',
        };
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
            notifySuccess(t.sent);
        } catch (error) {
            console.error('Failed to send feedback', error);
            notifyError(t.failed);
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div style={{ marginTop: '40px', paddingBottom: '40px' }}>
            <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} />
                {t.heading}
            </h3>

            <div
                className="glass-panel"
                style={{
                    padding: '16px',
                    borderRadius: '18px',
                    marginBottom: '18px',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)'
                }}
            >
                <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
                    {t.prompt}
                </p>

                <div
                    style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        padding: '8px',
                        borderRadius: '16px',
                        background: 'rgba(148, 163, 184, 0.12)',
                        border: '1px solid rgba(148, 163, 184, 0.22)'
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
                        placeholder={t.placeholder}
                        style={{
                            flex: 1,
                            height: '44px',
                            background: 'rgba(148, 163, 184, 0.12)',
                            border: '1px solid rgba(148, 163, 184, 0.22)',
                            borderRadius: '12px',
                            padding: '0 14px',
                            color: 'var(--text-main)',
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
                            background: 'linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%)',
                            boxShadow: '0 8px 20px var(--primary-glow)',
                            opacity: loading || !text.trim() ? 0.72 : 1
                        }}
                    >
                        <Send size={18} />
                    </button>
                </div>

                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {t.roomLabel(user.roomNumber)} • {getResidentNameForLanguage(user.name, isRussian)}
                </div>
            </div>

            {repliedFeedbacks.length > 0 && (
                <div style={{ display: 'grid', gap: '14px' }}>
                    {repliedFeedbacks.map((feedback) => {
                        return (
                            <div
                                key={feedback.id}
                                className="glass-panel"
                                style={{
                                    padding: '18px',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(99, 102, 241, 0.18)',
                                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(14, 165, 233, 0.05) 100%)',
                                    boxShadow: '0 12px 26px rgba(15, 23, 42, 0.12)'
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
                                                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(14, 165, 233, 0.14) 100%)',
                                                border: '1px solid rgba(99, 102, 241, 0.22)',
                                                boxShadow: '0 8px 18px rgba(79, 70, 229, 0.14)'
                                            }}
                                        >
                                            <Reply size={18} color="var(--primary)" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{t.hostelTeam}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {t.repliedToFeedback}
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '999px',
                                            fontSize: '12px',
                                            color: 'var(--primary)',
                                            background: 'rgba(99, 102, 241, 0.1)',
                                            border: '1px solid rgba(99, 102, 241, 0.16)'
                                        }}
                                    >
                                        {formatBelarusCompactTimestamp(new Date(feedback.adminReply!.repliedAt), dateLocale)}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        position: 'relative',
                                        padding: '16px 16px 16px 18px',
                                        borderRadius: '18px',
                                        background: 'rgba(99, 102, 241, 0.1)',
                                        border: '1px solid rgba(99, 102, 241, 0.16)',
                                        color: 'var(--text-main)',
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
                                            background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.9) 0%, rgba(14, 165, 233, 0.35) 100%)'
                                        }}
                                    />
                                    {feedback.adminReply?.text}
                                </div>

                                <div
                                    style={{
                                        marginTop: '12px',
                                        padding: '12px 14px',
                                        borderRadius: '16px',
                                        background: 'rgba(148, 163, 184, 0.1)',
                                        border: '1px solid rgba(148, 163, 184, 0.2)'
                                    }}
                                >
                                    <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                        {t.yourFeedback}
                                    </div>
                                    <div style={{ color: 'var(--text-main)', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontSize: '14px' }}>
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
