import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { studentsRawData } from '../data/studentsRaw';

export default function ManagerLogin() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [seeding, setSeeding] = useState(false);
    const navigate = useNavigate();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Simple env var check
        const correctPassword = import.meta.env.VITE_MANAGER_PASSWORD || 'admin123';

        if (password === correctPassword) {
            sessionStorage.setItem('manager_auth', 'true');
            navigate('/manager');
        } else {
            setError('Incorrect Password');
        }
    };

    const handleSeedDatabase = async () => {
        if (seeding) return;
        const confirmed = confirm('This will add/update students while preserving existing room PINs. Continue?');
        if (!confirmed) return;
        setSeeding(true);
        try {
            await firestoreService.seedStudents(studentsRawData);
            alert('Student list seeded. Existing room PINs were preserved.');
        } catch (err) {
            console.error(err);
            alert('Failed to seed students. Please check database access.');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <div className="flex-center" style={{ minHeight: '100vh', padding: '20px' }}>
            <div className="glass-panel" style={{ padding: '40px', width: '100%', maxWidth: '400px', borderRadius: '24px' }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <div style={{
                        background: 'rgba(16, 185, 129, 0.2)', // Emerald tint
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px auto'
                    }}>
                        <ShieldCheck size={40} color="#10b981" />
                    </div>
                    <h1 className="text-gradient" style={{ margin: 0, fontSize: '28px' }}>Manager Access</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Restricted Area</p>
                </div>

                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: '20px' }}>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter Password"
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '16px',
                                borderRadius: '12px',
                                background: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-main)',
                                fontSize: '18px',
                                outline: 'none'
                            }}
                        />
                        {error && <p style={{ color: 'var(--error)', fontSize: '14px', marginTop: '8px', textAlign: 'center' }}>{error}</p>}
                    </div>

                    <button
                        type="submit"
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
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' // Green gradient
                        }}
                    >
                        Access Panel <ArrowRight size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={handleSeedDatabase}
                        disabled={seeding}
                        style={{
                            width: '100%',
                            marginTop: '12px',
                            padding: '12px',
                            borderRadius: '12px',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: 'var(--text-main)',
                            cursor: seeding ? 'not-allowed' : 'pointer',
                            opacity: seeding ? 0.7 : 1
                        }}
                    >
                        {seeding ? 'Seeding...' : 'Seed Student List (Preserve PINs)'}
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        style={{
                            width: '100%',
                            marginTop: '16px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer'
                        }}
                    >
                        Return Home
                    </button>
                </form>
            </div>
        </div>
    );
}
