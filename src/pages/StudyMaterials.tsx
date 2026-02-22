import { BookOpen, Sparkles, ChevronLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function StudyMaterials() {
    const navigate = useNavigate();

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '100px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button
                    onClick={() => navigate('/')}
                    className="glass-button"
                    style={{ padding: '10px', borderRadius: '12px' }}
                >
                    <ChevronLeft size={20} />
                </button>
                <h1 style={{ margin: 0, fontSize: '24px' }}>Study Hub</h1>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ position: 'relative', marginBottom: '32px' }}>
                    {/* Glowing background rings */}
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
                        filter: 'blur(25px)',
                        animation: 'glow-pulse 4s ease-in-out infinite'
                    }} />

                    <div className="glass-panel" style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        position: 'relative',
                        zIndex: 1,
                        animation: 'float 6s ease-in-out infinite'
                    }}>
                        <BookOpen size={40} color="#a855f7" />
                        <div style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: 'var(--floating-bar-bg)',
                            borderRadius: '50%',
                            padding: '4px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}>
                            <Sparkles size={16} color="#f59e0b" />
                        </div>
                    </div>
                </div>

                <h2 style={{ fontSize: '28px', marginBottom: '16px', background: 'linear-gradient(135deg, var(--text-main) 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Premium Study Hub
                </h2>

                <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: '1.6', maxWidth: '300px', margin: '0 auto 32px' }}>
                    A centralized repository for notes, past papers, and study guides. Uploaded by students, verified by admins.
                </p>

                <div className="glass-panel" style={{
                    padding: '24px',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '340px',
                    border: '1px solid rgba(168, 85, 247, 0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ padding: '8px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '10px' }}>
                            <Lock size={20} color="#a855f7" />
                        </div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 600, fontSize: '15px' }}>Coming Very Soon</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>We are polishing the experience</div>
                        </div>
                    </div>

                    <div style={{
                        height: '4px',
                        background: 'var(--glass-border)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: '65%',
                            background: 'linear-gradient(90deg, var(--primary) 0%, #a855f7 100%)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: '100%',
                                height: '100%',
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                                animation: 'shimmer 2s infinite'
                            }} />
                        </div>
                    </div>
                </div>
            </div>
            <style>
                {`
                    @keyframes float {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-8px); }
                    }
                    @keyframes shimmer {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                    @keyframes glow-pulse {
                        0%, 100% { opacity: 0.15; transform: translate(-50%, -50%) scale(1); }
                        50% { opacity: 0.3; transform: translate(-50%, -50%) scale(1.15); }
                    }
                `}
            </style>
        </div>
    );
}
