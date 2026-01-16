import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { firestoreService } from '../services/firestoreService';
import type { Machine, Booking } from '../types';
import { Calendar, LogOut, WashingMachine as Washer, History, Download, AlertCircle } from 'lucide-react';
import { format, addMinutes, parse, isAfter, isBefore, parseISO } from 'date-fns';
import DashboardFeedback from '../components/DashboardFeedback';
// motion removed

export default function Dashboard() {
    // ... (lines 11-352 remain unchanged, we only target imports and bottom render)

    // ... (render logic)

    {/* History */ }
    {
        history.length > 0 && (
            <div style={{ marginTop: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <History size={20} /> Past Bookings
                </h3>
                {/* History List Code Omitted for brevity, assuming generic replacement */}
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
        )
    }

    {/* Inline Feedback Section */ }
    <DashboardFeedback />
        </div >
    );
}
const navigate = useNavigate();
const user = bookingService.getCurrentUser();
const [upcomingBooking, setUpcomingBooking] = useState<Booking | null>(null);
const [history, setHistory] = useState<Booking[]>([]);
const [machines, setMachines] = useState<Machine[]>([]);
const [allBookings, setAllBookings] = useState<Booking[]>([]);
const [loading, setLoading] = useState(true);
const [settings, setSettings] = useState({ forceShowNextWeek: false, forceCloseBookings: false });

useEffect(() => {
    if (!user) {
        navigate('/login');
        return;
    }

    const loadData = async () => {
        try {
            const [fetchedMachines, fetchedBookings, fetchedSettings] = await Promise.all([
                firestoreService.getMachines(),
                firestoreService.getBookings(),
                firestoreService.getSettings()
            ]);

            setMachines(fetchedMachines);
            setAllBookings(fetchedBookings);
            setSettings(fetchedSettings);

            // Filter for My Bookings
            const myBookings = fetchedBookings.filter(b => b.studentId === user.id);
            const now = new Date();

            // Sort: Newest first for sorting array handling
            myBookings.sort((a, b) => {
                return new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime();
            });

            // Find Upcoming (First one in future)
            // Logic implemented below with chronological sort

            // Let's split explicitly
            const chronological = [...myBookings].sort((a, b) =>
                new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime()
            );

            const nextBooking = chronological.find(b => {
                const end = addMinutes(parseISO(b.date + 'T' + b.startTime), 90);
                return end > now;
            });

            const pastBookings = chronological.filter(b => {
                const end = addMinutes(parseISO(b.date + 'T' + b.startTime), 90);
                return end <= now;
            }).reverse(); // Most recent finished first

            setUpcomingBooking(nextBooking || null);
            setHistory(pastBookings);
        } catch (err) {
            console.error("Failed to load dashboard data", err);
        } finally {
            setLoading(false);
        }
    };

    loadData();
}, [user, navigate]);

const getMachineRealTimeStatus = (machine: Machine) => {
    const now = new Date();
    const isWed = now.getDay() === 3;

    if (isWed) return { state: 'maintenance', label: 'Maintenance Day', color: '#ef4444' };
    if (machine.status === 'maintenance') return { state: 'maintenance', label: 'Under Maintenance', color: '#ef4444' };

    // Check current bookings using allBookings state
    const today = format(now, 'yyyy-MM-dd');
    const bookingsToday = allBookings.filter(b => b.date === today); // In memory filter

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

if (loading) return <div className="flex-center" style={{ height: '100vh' }}>Loading...</div>;
if (!user) return null;

return (
    <div className="container animate-fade-in">
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingTop: '16px' }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '24px' }}>Hello, {user.name.split(' ')[0]} 👋</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Room {user.roomNumber}</p>
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
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                    {settings.forceCloseBookings ? 'Bookings are currently paused' : 'Book your slot for this week'}
                </p>
            </div>
            <button
                onClick={() => navigate('/book')}
                className="primary-button"
                style={{
                    padding: '12px 24px',
                    borderRadius: '12px',
                    // Minimal visual cue it's special, but clickable
                    background: settings.forceCloseBookings ? '#ef4444' : 'var(--primary)',
                    opacity: 1,
                    cursor: 'pointer'
                }}
            >
                {settings.forceCloseBookings ? 'Check Status' : 'Book Now'}
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
                        flexDirection: 'column',
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

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                        {/* Google Calendar Button */}
                        <button
                            onClick={() => {
                                if (!upcomingBooking) return;
                                const start = new Date(upcomingBooking.date + 'T' + upcomingBooking.startTime);
                                const end = addMinutes(start, 90);

                                const formatGCal = (date: Date) => date.toISOString().replace(/-|:|\.|Z/g, "").slice(0, 15) + 'Z';

                                const url = `https://www.google.com/calendar/render?action=TEMPLATE` +
                                    `&text=${encodeURIComponent("Hostel Laundry: " + (machines.find(m => m.id === upcomingBooking.machineId)?.name || "Machine"))}` +
                                    `&dates=${formatGCal(start)}/${formatGCal(end)}` +
                                    `&details=${encodeURIComponent("Don't forget your laundry slot! Remember to clear the machine when done.")}` +
                                    `&location=${encodeURIComponent("Laundry Room")}` +
                                    `&sprop=&sprop=name:`;

                                window.open(url, '_blank');
                            }}
                            className="glass-button"
                            style={{ padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px', justifyContent: 'center' }}
                        >
                            <Calendar size={18} />
                            <span style={{ fontSize: '14px', fontWeight: 500 }}>Google Cal</span>
                        </button>

                        {/* ICS / Apple Calendar Button */}
                        <button
                            onClick={() => {
                                if (!upcomingBooking) return;
                                const startStr = upcomingBooking.date.replace(/-/g, '') + 'T' + upcomingBooking.startTime.replace(':', '') + '00';
                                const end = addMinutes(new Date(upcomingBooking.date + 'T' + upcomingBooking.startTime), 90);
                                const endStr = format(end, "yyyyMMdd'T'HHmmss");

                                const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Hostel Laundry - ${machines.find(m => m.id === upcomingBooking.machineId)?.name}
DTSTART:${startStr}
DTEND:${endStr}
DESCRIPTION:Remember to empty the machine on time!
LOCATION:Laundry Room
BEGIN:VALARM
TRIGGER:-PT30M
DESCRIPTION:Laundry Reminder
ACTION:DISPLAY
END:VALARM
END:VEVENT
END:VCALENDAR`;
                                const blob = new Blob([icsContent], { type: 'text/calendar' });
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.setAttribute('download', 'laundry-booking.ics');
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                            className="glass-button"
                            style={{ padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px', justifyContent: 'center' }}
                        >
                            <Download size={18} />
                            <span style={{ fontSize: '14px', fontWeight: 500 }}>Apple/Outlook</span>
                        </button>
                    </div>
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
            )
            }
        </div >

        {/* History */}
        {
            history.length > 0 && (
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
            )
        }
        {/* Inline Feedback Section */}
        <DashboardFeedback />
    </div>
);
}
