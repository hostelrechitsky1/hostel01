import { useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import { bookingService } from '../services/bookingService';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
    const [type, setType] = useState<'bug' | 'feature' | 'other'>('feature');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        if (!text.trim()) return;
        setLoading(true);
        const user = bookingService.getCurrentUser();

        try {
            await firestoreService.addFeedback({
                id: Date.now().toString(),
                studentName: user?.name || 'Anonymous',
                roomNumber: user?.roomNumber || '?',
                text,
                type,
                timestamp: Date.now(),
                read: false
            });
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setText('');
                setType('feature'); // Reset to default
                onClose();
            }, 2000);
        } catch (error) {
            alert('Failed to send feedback. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)'
                }}>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="glass-panel"
                        style={{
                            width: '90%', maxWidth: '400px',
                            background: 'rgba(15, 23, 42, 0.95)', // Solid back for modal
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '24px', padding: '24px',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                        }}
                    >
                        {success ? (
                            <div className="flex-center" style={{ flexDirection: 'column', padding: '40px 0' }}>
                                <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '20px', borderRadius: '50%', marginBottom: '16px' }}>
                                    <Check size={40} color="#10b981" />
                                </div>
                                <h3>Feedback Sent!</h3>
                                <p style={{ color: 'var(--text-muted)' }}>Thanks for improving the hostel.</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h3 style={{ margin: 0 }}>Send Feedback</h3>
                                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                        <X size={24} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                                    {(['bug', 'feature', 'other'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setType(t)}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                borderRadius: '12px',
                                                border: '1px solid',
                                                borderColor: type === t
                                                    ? t === 'bug' ? '#ef4444' : t === 'feature' ? '#3b82f6' : '#6b7280'
                                                    : 'rgba(255,255,255,0.1)',
                                                background: type === t
                                                    ? t === 'bug' ? 'rgba(239, 68, 68, 0.2)' : t === 'feature' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(107, 114, 128, 0.2)'
                                                    : 'rgba(255,255,255,0.05)',
                                                color: type === t ? 'white' : 'var(--text-muted)',
                                                textTransform: 'capitalize',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                fontSize: '14px',
                                                fontWeight: 500
                                            }}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    placeholder="Tell us what you think..."
                                    style={{
                                        width: '100%', height: '120px',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '16px',
                                        padding: '16px',
                                        color: 'white',
                                        marginBottom: '24px',
                                        fontSize: '17px',
                                        resize: 'none',
                                        boxSizing: 'border-box',
                                        outline: 'none',
                                        appearance: 'none',
                                        WebkitAppearance: 'none'
                                    }}
                                />

                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || !text.trim()}
                                    className="primary-button"
                                    style={{
                                        width: '100%', padding: '14px', borderRadius: '16px',
                                        opacity: (!text.trim() || loading) ? 0.5 : 1
                                    }}
                                >
                                    {loading ? 'Sending...' : 'Send Feedback'}
                                </button>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
