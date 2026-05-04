import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { firestoreService } from '../services/firestoreService';
import { ChevronLeft, Printer } from 'lucide-react';
import type { Machine } from '../types';
import { buildMachineBookUrl } from '../utils/residentBookingContext';
import QRCode from 'react-qr-code';

export default function PrintMachineQr() {
    const navigate = useNavigate();
    const [machines, setMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(true);
    const origin = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), []);

    const sharedLaundryUrl = useMemo(
        () => (origin ? buildMachineBookUrl(origin, { qr: true }) : ''),
        [origin],
    );

    useEffect(() => {
        const isManager = sessionStorage.getItem('manager_auth');
        const isStaff = sessionStorage.getItem('hostel_admin_auth');
        if (!isManager && !isStaff) {
            navigate('/manager');
            return;
        }

        void firestoreService.getMachines()
            .then(setMachines)
            .catch((e) => console.error(e))
            .finally(() => setLoading(false));
    }, [navigate]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return <div className="flex-center" style={{ height: '100vh' }}>Loading machines…</div>;
    }

    return (
        <div className="print-container">
            <div
                className="no-print"
                style={{
                    padding: '20px',
                    background: 'var(--glass-bg)',
                    borderBottom: '1px solid var(--glass-border)',
                    marginBottom: '32px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        type="button"
                        onClick={() => navigate('/manager')}
                        className="glass-button"
                        style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <ChevronLeft size={16} /> Back
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Print laundry QR codes</h2>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12px', maxWidth: '520px' }}>
                            Scan opens live slot owners for all machines. Use the shared code on the wall, or per-machine stickers.
                            URLs use this host: <strong>{origin || '—'}</strong>
                        </p>
                    </div>
                </div>
                <button type="button" onClick={handlePrint} className="primary-button" style={{ padding: '8px 24px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Printer size={18} /> Print
                </button>
            </div>

            <div className="printable-area" style={{ padding: '0 24px 48px' }}>
                <section className="page-break" style={{ marginBottom: '48px', pageBreakAfter: 'always' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '16px', color: '#111' }}>Shared laundry (all machines)</h3>
                    <div
                        style={{
                            border: '1px solid #ddd',
                            borderRadius: '12px',
                            padding: '24px',
                            display: 'inline-block',
                            background: '#fff',
                        }}
                    >
                        {sharedLaundryUrl && (
                            <QRCode value={sharedLaundryUrl} size={280} level="M" />
                        )}
                        <p style={{ margin: '16px 0 0', fontSize: '11px', wordBreak: 'break-all', maxWidth: '280px', color: '#444' }}>
                            {sharedLaundryUrl}
                        </p>
                    </div>
                </section>

                <h3 style={{ fontSize: '18px', marginBottom: '16px', color: '#111' }}>Per-machine stickers</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '24px' }}>
                    {machines.map((machine) => {
                        const url = origin ? buildMachineBookUrl(origin, { qr: true, machineId: machine.id }) : '';
                        return (
                            <div
                                key={machine.id}
                                className="page-break"
                                style={{
                                    border: '1px solid #ddd',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    background: '#fff',
                                    pageBreakInside: 'avoid',
                                }}
                            >
                                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: '#111' }}>{machine.name}</div>
                                {url && <QRCode value={url} size={200} level="M" />}
                                <p style={{ margin: '12px 0 0', fontSize: '10px', wordBreak: 'break-all', color: '#444' }}>{url}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
