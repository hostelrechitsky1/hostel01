import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { firestoreService } from '../services/firestoreService';
import { ArrowLeft, CheckCircle2, XCircle, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TicketScanner() {
    const navigate = useNavigate();
    const [scanResult, setScanResult] = useState<{ valid: boolean; message: string } | null>(null);
    const [stats, setStats] = useState({ total: 0, used: 0 });
    const [manualCode, setManualCode] = useState('');
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        loadStats();

        // Initialize Scanner
        // Note: html5-qrcode handles the UI rendering in the div with id "reader"
        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 300, height: 150 }, aspectRatio: 1.0 },
            /* verbose= */ false
        );

        scanner.render(onScanSuccess, onScanFailure);
        scannerRef.current = scanner;

        return () => {
            scanner.clear().catch(console.error);
        };
    }, []);

    const loadStats = async () => {
        const s = await firestoreService.getTicketStats();
        setStats(s);
    };

    const handleValidation = async (code: string) => {
        // Prevent re-scanning while result is showing (optional throttling)
        const res = await firestoreService.validateTicket(code);
        setScanResult(res);
        if (res.valid) {
            loadStats(); // Update stats
            playAudio('success');
        } else {
            playAudio('error');
        }

        // Auto-clear result after 3 seconds for next scan
        setTimeout(() => setScanResult(null), 3000);
    };

    const onScanSuccess = (decodedText: string) => {
        // Basic debounce could go here
        handleValidation(decodedText);
    };

    const onScanFailure = (_error: any) => {
        // console.warn(error);
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (manualCode.trim()) {
            handleValidation(manualCode.trim());
            setManualCode('');
        }
    };

    const playAudio = (_type: 'success' | 'error') => {
        // Simple beep logic, in real app use Audio()
        // const audio = new Audio(type === 'success' ? '/success.mp3' : '/error.mp3');
        // audio.play();
    };

    return (
        <div style={{ minHeight: '100vh', background: 'black', color: 'white', padding: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => navigate('/manager')} style={{ background: 'none', border: 'none', color: 'white' }}>
                    <ArrowLeft />
                </button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>INSIDE</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{stats.used} <span style={{ fontSize: '14px', color: '#6b7280' }}>/ {stats.total}</span></div>
                </div>
            </div>

            {/* Scanner Viewport */}
            <div style={{
                margin: '0 auto',
                maxWidth: '500px',
                background: '#1f2937',
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                minHeight: '300px'
            }}>
                <div id="reader"></div>

                {/* Overlay Result */}
                {scanResult && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: scanResult.valid ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        backdropFilter: 'blur(4px)'
                    }}>
                        {scanResult.valid ? <CheckCircle2 size={64} /> : <XCircle size={64} />}
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '16px' }}>
                            {scanResult.valid ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                        </h2>
                        <p style={{ marginTop: '8px', fontSize: '16px', fontWeight: 500 }}>{scanResult.message}</p>
                    </div>
                )}
            </div>

            {/* Manual Entry */}
            <form onSubmit={handleManualSubmit} style={{ maxWidth: '500px', margin: '20px auto', display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search style={{ position: 'absolute', left: 12, top: 12, color: '#9ca3af' }} size={18} />
                    <input
                        type="text"
                        value={manualCode}
                        onChange={e => setManualCode(e.target.value)}
                        placeholder="Enter ID Manually..."
                        style={{
                            width: '100%',
                            padding: '12px 12px 12px 40px',
                            borderRadius: '50px',
                            border: '1px solid #374151',
                            background: '#1f2937',
                            color: 'white',
                            outline: 'none'
                        }}
                    />
                </div>
                <button type="submit" style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '50px', padding: '0 24px', fontWeight: 'bold' }}>
                    Check
                </button>
            </form>
        </div>
    );
}
