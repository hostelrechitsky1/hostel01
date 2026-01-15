import { useEffect, useState } from 'react';
import { Plus, AlertTriangle, Printer, Trash2 } from 'lucide-react';
import { bookingService } from '../services/bookingService';
import type { Booking, Machine, Student } from '../types';
import { useNavigate } from 'react-router-dom';


export default function AdminPanel() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        // In real app, check admin auth here. For now, open.
        refreshData();
    }, []);

    const refreshData = () => {
        const currentBookings = bookingService.getBookings();
        setBookings(currentBookings);
        setMachines(bookingService.getMachines());
        setStudents(bookingService.getStudents());
    };

    const toggleMachine = (id: string) => {
        bookingService.toggleMachineStatus(id);
        refreshData();
    };

    const handleAddMachine = () => {
        const name = prompt('Enter New Machine Name (e.g. Machine 5)');
        if (name) {
            bookingService.addMachine(name);
            refreshData();
        }
    };

    const handleDeleteMachine = (id: string, machineName: string) => {
        if (confirm(`Permanently delete ${machineName}? This will also remove all bookings for this machine.`)) {
            bookingService.deleteMachine(id);
            refreshData();
        }
    };

    const cancelBooking = (id: string) => {
        if (confirm('Are you sure you want to cancel this booking?')) {
            bookingService.cancelBooking(id);
            refreshData();
        }
    };

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '80px', maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h2>Admin Panel</h2>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/admin/print-schedule')}
                        className="glass-button"
                        style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Printer size={16} /> Print Schedule
                    </button>
                    <button onClick={() => navigate('/')} className="glass-button" style={{ padding: '8px 16px', borderRadius: '8px' }}>
                        Exit
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '32px' }}>
                {/* Machine Management */}
                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0 }}>Machine Management</h3>
                        <button
                            onClick={handleAddMachine}
                            className="primary-button"
                            style={{ padding: '12px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Plus size={20} /> Add Machine
                        </button>
                    </div>
                    <div className="grid-cols-2">
                        {machines.map(m => (
                            <div key={m.id} className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                                        <div style={{ fontSize: '12px', color: m.status === 'available' ? 'var(--success)' : 'var(--error)' }}>{m.status}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => toggleMachine(m.id)}
                                        className="glass-button"
                                        style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', flex: 1 }}
                                    >
                                        {m.status === 'available' ? 'Disable' : 'Enable'}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteMachine(m.id, m.name)}
                                        style={{
                                            fontSize: '12px',
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(239, 68, 68, 0.15)',
                                            color: 'var(--error)',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Recent Bookings */}
                <section>
                    <h3 style={{ marginBottom: '16px' }}>All Bookings ({bookings.length})</h3>
                    <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '600px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                    <th style={{ padding: '16px' }}>Date</th>
                                    <th style={{ padding: '16px' }}>Time</th>
                                    <th style={{ padding: '16px' }}>Student</th>
                                    <th style={{ padding: '16px' }}>Machine</th>
                                    <th style={{ padding: '16px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map(b => {
                                    const student = students.find(s => s.id === b.studentId);
                                    const machine = machines.find(m => m.id === b.machineId);
                                    return (
                                        <tr key={b.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                            <td style={{ padding: '16px' }}>{b.date}</td>
                                            <td style={{ padding: '16px' }}>{b.startTime}</td>
                                            <td style={{ padding: '16px' }}>{student?.name} ({student?.roomNumber})</td>
                                            <td style={{ padding: '16px' }}>{machine?.name}</td>
                                            <td style={{ padding: '16px' }}>
                                                <button
                                                    onClick={() => cancelBooking(b.id)}
                                                    style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {bookings.length === 0 && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No bookings found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <div style={{ padding: '0 0px 40px' }}>
                    <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', marginBottom: '24px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '12px', color: '#ef4444' }}>
                            <AlertTriangle /> Danger Zone
                        </h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Resetting the system will delete ALL bookings and restore the default machine list.
                            Use this if the data gets corrupted or you want to start fresh.
                        </p>
                        <button
                            onClick={() => {
                                if (confirm('Are you sure? This will wipe all bookings.')) {
                                    bookingService.resetData();
                                    alert('System Reset Complete. Reloading...');
                                    window.location.reload();
                                }
                            }}
                            style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.5)',
                                padding: '12px 24px',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            Reset System Data
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
