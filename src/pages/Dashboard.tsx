import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import type { Student, Machine, Booking } from '../types';
import { Calendar, LogOut, WashingMachine as Washer, History, Download, AlertCircle } from 'lucide-react';
import { format, addMinutes, parse, isAfter, isBefore } from 'date-fns';

export default function Dashboard() {
    const [user, setUser] = useState<Student | null>(null);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [upcomingBooking, setUpcomingBooking] = useState<Booking | null>(null);
    const [history, setHistory] = useState<Booking[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        const currentUser = bookingService.getCurrentUser();
        if (!currentUser) {
            navigate('/login');
            return;
        }
        setUser(currentUser);
        setMachines(bookingService.getMachines());

        const nextBooking = bookingService.getUpcomingBooking();
        setUpcomingBooking(nextBooking || null);
        setHistory(bookingService.getHistory());
    }, [navigate]);

    const getMachineRealTimeStatus = (machine: Machine) => {
        const now = new Date();
        const isWed = now.getDay() === 3;

        if (isWed) return { state: 'maintenance', label: 'Maintenance Day', color: '#ef4444' };
        if (machine.status === 'maintenance') return { state: 'maintenance', label: 'Under Maintenance', color: '#ef4444' };

        // Check current bookings
        const today = format(now, 'yyyy-MM-dd');
        const bookingsToday = bookingService.getBookingsForDate(today);

        const currentBooking = bookingsToday.find(b => {
            if (b.machineId !== machine.id) return false;

            const start = parse(b.startTime, 'HH:mm', now);
            const end = addMinutes(start, 90); // 90 min slots
            return isAfter(now, start) && isBefore(now, end);
        });

        if (currentBooking) {
            return { state: 'occupied', label: 'In Use', color: '#f59e0b' }; // Orange
        }

        return { state: 'available', label: 'Ready to use', color: '#10b981' };
    };

    const handleLogout = () => {
        bookingService.logout();
        navigate('/login');
    };

    return (
        <div className="container animate-fade-in">
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingTop: '16px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '24px' }}>Hello, {user?.name.split(' ')[0]} 👋</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Room {user?.roomNumber}</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="glass-button"
                    style={{ padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <LogOut size={20} />
                </button>
            </header>

            {/* Main Action */}
            <div
                className="glass-panel"
                style={{
                    padding: '24px',
                    borderRadius: '20px',
                    marginBottom: '32px',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>Need to wash?</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>Book your slot for this week</p>
                </div>
                <button
                    onClick={() => navigate('/book')}
                    className="primary-button"
                    style={{ padding: '12px 24px', borderRadius: '12px' }}
                >
                    Book Now
                </button>
            </div>

            {/* Machine Status - Live View */}
            <h3 style={{ marginBottom: '16px' }}>Status ({format(new Date(), 'h:mm a')})</h3>
            <div className="grid-cols-2">
                {machines.map(machine => {
                    const status = getMachineRealTimeStatus(machine);
                    return (
                        <div
                            key={machine.id}
                            className="glass-panel"
                            style={{
                                padding: '16px',
                                borderRadius: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{
                                    background: `rgba(${status.state === 'available' ? '16, 185, 129' : status.state === 'occupied' ? '245, 158, 11' : '239, 68, 68'}, 0.2)`,
                                    padding: '8px',
                                    borderRadius: '10px'
                                }}>
                                    {status.state === 'maintenance' ? <AlertCircle size={24} color={status.color} /> : <Washer size={24} color={status.color} />}
                                </div>
                                <span style={{
                                    fontSize: '12px',
                                    padding: '4px 8px',
                                    borderRadius: '10px',
                                    background: `rgba(${status.state === 'available' ? '16, 185, 129' : status.state === 'occupied' ? '245, 158, 11' : '239, 68, 68'}, 0.1)`,
                                    color: status.color
                                }}>
                                    {status.label}
                                </span>
                            </div>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600 }}>{machine.name}</p>
                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {status.state === 'available' ? 'Ready' : status.state === 'occupied' ? 'Finishes soon' : 'Closed'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Your Bookings */}
            <div style={{ marginTop: '32px' }}>
                <h3 style={{ marginBottom: '16px' }}>Your Upcoming Booking</h3>
                {upcomingBooking ? (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '20px',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '12px' }}>
                                <Calendar size={24} color="#10b981" />
                            </div>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '18px' }}>
                                    {format(new Date(upcomingBooking.date), 'EEEE, MMM d')}
                                </p>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                                    {upcomingBooking.startTime} • {machines.find(m => m.id === upcomingBooking.machineId)?.name || 'Machine'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Laundry Booking
DTSTART:${upcomingBooking.date.replace(/-/g, '')}T${upcomingBooking.startTime.replace(':', '')}00
DTEND:${upcomingBooking.date.replace(/-/g, '')}T${parseInt(upcomingBooking.startTime.split(':')[0]) + 1}${upcomingBooking.startTime.split(':')[1]}00
DESCRIPTION:Your laundry slot is confirmed.
LOCATION:Hostel Laundry Room
END:VEVENT
END:VCALENDAR`;
                                const blob = new Blob([icsContent], { type: 'text/calendar' });
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.setAttribute('download', 'laundry-booking.ics');
                                document.body.appendChild(link);
                                link.click();
                            }}
                            className="glass-button"
                            title="Add to Calendar"
                            style={{ padding: '12px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Download size={20} />
                            <span style={{ fontSize: '14px', fontWeight: 500 }}>Add to Calendar</span>
                        </button>
                    </div>
                ) : (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '20px',
                            borderRadius: '16px',
                            textAlign: 'center',
                            color: 'var(--text-muted)'
                        }}
                    >
                        <Calendar size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                        <p>No upcoming bookings.</p>
                    </div>
                )}
            </div>

            {/* History */}
            {history.length > 0 && (
                <div style={{ marginTop: '32px', marginBottom: '40px' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <History size={20} /> Past Bookings
                    </h3>
                    <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                        {history.slice(0, 5).map((booking, i, arr) => (
                            <div
                                key={booking.id}
                                style={{
                                    padding: '16px',
                                    borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--glass-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500 }}>{format(new Date(booking.date), 'MMM d, yyyy')}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{booking.startTime}</div>
                                </div>
                                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                                    Done
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
