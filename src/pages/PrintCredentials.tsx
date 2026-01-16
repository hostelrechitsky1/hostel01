import { useEffect, useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import type { Student } from '../types';
import { Printer, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrintCredentials() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!sessionStorage.getItem('manager_auth')) {
            navigate('/manager/login');
            return;
        }

        const loadData = async () => {
            const data = await firestoreService.getAllStudents();
            setStudents(data);
            setLoading(false);
        };
        loadData();
    }, []);

    // Group by Room
    const rooms = students.reduce((acc, student) => {
        if (!acc[student.roomNumber]) {
            acc[student.roomNumber] = {
                pin: student.pin || 'Pending',
                count: 0
            };
        }
        acc[student.roomNumber].count++;
        return acc;
    }, {} as Record<string, { pin: string; count: number }>);

    const sortedRooms = Object.entries(rooms).sort((a, b) => {
        // Natural sort for room numbers (e.g. 10, 20, 100)
        return a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' });
    });

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <button
                    onClick={() => navigate('/manager')}
                    className="glass-button"
                    style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 16px', borderRadius: '8px' }}
                >
                    <ArrowLeft size={18} /> Back
                </button>
                <button
                    onClick={() => window.print()}
                    className="primary-button"
                    style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '12px 24px', borderRadius: '8px' }}
                >
                    <Printer size={18} /> Print System Codes
                </button>
            </div>

            <div className="print-content">
                <div style={{ textAlign: 'center', marginBottom: '32px', borderBottom: '2px solid black', paddingBottom: '16px' }}>
                    <h1 style={{ margin: 0, fontSize: '24px' }}>Hostel Wash System</h1>
                    <p style={{ margin: '8px 0 0 0', fontSize: '16px' }}>Room Access Credentials</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>Confidential - Application Login Codes</p>
                </div>

                <div style={{ columnCount: 2, columnGap: '24px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', breakInside: 'auto' }}>
                        <thead>
                            <tr style={{ background: '#f3f4f6' }}>
                                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Room</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>PIN Code</th>
                                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Residents</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRooms.map(([room, data]) => (
                                <tr key={room} style={{ breakInside: 'avoid' }}>
                                    <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>{room}</td>
                                    <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', fontFamily: 'monospace', fontSize: '16px' }}>{data.pin}</td>
                                    <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', color: '#666' }}>{data.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ marginTop: '40px', fontSize: '12px', color: '#666', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '16px' }}>
                    How to Login: 1. Go to App → 2. Enter Room Number → 3. Enter PIN → 4. Select Name
                </div>
            </div>

        </div>
    );
}
