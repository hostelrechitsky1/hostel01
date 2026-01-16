import { useNavigate } from 'react-router-dom';
import { Printer, Users, LogOut, FileText } from 'lucide-react';
import { useEffect } from 'react';

export default function HostelAdminDashboard() {
    const navigate = useNavigate();

    useEffect(() => {
        if (!sessionStorage.getItem('hostel_admin_auth')) {
            navigate('/hostel-admin');
        }
    }, [navigate]);

    const handleLogout = () => {
        sessionStorage.removeItem('hostel_admin_auth');
        navigate('/hostel-admin');
    };

    return (
        <div className="container animate-fade-in" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px' }}>Staff Portal</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Printing & Administration</p>
                </div>
                <button onClick={handleLogout} className="glass-button" style={{ padding: '8px 16px', fontSize: '14px' }}>
                    <LogOut size={16} style={{ marginRight: '8px' }} /> Logout
                </button>
            </div>

            <div className="grid-cols-2">
                <button
                    onClick={() => navigate('/manager/print-schedule')}
                    className="glass-panel hover-scale"
                    style={{
                        padding: '32px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '16px',
                        cursor: 'pointer',
                        border: '1px solid var(--glass-border)'
                    }}
                >
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '50%' }}>
                        <Printer size={40} color="#3b82f6" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px' }}>Print Schedule</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                            Generate weekly booking sheet for notice board
                        </p>
                        <div style={{ marginTop: '16px', color: '#3b82f6', fontSize: '14px', fontWeight: 600 }}>Open →</div>
                    </div>
                </button>

                <button
                    onClick={() => navigate('/manager/print-credentials')}
                    className="glass-panel hover-scale"
                    style={{
                        padding: '32px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '16px',
                        cursor: 'pointer',
                        border: '1px solid var(--glass-border)'
                    }}
                >
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '20px', borderRadius: '50%' }}>
                        <Users size={40} color="#10b981" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px' }}>Print Codes</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                            Print login credentials handout for residents
                        </p>
                        <div style={{ marginTop: '16px', color: '#10b981', fontSize: '14px', fontWeight: 600 }}>Open →</div>
                    </div>
                </button>
            </div>

            <div style={{ marginTop: '40px', textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>
                Restricted Area • Authorized Personnel Only
            </div>
        </div>
    );
}
