import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, KeyRound, ArrowRight } from 'lucide-react';
import { preloadManagerRoutes } from '../utils/preloadRoutes';
import { warmAdminAppData } from '../utils/warmAdminApp';

export default function HostelAdminLogin() {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        preloadManagerRoutes();
        void warmAdminAppData('staff');
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Hardcoded PIN for Hostel Staff
        if (pin === '2001') {
            sessionStorage.setItem('hostel_admin_auth', 'true');
            preloadManagerRoutes();
            void warmAdminAppData('staff');
            navigate('/hostel-admin/dashboard');
        } else {
            setError('Incorrect PIN');
            setPin('');
        }
    };

    return (
        <div className="flex-center" style={{ minHeight: '100vh', padding: '20px' }}>
            <div className="glass-panel animate-fade-in" style={{ padding: '40px', maxWidth: '360px', width: '100%', borderRadius: '24px', textAlign: 'center' }}>
                <div style={{
                    background: 'rgba(59, 130, 246, 0.2)', width: '64px', height: '64px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px'
                }}>
                    <Shield size={32} color="#3b82f6" />
                </div>

                <h2 style={{ marginBottom: '8px' }}>Staff Access</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Enter staff PIN to access print portals</p>

                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: '24px' }}>
                        <div className="input-group">
                            <KeyRound size={20} color="var(--text-muted)" />
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                onFocus={preloadManagerRoutes}
                                placeholder="Enter PIN"
                                style={{ fontSize: '24px', letterSpacing: '8px', textAlign: 'center', fontFamily: 'monospace' }}
                                maxLength={4}
                                autoFocus
                            />
                        </div>
                        {error && <div style={{ color: 'var(--error)', marginTop: '8px', fontSize: '14px' }}>{error}</div>}
                    </div>

                    <button type="submit" className="primary-button" style={{ width: '100%', justifyContent: 'center' }}>
                        Access Portal <ArrowRight size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
}
