import { useState, useMemo, useEffect } from 'react';
import { firestoreService } from '../services/firestoreService';
import { Printer, ChevronLeft } from 'lucide-react';
import type { Booking, Machine, Student } from '../types';
import { TIME_SLOTS } from '../types';
import { useNavigate } from 'react-router-dom';
import {
    addBelarusDays,
    formatBelarusDate,
    formatBelarusMonthDayLabel,
    formatBelarusMonthDayYearLabel,
    formatBelarusWeekdayLabel,
    getBelarusDate,
    getBelarusWeekEnd,
    getBelarusWeekId,
    getBelarusWeekStart,
    getBelarusWeekday,
    isAutoBookingWindowOpen
} from '../utils/time';

export default function PrintSchedule() {
    const navigate = useNavigate();
    const [weekOffset, setWeekOffset] = useState(0);

    const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const isStaff = sessionStorage.getItem('hostel_admin_auth');
    const isRussian = !!isStaff && sessionStorage.getItem('hostel_admin_lang') === 'ru';

    const t = isRussian ? {
        loading: 'Загрузка расписания...',
        back: 'Назад',
        title: 'Печать расписания',
        nextWeekTag: '(Следующая неделя)',
        tip: 'Совет: Если в предпросмотре печати ориентация портретная, переключите на альбомную в настройках печати.',
        currentWeek: 'Текущая неделя',
        nextWeek: 'Следующая неделя',
        maintenance: 'Обслуживание:',
        printNow: 'Печатать',
        time: 'Время'
    } : {
        loading: 'Loading Schedule...',
        back: 'Back',
        title: 'Print Schedule',
        nextWeekTag: '(Next Week)',
        tip: 'Tip: If the print preview is portrait, switch Orientation to Landscape in your print options.',
        currentWeek: 'Current Week',
        nextWeek: 'Next Week',
        maintenance: 'Maintenance:',
        printNow: 'Print Now',
        time: 'Time'
    };

    // Async Data
    const [machines, setMachines] = useState<Machine[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [maintenanceDay, setMaintenanceDay] = useState(3);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const isManager = sessionStorage.getItem('manager_auth');
        const isStaff = sessionStorage.getItem('hostel_admin_auth');
        const currentWeekStart = getBelarusWeekStart(getBelarusDate());
        const relevantWeekIds = [
            getBelarusWeekId(currentWeekStart),
            getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
        ];

        if (!isManager && !isStaff) {
            navigate('/manager');
            return;
        }

        const load = async () => {
            try {
                const [ms, bs, ss, settings] = await Promise.all([
                    firestoreService.getMachines(),
                    firestoreService.getBookingsForWeekIds(relevantWeekIds),
                    firestoreService.getAllStudents(),
                    firestoreService.getSettings()
                ]);
                setMachines(ms);
                setBookings(bs);
                setStudents(ss);

                // Smart Auto-Switch based on force setting or auto schedule
                const shouldShowNextWeek = settings.forceShowNextWeek || isAutoBookingWindowOpen(new Date(), settings);
                setWeekOffset(shouldShowNextWeek ? 1 : 0);
                if (typeof settings.maintenanceDay === 'number') {
                    setMaintenanceDay(settings.maintenanceDay);
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
    const today = getBelarusDate();
    const targetDate = addBelarusDays(today, weekOffset * 7);
    const weekStart = getBelarusWeekStart(targetDate); // Monday start (Belarus)
    const weekEnd = getBelarusWeekEnd(targetDate);

    // Generate Array of 7 days
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => addBelarusDays(weekStart, i));
    }, [weekStart]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="flex-center" style={{ height: '100vh' }}>{t.loading}</div>;



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
                    <button onClick={() => navigate(isStaff ? '/hostel-admin/dashboard' : '/manager')} className="glass-button" style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ChevronLeft size={16} /> {t.back}
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px' }}>{t.title}</h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                            {formatBelarusMonthDayLabel(weekStart)} - {formatBelarusMonthDayYearLabel(weekEnd)}
                            {weekOffset === 1 && <span style={{ marginLeft: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>{t.nextWeekTag}</span>}
                        </p>
                        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                            {t.tip}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => setWeekOffset(0)}
                        className={weekOffset === 0 ? 'primary-button' : 'glass-button'}
                        style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}
                    >
                        {t.currentWeek}
                    </button>
                    <button
                        onClick={() => setWeekOffset(1)}
                        className={weekOffset === 1 ? 'primary-button' : 'glass-button'}
                        style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}
                    >
                        {t.nextWeek}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: '8px', padding: '4px 8px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '8px' }}>{t.maintenance}</span>
                        <select
                            value={maintenanceDay}
                            onChange={(e) => setMaintenanceDay(Number(e.target.value))}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: 'var(--text-main)',
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        >
                            {DAYS_OF_WEEK.map((day, index) => (
                                <option key={day} value={index}>{day}</option>
                            ))}
                        </select>
                    </div>

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
                        <Printer size={18} /> {t.printNow}
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
                                    {formatBelarusMonthDayLabel(weekStart)} - {formatBelarusMonthDayLabel(weekEnd)}
                                </div>
                            </div>
                        </div>

                        {/* Matrix Table */}
                        <div style={{ flex: 1, border: '1px solid #000' }}>
                            <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...headerStyle, width: '60px' }}>{t.time}</th>
                                        {weekDays.map(day => (
                                            <th key={day.toString()} style={headerStyle}>
                                                {formatBelarusWeekdayLabel(day)}<br />
                                                <span style={{ fontWeight: 'normal' }}>{formatBelarusMonthDayLabel(day)}</span>
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
                                                // Find booking
                                                const booking = bookings.find(b =>
                                                    b.machineId === machine.id &&
                                                    b.startTime === time &&
                                                    b.date === formatBelarusDate(day)
                                                );
                                                const student = booking ? students.find(s => s.id === booking.studentId) : null;

                                                if (booking) {
                                                    return (
                                                        <td key={day.toString()} style={cellStyle}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', justifyContent: 'center' }}>
                                                                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                                                    {booking.roomNumber || student?.roomNumber || '???'}
                                                                </span>
                                                                <span style={{ fontSize: '12px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                                                    {booking.studentName || student?.name || 'Unknown'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                const isMaintenanceDay = getBelarusWeekday(day) === maintenanceDay;

                                                if (isMaintenanceDay) {
                                                    return (
                                                        <td key={day.toString()} style={{ ...cellStyle, background: '#eee', color: '#999', textAlign: 'center' }}>
                                                            <div style={{ transform: 'rotate(-45deg)', fontSize: '10px', letterSpacing: '1px' }}>MAINTENANCE</div>
                                                        </td>
                                                    );
                                                }

                                                return (
                                                    <td key={day.toString()} style={cellStyle}>
                                                        {/* Empty cell */}
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
                        size: A4 landscape;
                        margin: 1cm;
                    }
                    .no-print { display: none !important; }
                    .printable-area { display: block !important; }
                    body { background: white !important; color: black !important; }
                    .page-break { break-after: page; page-break-after: always; break-inside: avoid; width: 297mm; height: 210mm; }
                    .page-break:last-child { break-after: auto; page-break-after: auto; }
                }
                .printable-area {
                    width: 297mm; /* A4 Landscape */
                    margin: 0 auto;
                    background: white;
                    padding: 10px;
                    color: black;
                }
            `}</style>
        </div >
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
