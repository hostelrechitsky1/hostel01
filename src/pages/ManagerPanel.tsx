import { useEffect, useState, useMemo } from 'react';
import { Trash2, ShieldCheck, Printer, Plus, AlertTriangle, Database, Calendar } from 'lucide-react';
// bookingService removed
import { firestoreService } from '../services/firestoreService';
import { studentsRawData } from '../data/studentsRaw';
import type { Booking, Machine, Student, Feedback, Banner } from '../types';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function ManagerPanel() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [showBannerForm, setShowBannerForm] = useState(false);
    const [newBanner, setNewBanner] = useState({ title: '', imageUrl: '', linkUrl: '', priority: 1 });
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({ forceShowNextWeek: false, forceCloseBookings: false });
    const navigate = useNavigate();

    useEffect(() => {
        if (!sessionStorage.getItem('manager_auth')) {
            navigate('/manager/login');
        }
        refreshData();
    }, []);

    const refreshData = async () => {
        setLoading(true);
        try {
            const [fetchedBookings, fetchedMachines, fetchedStudents, fetchedSettings, fetchedFeedbacks, fetchedBanners] = await Promise.all([
                firestoreService.getBookings(),
                firestoreService.getMachines(),
                firestoreService.getAllStudents(),
                firestoreService.getSettings(),
                firestoreService.getFeedbacks(),
                firestoreService.getBanners()
            ]);
            setBookings(fetchedBookings);
            setMachines(fetchedMachines);
            setStudents(fetchedStudents);
            setSettings(fetchedSettings);
            setFeedbacks(fetchedFeedbacks);
            setBanners(fetchedBanners);
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

    // --- Banner Management ---
    // Helper to convert Google Drive share links to direct image URLs
    const getDirectImageUrl = (url: string): string => {
        if (url.includes('drive.google.com')) {
            const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1920`;
            }
        }
        return url;
    };

    const handleAddBanner = async () => {
        if (!newBanner.imageUrl) {
            alert('Please enter an image URL');
            return;
        }
        const finalImageUrl = getDirectImageUrl(newBanner.imageUrl);
        const banner: Banner = {
            id: `banner-${Date.now()}`,
            title: newBanner.title, // Allow empty title
            imageUrl: finalImageUrl,
            linkUrl: newBanner.linkUrl,
            priority: newBanner.priority,
            isActive: true,
            createdAt: Date.now(),
            type: 'image'
        };
        await firestoreService.addBanner(banner);
        setNewBanner({ title: '', imageUrl: '', linkUrl: '', priority: 1 });
        setShowBannerForm(false);
        refreshData();
    };

    const handleDeleteBanner = async (id: string) => {
        if (confirm('Delete this banner?')) {
            await firestoreService.deleteBanner(id);
            refreshData();
        }
    };

    const toggleBanner = async (banner: Banner) => {
        await firestoreService.toggleBannerStatus(banner.id, !banner.isActive);
        refreshData();
    };

    // --- Resident Management ---
    const handleAddStudent = async () => {
        const name = prompt('Enter Student Name:');
        if (!name) return;
        const room = prompt('Enter Room Number (e.g. 101):');
        if (!room) return;

        // Auto-generate PIN if exists for room, else new
        const existingStudent = students.find(s => s.roomNumber === room);
        const pin = existingStudent?.pin || Math.floor(100 + Math.random() * 900).toString();

        const newStudent: Student = {
            id: `${room}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name,
            roomNumber: room,
            pin
        };

        // We need a proper addStudent method in service, but setDoc works
        // Using direct firestoreService internals isn't ideal but we can add method to service or just use setDoc here?
        // Better to add method to service.
        await firestoreService.addStudent(newStudent);
        refreshData();
    };

    const handleDeleteStudent = async (student: Student) => {
        if (confirm(`Remove ${student.name} from Room ${student.roomNumber}?`)) {
            await firestoreService.deleteStudent(student.id);
            refreshData();
        }
    };

    const handleEditStudent = async (student: Student) => {
        const newName = prompt('Edit Name:', student.name);
        if (newName && newName !== student.name) {
            const updated = { ...student, name: newName };
            await firestoreService.updateStudent(updated);
            refreshData();
        }
    };

    const handleSeedDatabase = async () => {
        if (confirm('⚠️ WARNING: This will RESET all Room PINs and re-seed the student list.\n\nAll existing PINs will stop working.\nAre you sure?')) {
            setLoading(true);
            try {
                await firestoreService.seedStudents(studentsRawData);
                alert('Database reset complete. New PINs generated.');
                refreshData();
            } catch (e) {
                alert('Error: ' + e);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleClearBookings = async () => {
        if (confirm('⚠️ WARNING: This will DELETE ALL BOOKINGS.\n\nThis cannot be undone. Are you sure?')) {
            setLoading(true);
            try {
                await firestoreService.clearAllBookings();
                alert('All bookings cleared.');
                refreshData();
            } catch (e) {
                alert('Error: ' + e);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleToggleSetting = async (key: 'forceShowNextWeek' | 'forceCloseBookings') => {
        // @ts-ignore
        const newValue = !settings[key];

        const messages = {
            forceShowNextWeek: newValue ? "This will OPEN booking immediately." : "Returning to automatic schedule.",
            forceCloseBookings: newValue ? "This will CLOSE booking immediately (Kill Switch)." : "Booking will follow schedule rules."
        };

        // @ts-ignore
        if (confirm(messages[key])) {
            await firestoreService.updateSettings({ [key]: newValue });
            refreshData();
        }
    };

    if (loading && bookings.length === 0 && machines.length === 0) {
        return <div className="flex-center" style={{ height: '100vh' }}>Loading Admin Panel...</div>;
    }

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '80px', maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h2>Manager Panel</h2>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/manager/print-credentials')}
                        className="glass-button"
                        style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <ShieldCheck size={16} /> Print Codes
                    </button>
                    <button
                        onClick={() => navigate('/manager/print-schedule')}
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
                {/* Global Settings */}
                <section>
                    <div className="grid-cols-2">
                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Calendar size={20} className="text-primary" /> Schedule Controls
                                </h3>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                    {settings.forceCloseBookings
                                        ? <span style={{ color: 'var(--error)' }}>CLOSED (Forced)</span>
                                        : settings.forceShowNextWeek
                                            ? <span style={{ color: 'var(--success)' }}>OPEN (Forced)</span>
                                            : <span>Auto: Sat 4PM - Mon 9AM</span>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                <button
                                    onClick={() => handleToggleSetting('forceCloseBookings')}
                                    className="glass-button"
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        background: settings.forceCloseBookings ? 'rgba(239, 68, 68, 0.2)' : undefined,
                                        color: settings.forceCloseBookings ? 'var(--error)' : undefined,
                                        border: settings.forceCloseBookings ? '1px solid var(--error)' : undefined,
                                        fontSize: '12px'
                                    }}
                                >
                                    {settings.forceCloseBookings ? 'Unlock Booking' : 'Force Close'}
                                </button>
                                <button
                                    onClick={() => handleToggleSetting('forceShowNextWeek')}
                                    className={settings.forceShowNextWeek ? 'primary-button' : 'glass-button'}
                                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px' }}
                                >
                                    {settings.forceShowNextWeek ? 'Disable Open' : 'Force Open'}
                                </button>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div>
                                <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)' }}>
                                    <AlertTriangle size={20} /> Danger Zone
                                </h3>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                    Destructive Actions
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                <button
                                    onClick={handleClearBookings}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        background: 'rgba(239, 68, 68, 0.2)',
                                        color: 'var(--error)',
                                        border: '1px solid var(--error)',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    <Trash2 size={14} style={{ marginRight: '8px' }} /> Clear All Books
                                </button>
                                <button
                                    onClick={handleSeedDatabase}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        background: 'rgba(239, 68, 68, 0.2)',
                                        color: 'var(--error)',
                                        border: '1px solid var(--error)',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    <Database size={14} style={{ marginRight: '8px' }} /> Reset DB/PINs
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

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

                {/* Banners Management */}
                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0 }}>Banners & Announcements ({banners.length})</h3>
                        <button
                            onClick={() => setShowBannerForm(!showBannerForm)}
                            className="primary-button"
                            style={{ padding: '10px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Plus size={18} /> Add Banner
                        </button>
                    </div>

                    {showBannerForm && (
                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', marginBottom: '24px', animation: 'fadeIn 0.3s ease-out' }}>
                            <h4 style={{ margin: '0 0 16px 0' }}>New Announcement</h4>
                            <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '6px', color: 'var(--text-muted)' }}>Image URL (Wide landscape image best)</label>
                                    <input
                                        type="text"
                                        placeholder="https://imgur.com/..."
                                        value={newBanner.imageUrl}
                                        onChange={(e) => setNewBanner({ ...newBanner, imageUrl: e.target.value })}
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '6px', color: 'var(--text-muted)' }}>Title (Optional - Leave empty if text is in image)</label>
                                    <input
                                        type="text"
                                        placeholder="Leave empty to show only image"
                                        value={newBanner.title}
                                        onChange={(e) => setNewBanner({ ...newBanner, title: e.target.value })}
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                    />
                                </div>
                                <div className="grid-cols-2">
                                    <div>
                                        <label style={{ fontSize: '12px', display: 'block', marginBottom: '6px', color: 'var(--text-muted)' }}>Action Link (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="https://..."
                                            value={newBanner.linkUrl}
                                            onChange={(e) => setNewBanner({ ...newBanner, linkUrl: e.target.value })}
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', display: 'block', marginBottom: '6px', color: 'var(--text-muted)' }}>Priority (1 = Top)</label>
                                        <input
                                            type="number"
                                            value={newBanner.priority}
                                            onChange={(e) => setNewBanner({ ...newBanner, priority: parseInt(e.target.value) })}
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                                        />
                                    </div>
                                </div>

                                {newBanner.imageUrl && (
                                    <div>
                                        <label style={{ fontSize: '12px', display: 'block', marginBottom: '6px', color: 'var(--text-muted)' }}>Preview</label>
                                        <div className="banner-card-preview" style={{
                                            background: '#1f2937', // Debug background
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}>
                                            {/* Preview Image using direct URL helper but simple img tag for preview */}
                                            <img
                                                src={getDirectImageUrl(newBanner.imageUrl)}
                                                alt="Preview"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                referrerPolicy="no-referrer"
                                                onError={(e) => e.currentTarget.style.display = 'none'}
                                            />

                                            {newBanner.title && (
                                                <div className="banner-card-overlay">
                                                    <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{newBanner.title}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                    <button onClick={handleAddBanner} className="primary-button" style={{ flex: 1, padding: '12px', borderRadius: '8px' }}>Post Announcement</button>
                                    <button onClick={() => setShowBannerForm(false)} className="glass-button" style={{ padding: '12px 24px', borderRadius: '8px' }}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid-cols-2" style={{ marginBottom: '32px' }}>
                        {banners.map(b => (
                            <div key={b.id} className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden', position: 'relative', border: b.isActive ? '1px solid var(--primary)' : '1px solid var(--glass-border)', opacity: b.isActive ? 1 : 0.6 }}>
                                <div style={{ height: '140px', background: '#1f2937', position: 'relative', overflow: 'hidden' }}>
                                    <img
                                        src={b.imageUrl}
                                        alt="Banner"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        referrerPolicy="no-referrer"
                                    />
                                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }} />
                                    <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', color: 'white' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>{b.title}</div>
                                        <div style={{ fontSize: '10px', opacity: 0.8 }}>Priority: {b.priority} • {format(b.createdAt, 'MMM d')}</div>
                                    </div>
                                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: b.isActive ? 'var(--success)' : 'var(--text-muted)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                        {b.isActive ? 'LIVE' : 'HIDDEN'}
                                    </div>
                                </div>
                                <div style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => toggleBanner(b)}
                                        className="glass-button"
                                        style={{ flex: 1, fontSize: '12px', padding: '8px', borderRadius: '6px' }}
                                    >
                                        {b.isActive ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteBanner(b.id)}
                                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {banners.length === 0 && !showBannerForm && (
                            <div className="glass-panel" style={{ padding: '32px', gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '16px' }}>
                                No banners yet. Click "Add Banner" to start.
                            </div>
                        )}
                    </div>
                </section>

                {/* Resident Management */}
                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0 }}>Residents</h3>
                        <button
                            onClick={handleAddStudent}
                            className="primary-button"
                            style={{ padding: '10px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Plus size={18} /> Add Resident
                        </button>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <input
                            type="text"
                            placeholder="Search residents by Name or Room..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                background: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-main)',
                                fontSize: '16px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div className="glass-panel" style={{ maxHeight: '400px', overflowY: 'auto', padding: 0, borderRadius: '16px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead style={{ background: 'rgba(255,255,255,0.05)', position: 'sticky', top: 0, backdropFilter: 'blur(10px)' }}>
                                <tr>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Room</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Name</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students
                                    .filter(s =>
                                        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        s.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
                                    .slice(0, 50) // Limit display for perf
                                    .map(s => (
                                        <tr key={s.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                            <td style={{ padding: '12px', fontWeight: 600 }}>{s.roomNumber}</td>
                                            <td style={{ padding: '12px' }}>{s.name}</td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                <button onClick={() => handleEditStudent(s)} style={{ marginRight: '8px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--primary)' }}>Edit</button>
                                                <button onClick={() => handleDeleteStudent(s)} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--error)' }}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                        {students.length === 0 && <div className="p-4 text-center">No students found. Seed DB?</div>}
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

                {/* Feedback Section */}
                <section>
                    <h3 style={{ marginBottom: '16px' }}>Student Feedback ({feedbacks.length})</h3>
                    <div className="glass-panel" style={{ padding: 0, borderRadius: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                        {feedbacks.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead style={{ background: 'rgba(255,255,255,0.05)', position: 'sticky', top: 0, backdropFilter: 'blur(10px)' }}>
                                    <tr>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Type</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>From</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Message</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Time</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {feedbacks.map(f => (
                                        <tr key={f.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{
                                                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
                                                    background: f.type === 'bug' ? 'rgba(239, 68, 68, 0.2)' : f.type === 'feature' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                                                    color: f.type === 'bug' ? '#ef4444' : f.type === 'feature' ? '#3b82f6' : '#9ca3af'
                                                }}>
                                                    {f.type.toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <div style={{ fontWeight: 600 }}>{f.studentName}</div>
                                                <div style={{ fontSize: '12px', opacity: 0.7 }}>Room {f.roomNumber}</div>
                                            </td>
                                            <td style={{ padding: '12px' }}>{f.text}</td>
                                            <td style={{ padding: '12px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {format(f.timestamp, 'MMM d, H:mm')}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                <button
                                                    onClick={async () => {
                                                        if (confirm('Delete feedback?')) {
                                                            await firestoreService.deleteFeedback(f.id);
                                                            const [fb] = await Promise.all([firestoreService.getFeedbacks()]);
                                                            setFeedbacks(fb);
                                                        }
                                                    }}
                                                    style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No feedback yet.</div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
