import { firestoreService } from '../services/firestoreService';
import { bookingService } from '../services/bookingService';

export default function FeedbackButton() {
    return (
        <button
            onClick={() => {
                const user = bookingService.getCurrentUser();
                const type = prompt("What kind of feedback? (Type 'bug', 'feature', or 'other')")?.toLowerCase();

                if (type && ['bug', 'feature', 'other'].includes(type)) {
                    const text = prompt("Tell us more:");
                    if (text) {
                        const fb = {
                            id: Date.now().toString(),
                            studentName: user?.name || 'Anonymous',
                            roomNumber: user?.roomNumber || '?',
                            text,
                            type: type as 'bug' | 'feature' | 'other',
                            timestamp: Date.now(),
                            read: false
                        };
                        firestoreService.addFeedback(fb).then(() => alert("Feedback Sent! Thank you."));
                    }
                } else if (type) {
                    alert("Invalid type. Please type 'bug', 'feature', or 'other'.");
                }
            }}
            className="glass-button"
            style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                borderRadius: '50%',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37)'
            }}
        >
            <div style={{ fontSize: '24px' }}>💬</div>
        </button>
    );
}
