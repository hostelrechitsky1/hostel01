import { useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import { bookingService } from '../services/bookingService';
import { Send, MessageSquare } from 'lucide-react';

export default function DashboardFeedback() {
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
                type: 'other', // Default simple type
                timestamp: Date.now(),
                read: false
            });
            setSuccess(true);
            setText('');
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            alert('Failed to send feedback.');
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
        </div>
    );
}
