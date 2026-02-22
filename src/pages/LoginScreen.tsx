import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import { Building, ArrowRight, User, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Student } from '../types';

export default function LoginScreen() {
    const [step, setStep] = useState<1 | 1.5 | 2>(1);
    const [room, setRoom] = useState('');
    const [pin, setPin] = useState('');
    const [roommates, setRoommates] = useState<Student[]>([]);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');


    const handleRoomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const allStudents = await firestoreService.getAllStudents();
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
        <div className="login-split">
            <div className="login-left">
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
                            <Building size={40} color="#818cf8" />
                        </div>
                        <h1 className="text-gradient" style={{ margin: 0, fontSize: '28px' }}>Hostel Portal</h1>
                        <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Access laundry & study materials</p>
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
                                        autoComplete="off"
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
                                        type="password"
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
            </div>

            <div className="login-right">
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    onClick={() => navigate('/study')}
                    className="glass-panel"
                    style={{
                        padding: '40px',
                        width: '100%',
                        maxWidth: '480px',
                        borderRadius: '32px',
                        cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        border: '1px solid rgba(168, 85, 247, 0.2)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                    }}
                >
                    <div style={{ position: 'relative', marginBottom: '32px' }}>
                        {/* Glowing background ring */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '120px',
                            height: '120px',
                            background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
                            borderRadius: '50%',
                            opacity: 0.2,
                            filter: 'blur(20px)',
                            animation: 'glow-pulse 4s ease-in-out infinite'
                        }} />

                        <div className="glass-panel" style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            position: 'relative',
                            zIndex: 1,
                            animation: 'float 6s ease-in-out infinite'
                        }}>
                            <BookOpen size={40} color="#a855f7" />
                        </div>
                    </div>

                    <h2 style={{ fontSize: '28px', marginBottom: '16px', background: 'linear-gradient(135deg, var(--text-main) 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Premium Study Hub
                    </h2>

                    <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: '1.6', marginBottom: '32px' }}>
                        Access notes, past papers, and study materials without needing to log in. Prepared by students, for students.
                    </p>

                    <button className="primary-button" style={{
                        padding: '16px 32px',
                        borderRadius: '16px',
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        Enter Study Hub <ArrowRight size={18} />
                    </button>

                    <style>
                        {`
                            @keyframes float {
                                0%, 100% { transform: translateY(0px); }
                                50% { transform: translateY(-8px); }
                            }
                            @keyframes glow-pulse {
                                0%, 100% { opacity: 0.15; transform: translate(-50%, -50%) scale(1); }
                                50% { opacity: 0.3; transform: translate(-50%, -50%) scale(1.15); }
                            }
                        `}
                    </style>
                </motion.div>
            </div>

        </div>
    );
}
