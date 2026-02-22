import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import { Building, ArrowRight, User, BookOpen, Sparkles } from 'lucide-react';
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
                    style={{
                        padding: '48px',
                        width: '100%',
                        maxWidth: '460px',
                        minHeight: '520px',
                        borderRadius: '32px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    }}
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

            <div className="login-right" style={{ position: 'relative', overflow: 'hidden' }}>
                {/* Background decorative elements for the right side */}
                <div style={{
                    position: 'absolute', top: '10%', right: '20%', width: '300px', height: '300px',
                    background: 'rgba(168, 85, 247, 0.15)', filter: 'blur(80px)', borderRadius: '50%',
                    animation: 'blob-float 15s infinite alternate ease-in-out', zIndex: 0
                }} />
                <div style={{
                    position: 'absolute', bottom: '10%', left: '10%', width: '250px', height: '250px',
                    background: 'rgba(56, 189, 248, 0.1)', filter: 'blur(80px)', borderRadius: '50%',
                    animation: 'blob-float 20s infinite alternate-reverse ease-in-out', zIndex: 0
                }} />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 100, damping: 20 }}
                    onClick={() => navigate('/study')}
                    className="glass-panel"
                    style={{
                        padding: '48px',
                        width: '100%',
                        maxWidth: '460px',
                        minHeight: '520px',
                        borderRadius: '32px',
                        cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2), inset 0 2px 20px rgba(255,255,255,0.05)',
                        position: 'relative',
                        zIndex: 1,
                        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 30px 60px rgba(0,0,0,0.3), inset 0 2px 20px rgba(255,255,255,0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.2), inset 0 2px 20px rgba(255,255,255,0.05)';
                    }}
                >
                    <div style={{ position: 'relative', marginBottom: '40px' }}>
                        {/* Glowing background ring */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '140px',
                            height: '140px',
                            background: 'linear-gradient(135deg, var(--primary) 0%, #ec4899 100%)',
                            borderRadius: '50%',
                            opacity: 0.25,
                            filter: 'blur(30px)',
                            animation: 'glow-pulse 4s ease-in-out infinite'
                        }} />

                        <div className="glass-panel" style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                            boxShadow: 'inset 0 2px 20px rgba(255,255,255,0.1)',
                            position: 'relative',
                            zIndex: 1,
                            animation: 'float 6s ease-in-out infinite',
                            color: 'var(--primary)'
                        }}>
                            <BookOpen size={48} color="currentColor" />
                            <div style={{
                                position: 'absolute',
                                top: '-10px',
                                right: '-10px',
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                borderRadius: '50%',
                                padding: '8px',
                                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
                            }}>
                                <Sparkles size={16} color="#fff" />
                            </div>
                        </div>
                    </div>

                    <h2 style={{
                        fontSize: '32px',
                        fontWeight: 800,
                        marginBottom: '16px',
                        letterSpacing: '-0.02em',
                        background: 'linear-gradient(135deg, var(--text-main) 0%, #a855f7 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        The Future of Learning
                    </h2>

                    <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: '1.6', marginBottom: '40px' }}>
                        Access curated notes, past papers, and study materials from previous semesters without needing to log in.
                    </p>

                    <button className="primary-button" style={{
                        padding: '16px 36px',
                        borderRadius: '16px',
                        fontSize: '16px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
                        boxShadow: '0 8px 20px rgba(168, 85, 247, 0.3)'
                    }}>
                        Explore Study Hub <ArrowRight size={20} />
                    </button>

                    <style>
                        {`
                            @keyframes blob-float {
                                0% { transform: translate(0, 0) scale(1); }
                                100% { transform: translate(30px, 50px) scale(1.1); }
                            }
                            @keyframes float {
                                0%, 100% { transform: translateY(0px); }
                                50% { transform: translateY(-10px); }
                            }
                            @keyframes glow-pulse {
                                0%, 100% { opacity: 0.2; transform: translate(-50%, -50%) scale(1); }
                                50% { opacity: 0.4; transform: translate(-50%, -50%) scale(1.1); }
                            }
                        `}
                    </style>
                </motion.div>
            </div>

        </div>
    );
}
