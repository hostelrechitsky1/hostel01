import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { Building, ArrowRight, User } from 'lucide-react';
import { toast } from 'sonner';
import type { Student } from '../types';
import { preloadResidentRoutes } from '../utils/preloadRoutes';
import { finishResidentPerfSpan, startResidentPerfSpan } from '../utils/performance';
import { warmResidentAppData } from '../utils/warmResidentApp';

let residentLookupPromise: Promise<typeof import('../services/residentRoomLookupService')> | null = null;

const loadResidentLookup = () => {
    residentLookupPromise ??= import('../services/residentRoomLookupService');
    return residentLookupPromise;
};

export default function LoginScreen() {
    const [step, setStep] = useState<1 | 1.5 | 2>(1);
    const [room, setRoom] = useState('');
    const [pin, setPin] = useState('');
    const [roommates, setRoommates] = useState<Student[]>([]);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const startWarmup = () => {
            void loadResidentLookup();
        };

        const idleWindow = window as Window & typeof globalThis & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            const idleId = idleWindow.requestIdleCallback(startWarmup, { timeout: 900 });
            return () => idleWindow.cancelIdleCallback?.(idleId);
        }

        const timeoutId = window.setTimeout(startWarmup, 250);
        return () => window.clearTimeout(timeoutId);
    }, []);

    const handleRoomFieldFocus = () => {
        void loadResidentLookup();
    };

    const handleRoomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        startResidentPerfSpan('resident:login-room-lookup');

        try {
            const { residentRoomLookupService } = await loadResidentLookup();
            const hadCachedRoom = residentRoomLookupService.getCachedStudentsByRoom(room) !== undefined;
            const roomStudents = await residentRoomLookupService.getStudentsByRoom(room);
            finishResidentPerfSpan('resident:login-room-lookup', {
                result: roomStudents.length > 0 ? 'found' : 'empty',
                source: hadCachedRoom ? 'cache' : 'network',
            });

            if (roomStudents.length > 0) {
                setRoommates(roomStudents);
                bookingService.setCurrentRoommates(roomStudents);
                preloadResidentRoutes();
                void warmResidentAppData();
                // Check if Room has PIN protection
                const roomPin = roomStudents[0].pin;
                if (roomPin) {
                    setStep(1.5); // Go to PIN step
                } else {
                    setStep(2); // Legacy/Unprotected flow
                }
            } else {
                toast.error('Room not found. Please check the number (e.g. 101, 52-2).');
            }
        } catch (err) {
            finishResidentPerfSpan('resident:login-room-lookup', {
                result: 'error',
            });
            console.error(err);
            toast.error('Failed to connect to database.');
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
            toast.error('Incorrect Room PIN.');
        }
    };

    const handleStudentSelect = (student: Student) => {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
            activeElement.blur();
        }

        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;

        // Keep using bookingService for session management facade for now
        bookingService.setCurrentUser(student);
        bookingService.setCurrentRoommates(roommates);
        preloadResidentRoutes();
        void warmResidentAppData(student.id);
        startResidentPerfSpan('resident:login-to-dashboard-shell');
        startResidentPerfSpan('resident:login-to-dashboard-data');
        startResidentPerfSpan('resident:dashboard-banner-ready');

        requestAnimationFrame(() => {
            navigate('/', { replace: true });
        });
    };



    return (
        <div className="login-split">
            <div className="login-left">
                <div
                    className="glass-panel animate-fade-in"
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
                        <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Hostel Residents Only</p>
                    </div>

                    {step === 1 ? (
                        <form className="animate-fade-in" onSubmit={handleRoomSubmit}>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '8px', fontSize: '14px' }}>
                                        Room Number
                                    </label>
                                    <input
                                        type="text"
                                        value={room}
                                        onChange={(e) => setRoom(e.target.value)}
                                        onFocus={handleRoomFieldFocus}
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
                        </form>
                    ) : step === 1.5 ? (
                        <form className="animate-fade-in" onSubmit={handlePinSubmit}>
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
                        </form>
                    ) : (
                        <div className="animate-fade-in">
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
                        </div>
                    )}

                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', marginTop: '24px' }}>
                        Strictly for Hostel Residents Only
                    </p>
                </div>
            </div>

        </div>
    );
}
