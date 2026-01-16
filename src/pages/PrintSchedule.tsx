import { useState, useMemo, useEffect } from 'react';
import { firestoreService } from '../services/firestoreService';
import { format, startOfWeek, endOfWeek, addWeeks, addDays } from 'date-fns';
import { Printer, ChevronLeft } from 'lucide-react';
import type { Booking, Machine, Student } from '../types';
import { TIME_SLOTS } from '../types';
import { useNavigate } from 'react-router-dom';
import { isAutoBookingWindowOpen } from '../utils/time';

export default function PrintSchedule() {
    const navigate = useNavigate();
    const [weekOffset, setWeekOffset] = useState(() => {
        return isAutoBookingWindowOpen() ? 1 : 0;
    });

    // Async Data
    const [machines, setMachines] = useState<Machine[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const isManager = sessionStorage.getItem('manager_auth');
        const isStaff = sessionStorage.getItem('hostel_admin_auth');

        if (!isManager && !isStaff) {
            navigate('/manager');
            return;
        }

        const load = async () => {
            try {
                const [ms, bs, ss, settings] = await Promise.all([
                    firestoreService.getMachines(),
                    firestoreService.getBookings(),
                    firestoreService.getAllStudents(),
                    firestoreService.getSettings()
                ]);
                setMachines(ms);
                setBookings(bs);
                setStudents(ss);

                // Smart Auto-Switch if Force Open is active
                if (settings.forceShowNextWeek) {
                    setWeekOffset(1);
                }
            } catch (e) {
                console.error("Failed to load schedule data", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [navigate]);

    // Calculate Week Range
    const today = new Date();
    const targetDate = addWeeks(today, weekOffset);
    const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 }); // Monday start
    const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });

    // Generate Array of 7 days
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }, [weekStart]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="flex-center" style={{ height: '100vh' }}>Loading Schedule...</div>;



    return (
        <div className="print-container">
            {/* Screen-only Controls */}
            <div className="no-print" style={{
                padding: '20px',
                background: 'var(--glass-bg)',
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '40px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={() => navigate('/manager')} className="glass-button" style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ChevronLeft size={16} /> Back
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Print Schedule</h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                            {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
                            {weekOffset === 1 && <span style={{ marginLeft: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>(Next Week)</span>}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => setWeekOffset(0)}
                        className={weekOffset === 0 ? 'primary-button' : 'glass-button'}
                        style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}
                    >
                        Current Week
                    </button>
                    <button
                        onClick={() => setWeekOffset(1)}
                        className={weekOffset === 1 ? 'primary-button' : 'glass-button'}
                        style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}
                    >
                        Next Week
                    </button>
                    <button
                        onClick={handlePrint}
                        className="primary-button"
                        style={{
                            padding: '8px 24px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#fff',
                            color: '#000'
                        }}
                    >
                        <Printer size={18} /> Print Now
                    </button>
                </div>
            </div>

            {/* Printable Content */}
            <div className="printable-area">
                {machines.map((machine, index) => (
                    <div key={machine.id} className="page-break" style={{
                        pageBreakAfter: index === machines.length - 1 ? 'auto' : 'always',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '180mm'
                    }}>
                        {/* Header */}
                        <div style={{
                            borderBottom: '2px solid #000',
                            paddingBottom: '10px',
                            marginBottom: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end'
                        }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '24px', color: '#000' }}>{machine.name}</h1>
                                <div style={{ fontSize: '14px', color: '#666' }}>Formatted for A4 Landscape</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>
                                    {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d')}
                                </div>
                            </div>
                        </div>

                        {/* Matrix Table */}
                        <div style={{ flex: 1, border: '1px solid #000' }}>
                            <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...headerStyle, width: '60px' }}>Time</th>
                                        {weekDays.map(day => (
                                            <th key={day.toString()} style={headerStyle}>
                                                {format(day, 'EEEE')}<br />
                                                <span style={{ fontWeight: 'normal' }}>{format(day, 'MMM d')}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {TIME_SLOTS.map(time => (
                                        <tr key={time}>
                                            <td style={{ ...cellStyle, background: '#f5f5f5', fontWeight: 'bold', textAlign: 'center' }}>
                                                {time}
                                            </td>
                                            {weekDays.map(day => {
                                                const isWed = day.getDay() === 3;

                                                if (isWed) {
                                                    return (
                                                        <td key={day.toString()} style={{ ...cellStyle, background: '#eee', color: '#999', textAlign: 'center' }}>
                                                            <div style={{ transform: 'rotate(-45deg)', fontSize: '10px', letterSpacing: '1px' }}>MAINTENANCE</div>
                                                        </td>
                                                    );
                                                }

                                                // Find booking
                                                const booking = bookings.find(b =>
                                                    b.machineId === machine.id &&
                                                    b.startTime === time &&
                                                    b.date === format(day, 'yyyy-MM-dd')
                                                );
                                                const student = booking ? students.find(s => s.id === booking.studentId) : null;

                                                return (
                                                    <td key={day.toString()} style={cellStyle}>
                                                        {booking ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', justifyContent: 'center' }}>
                                                                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                                                    {booking.roomNumber || student?.roomNumber || '???'}
                                                                </span>
                                                                <span style={{ fontSize: '12px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                                                    {booking.studentName || student?.name || 'Unknown'}
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                @media print {
                    @page { 
                        size: landscape;
                        margin: 1cm;
                    }
                    .no-print { display: none !important; }
                    .printable-area { display: block !important; }
                    body { background: white !important; color: black !important; }
                    .page-break { break-after: page; page-break-after: always; height: auto; }
                }
                .printable-area {
                    max-width: 297mm; /* A4 Landscape */
                    margin: 0 auto;
                    background: white;
                    padding: 10px;
                    color: black;
                }
            `}</style>
        </div>
    );
}

const headerStyle = {
    padding: '4px',
    border: '1px solid #000',
    background: '#eee',
    textAlign: 'center' as const,
    fontSize: '11px',
    color: '#000'
};

const cellStyle = {
    padding: '4px',
    border: '1px solid #000',
    verticalAlign: 'top' as const,
    height: '30px', // Compact height
    color: '#000',
    fontSize: '10px'
};
