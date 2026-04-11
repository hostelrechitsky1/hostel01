import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { Building, ArrowRight, Languages, User } from 'lucide-react';
import { ActionSpinner } from '../components/ActionSpinner';
import type { Student } from '../types';
import { preloadResidentRoutes } from '../utils/preloadRoutes';
import { finishResidentPerfSpan, startResidentPerfSpan } from '../utils/performance';
import { warmResidentAppData } from '../utils/warmResidentApp';
import { notifyError } from '../utils/notify';
import { getResidentPortalLanguage, setResidentPortalLanguage, type ResidentPortalLanguage } from '../utils/residentPortalLanguage';
import { getResidentNameForLanguage } from '../utils/residentNames';

let residentLookupPromise: Promise<typeof import('../services/residentRoomLookupService')> | null = null;
const RESIDENT_FORCE_TOP_AFTER_LOGIN_KEY = 'resident_force_top_after_login';

const loadResidentLookup = () => {
    residentLookupPromise ??= import('../services/residentRoomLookupService');
    return residentLookupPromise;
};

const resetPageScroll = () => {
    if (typeof window === 'undefined') return;

    const scrollingElement = document.scrollingElement ?? document.documentElement;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
};

export default function LoginScreen() {
    const [language, setLanguage] = useState<ResidentPortalLanguage>(() => getResidentPortalLanguage());
    const [step, setStep] = useState<1 | 1.5 | 2>(1);
    const [room, setRoom] = useState('');
    const [pin, setPin] = useState('');
    const [roommates, setRoommates] = useState<Student[]>([]);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [selectingStudentId, setSelectingStudentId] = useState<string | null>(null);
    const isRussian = language === 'ru';
    const t = isRussian
        ? {
            portalTitle: 'Портал общежития',
            portalSubtitle: 'Только для жильцов общежития',
            switchLanguage: 'English',
            roomLabel: 'Номер комнаты',
            roomPlaceholder: 'например, 101, 52-2',
            checking: 'Проверяем...',
            findRoom: 'Найти комнату',
            enterRoomPin: 'Введите PIN комнаты',
            pinPlaceholder: '000',
            verifyPin: 'Проверить PIN',
            back: 'Назад',
            whoAreYou: 'Кто вы?',
            backToSearch: 'Вернуться к поиску',
            residentsOnly: 'Строго только для жильцов общежития',
            roomNotFound: 'Комната не найдена. Проверьте номер, например 101 или 52-2.',
            failedToConnect: 'Не удалось подключиться к базе данных.',
            incorrectPin: 'Неверный PIN комнаты.',
        }
        : {
            portalTitle: 'Hostel Portal',
            portalSubtitle: 'Hostel Residents Only',
            switchLanguage: 'Русский',
            roomLabel: 'Room Number',
            roomPlaceholder: 'e.g. 101, 52-2',
            checking: 'Checking...',
            findRoom: 'Find Room',
            enterRoomPin: 'Enter Room PIN',
            pinPlaceholder: '000',
            verifyPin: 'Verify PIN',
            back: 'Back',
            whoAreYou: 'Who are you?',
            backToSearch: 'Back to Search',
            residentsOnly: 'Strictly for Hostel Residents Only',
            roomNotFound: 'Room not found. Please check the number (e.g. 101, 52-2).',
            failedToConnect: 'Failed to connect to database.',
            incorrectPin: 'Incorrect Room PIN.',
        };

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

    useEffect(() => {
        if (step !== 2 || roommates.length === 0 || typeof window === 'undefined') {
            return;
        }

        let cancelled = false;
        const warmRoommates = () => {
            roommates.slice(0, 4).forEach((student) => {
                void warmResidentAppData(student.id, {
                    includeRecentBookings: true,
                    roomNumber: student.roomNumber,
                }).catch(() => undefined);
            });
        };

        const idleWindow = window as Window & typeof globalThis & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            const idleId = idleWindow.requestIdleCallback(() => {
                if (!cancelled) {
                    warmRoommates();
                }
            }, { timeout: 900 });

            return () => {
                cancelled = true;
                idleWindow.cancelIdleCallback?.(idleId);
            };
        }

        const timeoutId = window.setTimeout(() => {
            if (!cancelled) {
                warmRoommates();
            }
        }, 180);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [roommates, step]);

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
                void warmResidentAppData(undefined, { roomNumber: roomStudents[0].roomNumber });
                // Check if Room has PIN protection
                const roomPin = roomStudents[0].pin;
                if (roomPin) {
                    setStep(1.5); // Go to PIN step
                } else {
                    setStep(2); // Legacy/Unprotected flow
                }
            } else {
                notifyError(t.roomNotFound);
            }
        } catch (err) {
            finishResidentPerfSpan('resident:login-room-lookup', {
                result: 'error',
            });
            console.error(err);
            notifyError(t.failedToConnect);
        } finally {
            setLoading(false);
        }
    // Intentionally keyed to current language so the toast/message matches the selected locale.
    };

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const correctPin = roommates[0]?.pin;
        if (pin === correctPin) {
            setStep(2);
        } else {
            notifyError(t.incorrectPin);
        }
    };

    const toggleLanguage = () => {
        const nextLanguage: ResidentPortalLanguage = language === 'ru' ? 'en' : 'ru';
        setLanguage(nextLanguage);
        setResidentPortalLanguage(nextLanguage);
    };

    const handleStudentSelect = async (student: Student) => {
        if (selectingStudentId) {
            return;
        }

        setSelectingStudentId(student.id);

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
            activeElement.blur();
        }

        resetPageScroll();

        // Keep using bookingService for session management facade for now
        bookingService.setCurrentUser(student);
        bookingService.setCurrentRoommates(roommates);
        window.sessionStorage.setItem(RESIDENT_FORCE_TOP_AFTER_LOGIN_KEY, '1');
        preloadResidentRoutes();
        const warmupPromise = warmResidentAppData(student.id, {
            includeRecentBookings: true,
            roomNumber: student.roomNumber,
        });
        startResidentPerfSpan('resident:login-to-dashboard-shell');
        startResidentPerfSpan('resident:login-to-dashboard-data');
        startResidentPerfSpan('resident:dashboard-banner-ready');

        try {
            await Promise.race([
                warmupPromise,
                new Promise((resolve) => window.setTimeout(resolve, 180)),
            ]);
        } catch {
            // Navigation should continue even if the warmup request fails.
        }

        requestAnimationFrame(() => {
            resetPageScroll();
            navigate('/', { replace: true });
        });
    };



    return (
        <div className="login-split">
            <div className="login-left">
                <div
                    className="glass-panel login-card"
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
                    <div className="login-card-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                        <button
                            type="button"
                            onClick={toggleLanguage}
                            className="glass-button"
                            style={{ padding: '8px 14px', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Languages size={16} />
                            {t.switchLanguage}
                        </button>
                    </div>

                    <div className="login-card-intro" style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <div className="login-card-icon" style={{
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
                        <h1 className="text-gradient login-card-title" style={{ margin: 0, fontSize: '28px' }}>{t.portalTitle}</h1>
                        <p className="login-card-subtitle" style={{ color: 'var(--text-muted)', marginTop: '8px' }}>{t.portalSubtitle}</p>
                    </div>

                    {step === 1 ? (
                        <form className="login-card-form" onSubmit={handleRoomSubmit}>
                                <div className="login-card-field" style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '8px', fontSize: '14px' }}>
                                        {t.roomLabel}
                                    </label>
                                    <input
                                        type="text"
                                        value={room}
                                        onChange={(e) => setRoom(e.target.value)}
                                        onFocus={handleRoomFieldFocus}
                                        placeholder={t.roomPlaceholder}
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
                                    {loading ? t.checking : t.findRoom} <ArrowRight size={18} />
                                </button>
                        </form>
                    ) : step === 1.5 ? (
                        <form className="login-card-form" onSubmit={handlePinSubmit}>
                                <p style={{ textAlign: 'center', marginBottom: '16px' }}>{t.enterRoomPin}</p>
                                <div className="login-card-field" style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={3}
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        placeholder={t.pinPlaceholder}
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
                                    {t.verifyPin}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', width: '100%', marginTop: '20px', cursor: 'pointer' }}
                                >
                                    {t.back}
                                </button>
                        </form>
                    ) : (
                        <div className="login-card-form">
                                <p style={{ textAlign: 'center', marginBottom: '16px' }}>{t.whoAreYou}</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {roommates.map(student => (
                                        <button
                                            key={student.id}
                                            onClick={() => handleStudentSelect(student)}
                                            className="glass-button"
                                            disabled={Boolean(selectingStudentId)}
                                            style={{
                                                width: '100%',
                                                padding: '16px',
                                                borderRadius: '12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                textAlign: 'left',
                                                justifyContent: 'space-between',
                                                opacity: selectingStudentId && selectingStudentId !== student.id ? 0.68 : 1
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '50%' }}>
                                                    <User size={20} />
                                                </div>
                                                <span style={{ fontSize: '16px', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {getResidentNameForLanguage(student.name, isRussian)}
                                                </span>
                                            </div>
                                            {selectingStudentId === student.id ? <ActionSpinner size={18} tone="neutral" /> : null}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setStep(1)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', width: '100%', marginTop: '20px', cursor: 'pointer' }}
                                >
                                    {t.backToSearch}
                                </button>
                        </div>
                    )}

                    <p className="login-card-footnote" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', marginTop: '24px' }}>
                        {t.residentsOnly}
                    </p>
                </div>
            </div>

        </div>
    );
}
