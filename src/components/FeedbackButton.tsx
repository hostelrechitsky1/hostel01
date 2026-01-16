import { useState } from 'react';
import FeedbackModal from './FeedbackModal';

export default function FeedbackButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
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
                    boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37)',
                    zIndex: 50
                }}
            >
                <div style={{ fontSize: '24px' }}>💬</div>
            </button>
            <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
}
