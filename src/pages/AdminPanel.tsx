import { useEffect, useState, useMemo } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
// bookingService removed
import { firestoreService } from '../services/firestoreService';
import type { Booking, Machine, Student } from '../types';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function AdminPanel() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        // In real app, check admin auth here. For now, open.
        refreshData();
    }, []);

    const refreshData = async () => {
        setLoading(true);
        try {
            const [fetchedBookings, fetchedMachines, fetchedStudents] = await Promise.all([
                firestoreService.getBookings(),
                firestoreService.getMachines(),
                firestoreService.getAllStudents()
            ]);
            setBookings(fetchedBookings);
            setMachines(fetchedMachines);
            setStudents(fetchedStudents);
        } catch (error) {
            console.error("Failed to load admin data", error);
            alert("Failed to load data from database.");
        } finally {
            setLoading(false);
        }
    };

    const filteredBookings = useMemo(() => {
        return bookings.filter(b => {
            const student = students.find(s => s.id === b.studentId); // Use studentId
            const machine = machines.find(m => m.id === b.machineId);
            const searchLower = searchTerm.toLowerCase();

            return (
                student?.name.toLowerCase().includes(searchLower) ||
                student?.roomNumber.toLowerCase().includes(searchLower) ||
                machine?.name.toLowerCase().includes(searchLower)
            );
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [bookings, students, machines, searchTerm]);

    const toggleMachine = async (machine: Machine) => {
        const newStatus = machine.status === 'available' ? 'maintenance' : 'available';
        await firestoreService.updateMachineStatus(machine.id, newStatus);
        refreshData();
    };

    const handleAddMachine = async () => {
        const name = prompt('Enter New Machine Name (e.g. Machine 5)');
        if (name) {
            await firestoreService.addMachine(name);
            refreshData();
        }
    };

    const handleDeleteMachine = async (id: string, machineName: string) => {
        if (confirm(`Permanently delete ${machineName}? This will also remove all bookings for this machine.`)) {
            // Note: Ideally backend should cascade delete bookings, doing it here logicially
            await firestoreService.deleteMachine(id);
            refreshData();
        }
    };

    const cancelBooking = async (id: string) => {
        if (confirm('Are you sure you want to cancel this booking?')) {
            await firestoreService.cancelBooking(id);
            refreshData();
        }
    };

    if (loading && bookings.length === 0 && machines.length === 0) {
        return <div className="flex-center" style={{ height: '100vh' }}>Loading Admin Panel...</div>;
    }

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
                                        onClick={() => toggleMachine(m)}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <h3 style={{ margin: 0 }}>All Bookings ({bookings.length})</h3>
                        <input
                            type="text"
                            placeholder="Search Name or Room..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '10px 16px',
                                borderRadius: '12px',
                                border: '1px solid var(--glass-border)',
                                background: 'var(--glass-bg)',
                                color: 'var(--text-main)',
                                outline: 'none',
                                width: '100%',
                                maxWidth: '250px'
                            }}
                        />
                    </div>

                    <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden', background: 'none', border: 'none', padding: 0 }}>
                        {filteredBookings.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {filteredBookings.map(b => {
                                    const student = students.find(s => s.id === b.studentId);
                                    const machine = machines.find(m => m.id === b.machineId);
                                    return (
                                        <div key={b.id} className="glass-panel" style={{ padding: '16px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '16px' }}>
                                                    {student?.name || 'Unknown'} <span style={{ opacity: 0.7, fontSize: '14px' }}>({student?.roomNumber || '?'})</span>
                                                </div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {format(new Date(b.date), 'MMM d')} • {b.startTime} • {machine?.name || 'Unknown Machine'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => cancelBooking(b.id)}
                                                style={{
                                                    color: 'var(--error)',
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                    borderRadius: '8px',
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: '13px'
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '16px' }}>
                                No bookings found matching "{searchTerm}"
                            </div>
                        )}
                    </div>
                </section>

                {/* Removed Global Reset for safety */}
            </div>
        </div>
    );
}
