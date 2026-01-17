import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import { WashingMachine, ArrowRight, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Student } from '../types';

export default function LoginScreen() {
    const [step, setStep] = useState<1 | 1.5 | 2>(1);
    const [room, setRoom] = useState('');
    const [pin, setPin] = useState('');
    const [roommates, setRoommates] = useState<Student[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleRoomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const allStudents = await firestoreService.getAllStudents();
            if (allStudents.length === 0) {
                setError('No rooms found. The database may need to be seeded by an admin.');
                return;
            }
            const roomStudents = allStudents.filter(s => s.roomNumber === room);

            if (roomStudents.length > 0) {
                setRoommates(roomStudents);
                // Check if Room has PIN protection
                const roomPin = roomStudents[0].pin;
                if (roomPin) {
                    setStep(1.5); // Go to PIN step
                } else {
                    setStep(2); // Legacy/Unprotected flow
                }
            } else {
                setError('Room not found. Please check the number (e.g. 101, 52-2).');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to connect to database.');
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const correctPin = roommates[0]?.pin;
        if (pin === correctPin) {
            setStep(2);
        } else {
            setError('Incorrect Room PIN.');
        }
    };

    const handleStudentSelect = (student: Student) => {
        // Keep using bookingService for session management facade for now
        bookingService.setCurrentUser(student);
        navigate('/');
    };



    return (
        <div className="flex-center" style={{ minHeight: '100vh', padding: '20px', position: 'relative' }}>
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-panel"
                style={{ padding: '40px', width: '100%', maxWidth: '400px', borderRadius: '24px' }}
            >
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <div style={{
                        background: 'rgba(99, 102, 241, 0.2)',
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px auto'
                    }}>
                        <WashingMachine size={40} color="#818cf8" />
                    </div>
                    <h1 className="text-gradient" style={{ margin: 0, fontSize: '28px' }}>Hostel Wash</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Book your laundry slot</p>
                </div>

                <AnimatePresence mode="wait">
                    {step === 1 ? (
                        <motion.form
                            key="step1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            onSubmit={handleRoomSubmit}
                        >
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '8px', fontSize: '14px' }}>
                                    Room Number
                                </label>
                                <input
                                    type="text"
                                    value={room}
                                    onChange={(e) => setRoom(e.target.value)}
                                    placeholder="e.g. 101, 52-2"
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        borderRadius: '12px',
                                        background: 'var(--glass-bg)',
                                        border: '1px solid var(--glass-border)',
                                        color: 'var(--text-main)',
                                        fontSize: '18px',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                {error && <p style={{ color: 'var(--error)', fontSize: '14px', marginTop: '8px' }}>{error}</p>}
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="primary-button"
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    fontSize: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    opacity: loading ? 0.7 : 1
                                }}
                            >
                                {loading ? 'Checking...' : 'Find Room'} <ArrowRight size={18} />
                            </button>
                        </motion.form>
                    ) : step === 1.5 ? (
                        <motion.form
                            key="step1.5"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onSubmit={handlePinSubmit}
                        >
                            <p style={{ textAlign: 'center', marginBottom: '16px' }}>Enter Room PIN</p>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
                                <input
                                    type="text" // Using text to avoid scrolling
                                    inputMode="numeric"
                                    maxLength={3}
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="000"
                                    autoFocus
                                    style={{
                                        width: '120px',
                                        padding: '16px',
                                        fontSize: '24px',
                                        textAlign: 'center',
                                        letterSpacing: '8px',
                                        borderRadius: '12px',
                                        border: '1px solid var(--glass-border)',
                                        background: 'var(--glass-bg)',
                                        color: 'var(--text-main)',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                            {error && <p style={{ color: 'var(--error)', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>{error}</p>}

                            <button
                                type="submit"
                                className="primary-button"
                                style={{ width: '100%', padding: '16px', borderRadius: '12px' }}
                            >
                                Verify PIN
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', width: '100%', marginTop: '20px', cursor: 'pointer' }}
                            >
                                Back
                            </button>
                        </motion.form>
                    ) : (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <p style={{ textAlign: 'center', marginBottom: '16px' }}>Who are you?</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {roommates.map(student => (
                                    <button
                                        key={student.id}
                                        onClick={() => handleStudentSelect(student)}
                                        className="glass-button"
                                        style={{
                                            width: '100%',
                                            padding: '16px',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            textAlign: 'left'
                                        }}
                                    >
                                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '50%' }}>
                                            <User size={20} />
                                        </div>
                                        <span style={{ fontSize: '16px', fontWeight: 500 }}>{student.name}</span>
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setStep(1)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', width: '100%', marginTop: '20px', cursor: 'pointer' }}
                            >
                                Back to Search
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', marginTop: '24px' }}>
                    Strictly for Hostel Residents Only
                </p>
            </motion.div>

        </div >
    );
}
