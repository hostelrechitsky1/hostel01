import { useEffect, useState, useMemo } from 'react';
import { Trash2, ShieldCheck, Printer, Plus, AlertTriangle, Database } from 'lucide-react';
// bookingService removed
import { firestoreService } from '../services/firestoreService';
import { studentsRawData } from '../data/studentsRaw';
import type { Booking, Machine, Student, Feedback, Banner, AppSettings, VipRecurringRule } from '../types';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAdminDialog } from '../components/useAdminDialog';
import { TIME_SLOTS } from '../types';
import { addBelarusDays, formatBelarusDate, getBelarusDate, getBelarusWeekId, getBelarusWeekStart } from '../utils/time';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ManagerPanel() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [vipRules, setVipRules] = useState<VipRecurringRule[]>([]);
    const [showBannerForm, setShowBannerForm] = useState(false);
    const [newBanner, setNewBanner] = useState({ title: '', imageUrl: '', linkUrl: '', priority: 1 });
    const [searchTerm, setSearchTerm] = useState('');
    const [bookingPage, setBookingPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [vipForm, setVipForm] = useState({
        studentId: '',
        machineId: '',
        weekday: 6,
        startTime: '16:30'
    });
    const [settings, setSettings] = useState<AppSettings>({
        forceShowNextWeek: false,
        forceCloseBookings: false,
        maintenanceDay: 3,
        autoOpenWeekday: 6,
        autoOpenTime: '16:00',
        autoOpenDurationHours: 28,
        topAlert: { message: '', isActive: false, type: 'info' }
    });
    const navigate = useNavigate();
    const { alertDialog, confirmDialog, promptDialog, dialogNode } = useAdminDialog();

    useEffect(() => {
        if (!sessionStorage.getItem('manager_auth')) {
            navigate('/manager/login');
        }
        refreshData();
    }, []);

    const refreshData = async () => {
        setLoading(true);
        try {
            const [fetchedBookings, fetchedMachines, fetchedStudents, fetchedSettings, fetchedFeedbacks, fetchedBanners, fetchedVipRules] = await Promise.all([
                firestoreService.getBookings(),
                firestoreService.getMachines(),
                firestoreService.getAllStudents(),
                firestoreService.getSettings(),
                firestoreService.getFeedbacks(),
                firestoreService.getBanners(),
                firestoreService.getVipRecurringRules()
            ]);
            setBookings(fetchedBookings);
            setMachines(fetchedMachines);
            setStudents(fetchedStudents);
            setSettings(fetchedSettings);
            setFeedbacks(fetchedFeedbacks);
            setBanners(fetchedBanners);
            setVipRules(fetchedVipRules);
        } catch (error) {
            console.error("Failed to load admin data", error);
            await alertDialog('Load Failed', 'Failed to load data from database.');
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

    const BOOKING_ITEMS_PER_PAGE = 12;
    const totalBookingPages = Math.max(1, Math.ceil(filteredBookings.length / BOOKING_ITEMS_PER_PAGE));

    const paginatedBookings = useMemo(() => {
        const start = (bookingPage - 1) * BOOKING_ITEMS_PER_PAGE;
        return filteredBookings.slice(start, start + BOOKING_ITEMS_PER_PAGE);
    }, [filteredBookings, bookingPage]);

    useEffect(() => {
        setBookingPage(1);
    }, [searchTerm, bookings.length]);

    useEffect(() => {
        if (bookingPage > totalBookingPages) {
            setBookingPage(totalBookingPages);
        }
    }, [bookingPage, totalBookingPages]);


    const toggleMachine = async (machine: Machine) => {
        const newStatus = machine.status === 'available' ? 'maintenance' : 'available';
        await firestoreService.updateMachineStatus(machine.id, newStatus);
        refreshData();
    };

    const handleAddMachine = async () => {
        const name = await promptDialog('Add Machine', 'Enter New Machine Name (e.g. Machine 5)', {
            placeholder: 'Machine name',
            confirmText: 'Add Machine'
        });
        if (name?.trim()) {
            await firestoreService.addMachine(name.trim());
            refreshData();
        }
    };

    const handleDeleteMachine = async (id: string, machineName: string) => {
        const confirmed = await confirmDialog(
            'Delete Machine?',
            `Permanently delete ${machineName}? This will also remove all bookings for this machine.`,
            { confirmText: 'Delete', cancelText: 'Cancel', isDanger: true }
        );
        if (confirmed) {
            await firestoreService.deleteMachine(id);
            refreshData();
        }
    };

    const cancelBooking = async (id: string) => {
        const confirmed = await confirmDialog('Cancel Booking?', 'Are you sure you want to cancel this booking?', {
            confirmText: 'Cancel Booking',
            cancelText: 'Keep Booking',
            isDanger: true
        });
        if (confirmed) {
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
            await alertDialog('Banner Image Required', 'Please enter an image URL.');
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
        const confirmed = await confirmDialog('Delete Banner?', 'Delete this banner?', {
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDanger: true
        });
        if (confirmed) {
            await firestoreService.deleteBanner(id);
            refreshData();
        }
    };

    const toggleBanner = async (banner: Banner) => {
        await firestoreService.toggleBannerStatus(banner.id, !banner.isActive);
        refreshData();
    };

    // --- VIP Recurring Booking Management ---
    const handleAddVipRule = async () => {
        if (!vipForm.studentId || !vipForm.machineId || !vipForm.startTime) {
            await alertDialog('Missing Fields', 'Please select student, machine, day, and time.');
            return;
        }

        const existing = vipRules.find(rule =>
            rule.studentId === vipForm.studentId &&
            rule.machineId === vipForm.machineId &&
            rule.weekday === vipForm.weekday &&
            rule.startTime === vipForm.startTime
        );
        if (existing) {
            await alertDialog('Rule Exists', 'This exact VIP recurring rule already exists.');
            return;
        }

        const newRule: VipRecurringRule = {
            id: `vip-${Date.now()}`,
            studentId: vipForm.studentId,
            machineId: vipForm.machineId,
            weekday: vipForm.weekday,
            startTime: vipForm.startTime,
            isActive: true,
            createdAt: Date.now()
        };

        await firestoreService.addVipRecurringRule(newRule);
        await refreshData();
    };

    const toggleVipRule = async (rule: VipRecurringRule) => {
        await firestoreService.toggleVipRecurringRule(rule.id, !rule.isActive);
        await refreshData();
    };

    const handleDeleteVipRule = async (rule: VipRecurringRule) => {
        const confirmed = await confirmDialog('Delete VIP Rule?', 'Delete this recurring VIP booking rule?', {
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDanger: true
        });
        if (!confirmed) return;

        await firestoreService.deleteVipRecurringRule(rule.id);
        await refreshData();
    };

    const handleApplyVipForNextWeek = async () => {
        const activeRules = vipRules.filter(rule => rule.isActive);
        if (activeRules.length === 0) {
            await alertDialog('No Active Rules', 'Enable or add at least one VIP rule first.');
            return;
        }

        setLoading(true);
        try {
            const nextWeekStart = addBelarusDays(getBelarusWeekStart(getBelarusDate()), 7);
            const nextWeekId = getBelarusWeekId(nextWeekStart);
            const maintenanceDay = settings.maintenanceDay ?? 3;

            let success = 0;
            let skipped = 0;

            for (const rule of activeRules) {
                const student = students.find(s => s.id === rule.studentId);
                const machine = machines.find(m => m.id === rule.machineId);

                if (!student || !machine || machine.status === 'maintenance') {
                    skipped += 1;
                    continue;
                }

                if (rule.weekday === maintenanceDay) {
                    skipped += 1;
                    continue;
                }

                const dayOffset = rule.weekday === 0 ? 6 : rule.weekday - 1;
                const targetDate = addBelarusDays(nextWeekStart, dayOffset);
                const targetDateStr = formatBelarusDate(targetDate);

                const [hour, minute] = rule.startTime.split(':').map(Number);
                const endMinutes = (hour * 60) + minute + 90;
                const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

                const bookingPayload: Booking = {
                    id: `${targetDateStr}_${rule.machineId}_${rule.startTime.replace(':', '-')}`,
                    machineId: rule.machineId,
                    studentId: student.id,
                    studentName: student.name,
                    roomNumber: student.roomNumber,
                    date: targetDateStr,
                    startTime: rule.startTime,
                    endTime,
                    weekId: nextWeekId,
                    createdAt: Date.now()
                };

                const result = await firestoreService.createBooking(bookingPayload);
                if (result.success) {
                    success += 1;
                } else {
                    skipped += 1;
                }
            }

            await alertDialog(
                'VIP Apply Complete',
                `Applied for week ${nextWeekId}.\nSuccess: ${success}\nSkipped: ${skipped}`
            );
            await refreshData();
        } catch (error) {
            console.error('VIP apply failed', error);
            await alertDialog('VIP Apply Failed', 'Could not apply VIP recurring bookings.');
        } finally {
            setLoading(false);
        }
    };

    // --- Resident Management ---
    const handleAddStudent = async () => {
        const name = await promptDialog('Add Resident', 'Enter Student Name:', {
            placeholder: 'Student name',
            confirmText: 'Next'
        });
        if (!name?.trim()) return;

        const room = await promptDialog('Add Resident', 'Enter Room Number (e.g. 101):', {
            placeholder: 'Room number',
            confirmText: 'Create'
        });
        if (!room?.trim()) return;

        // Preserve existing room PIN so current residents are never locked out.
        const normalizedRoom = room.trim();
        const normalizedName = name.trim();
        const existingStudent = students.find(s => s.roomNumber === normalizedRoom);
        const pin = existingStudent?.pin || Math.floor(100 + Math.random() * 900).toString();

        const newStudent: Student = {
            id: `${normalizedRoom}-${normalizedName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name: normalizedName,
            roomNumber: normalizedRoom,
            pin
        };

        await firestoreService.addStudent(newStudent);
        await alertDialog('Resident Added', `Name: ${newStudent.name}\nRoom: ${newStudent.roomNumber}\nPIN: ${newStudent.pin}`);
        refreshData();
    };

    const verifyManagerBeforePrintingCodes = async () => {
        const enteredPassword = await promptDialog('Security Check', 'Enter manager password to open Print Codes', {
            placeholder: 'Password',
            inputType: 'password',
            confirmText: 'Verify'
        });
        if (!enteredPassword) return;

        const correctPassword = import.meta.env.VITE_MANAGER_PASSWORD || 'admin123';
        if (enteredPassword !== correctPassword) {
            await alertDialog('Access Denied', 'Incorrect password. Print Codes access denied.');
            return;
        }

        navigate('/manager/print-credentials');
    };

    const handleDeleteStudent = async (student: Student) => {
        const confirmed = await confirmDialog('Remove Resident?', `Remove ${student.name} from Room ${student.roomNumber}?`, {
            confirmText: 'Delete',
            cancelText: 'Keep',
            isDanger: true
        });
        if (confirmed) {
            await firestoreService.deleteStudent(student.id);
            refreshData();
        }
    };

    const handleEditStudent = async (student: Student) => {
        const newName = await promptDialog('Edit Resident', 'Update resident name:', {
            defaultValue: student.name,
            confirmText: 'Save'
        });
        if (newName && newName.trim() && newName.trim() !== student.name) {
            const updated = { ...student, name: newName.trim() };
            await firestoreService.updateStudent(updated);
            refreshData();
        }
    };

    const handleSeedDatabase = async () => {
        const confirmed = await confirmDialog(
            'Reset Room PINs?',
            'This will reset all room PINs and re-seed the student list. Existing PINs will stop working.',
            { confirmText: 'Reset PINs', cancelText: 'Cancel', isDanger: true }
        );
        if (confirmed) {
            setLoading(true);
            try {
                await firestoreService.seedStudents(studentsRawData);
                await alertDialog('Database Reset Complete', 'New PINs were generated successfully.');
                refreshData();
            } catch (e) {
                await alertDialog('Reset Failed', 'Error: ' + e);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleClearBookings = async () => {
        const confirmed = await confirmDialog(
            'Delete All Bookings?',
            'This will permanently delete all bookings. This action cannot be undone.',
            { confirmText: 'Delete All', cancelText: 'Cancel', isDanger: true }
        );
        if (confirmed) {
            setLoading(true);
            try {
                await firestoreService.clearAllBookings();
                await alertDialog('Bookings Cleared', 'All bookings were deleted.');
                refreshData();
            } catch (e) {
                await alertDialog('Delete Failed', 'Error: ' + e);
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
        const confirmed = await confirmDialog('Confirm Setting Update', messages[key]);
        if (confirmed) {
            await firestoreService.updateSettings({ [key]: newValue });
            refreshData();
        }
    };

    const updateSettings = async (newSettings: Partial<AppSettings>) => {
        try {
            await firestoreService.updateSettings(newSettings);
            // Optimistic update
            setSettings(prev => ({ ...prev, ...newSettings }));
        } catch (error) {
            console.error("Failed to update settings:", error);
            await alertDialog('Save Failed', 'Failed to save settings.');
        }
    };

    if (loading && bookings.length === 0 && machines.length === 0) {
        return <div className="flex-center" style={{ height: '100vh' }}>Loading Admin Panel...</div>;
    }

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '80px', maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '12px', flexWrap: 'wrap' }}>
                <h2>Manager Panel</h2>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={verifyManagerBeforePrintingCodes}
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
                <div style={{ background: '#1f2937', padding: '24px', borderRadius: '16px', border: '1px solid #374151' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #374151' }}>
                        <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
                            <AlertTriangle size={24} color="#3b82f6" />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'white' }}>System Configuration</h2>
                    </div>

                    <div style={{ display: 'grid', gap: '24px' }}>
                        {/* Maintenance Schedule */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#9ca3af' }}>Maintenance Day</label>
                            <select
                                value={settings.maintenanceDay ?? 3} // Default Wed
                                onChange={(e) => updateSettings({ maintenanceDay: parseInt(e.target.value) })}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    background: '#374151',
                                    border: '1px solid #4b5563',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                {WEEKDAY_LABELS.map((day, index) => (
                                    <option key={day} value={index}>{day}</option>
                                ))}
                            </select>
                            <p style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                                Students will see "Maintenance Day" on this day of the week.
                            </p>
                        </div>

                        {/* Auto Booking Opening */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500', color: '#9ca3af' }}>Auto Booking Opening</label>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#6b7280' }}>Open Day</label>
                                    <select
                                        value={settings.autoOpenWeekday ?? 6}
                                        onChange={(e) => updateSettings({ autoOpenWeekday: parseInt(e.target.value, 10) })}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            borderRadius: '8px',
                                            background: '#374151',
                                            border: '1px solid #4b5563',
                                            color: 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {WEEKDAY_LABELS.map((day, index) => (
                                            <option key={day} value={index}>{day}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#6b7280' }}>Open Time (Belarus)</label>
                                    <input
                                        type="time"
                                        value={settings.autoOpenTime || '16:00'}
                                        onChange={(e) => updateSettings({ autoOpenTime: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            borderRadius: '8px',
                                            background: '#374151',
                                            border: '1px solid #4b5563',
                                            color: 'white'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#6b7280' }}>Open Window (hours)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={168}
                                        value={settings.autoOpenDurationHours ?? 28}
                                        onChange={(e) => updateSettings({ autoOpenDurationHours: parseInt(e.target.value, 10) || 28 })}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            borderRadius: '8px',
                                            background: '#374151',
                                            border: '1px solid #4b5563',
                                            color: 'white'
                                        }}
                                    />
                                </div>
                            </div>
                            <p style={{ marginTop: '10px', fontSize: '13px', color: '#6b7280' }}>
                                Schedule opens automatically every {WEEKDAY_LABELS[settings.autoOpenWeekday ?? 6]} at {settings.autoOpenTime || '16:00'} (Belarus) for {settings.autoOpenDurationHours ?? 28} hours.
                            </p>
                        </div>

                        {/* Top Alert Configuration */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <label style={{ fontWeight: '500', color: '#9ca3af' }}>Top Dashboard Alert</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', color: settings.topAlert?.isActive ? '#4ade80' : '#ef4444' }}>
                                        {settings.topAlert?.isActive ? 'ACTIVE' : 'INACTIVE'}
                                    </span>
                                    <button
                                        onClick={() => updateSettings({ 
                                            topAlert: { ...settings.topAlert, isActive: !settings.topAlert?.isActive } as any 
                                        })}
                                        style={{
                                            background: settings.topAlert?.isActive ? '#10b981' : '#ef4444',
                                            width: '40px',
                                            height: '20px',
                                            borderRadius: '20px',
                                            position: 'relative',
                                            border: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute',
                                            left: settings.topAlert?.isActive ? '22px' : '2px',
                                            top: '2px',
                                            width: '16px',
                                            height: '16px',
                                            background: 'white',
                                            borderRadius: '50%',
                                            transition: 'all 0.2s'
                                        }} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '12px' }}>
                                <input
                                    type="text"
                                    placeholder="Alert Message (e.g. 'Gym is closed today')"
                                    value={settings.topAlert?.message || ''}
                                    onChange={(e) => {
                                        const newAlert = { ...settings.topAlert, message: e.target.value } as any;
                                        setSettings(prev => ({ ...prev, topAlert: newAlert }));
                                    }}
                                    onBlur={() => updateSettings({ topAlert: settings.topAlert })}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        background: '#374151',
                                        border: '1px solid #4b5563',
                                        color: 'white'
                                    }}
                                />
                                
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {(['info', 'warning', 'urgent'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => {
                                                const newAlert = { ...settings.topAlert, type };
                                                setSettings(prev => ({ ...prev, topAlert: newAlert as any }));
                                                updateSettings({ topAlert: newAlert as any });
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                borderRadius: '6px',
                                                border: '1px solid',
                                                borderColor: settings.topAlert?.type === type ? 'white' : 'transparent',
                                                background: type === 'urgent' ? 'rgba(239, 68, 68, 0.2)' : type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                                color: type === 'urgent' ? '#fca5a5' : type === 'warning' ? '#fcd34d' : '#93c5fd',
                                                cursor: 'pointer',
                                                fontWeight: settings.topAlert?.type === type ? 'bold' : 'normal',
                                                textTransform: 'capitalize'
                                            }}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            {settings.forceCloseBookings
                                ? <span style={{ color: 'var(--error)' }}>CLOSED (Forced)</span>
                                : settings.forceShowNextWeek
                                    ? <span style={{ color: 'var(--success)' }}>OPEN (Forced)</span>
                                    : <span>Auto: {WEEKDAY_LABELS[settings.autoOpenWeekday ?? 6]} {settings.autoOpenTime || '16:00'} ({settings.autoOpenDurationHours ?? 28}h)</span>}
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

            {/* VIP Recurring Booking Panel */}
            <section>
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>VIP Recurring Bookings ({vipRules.length})</h3>
                        <button
                            onClick={handleApplyVipForNextWeek}
                            className="primary-button"
                            style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}
                        >
                            Apply VIP for Next Week
                        </button>
                    </div>

                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '14px' }}>
                        <select
                            value={vipForm.studentId}
                            onChange={(e) => setVipForm(prev => ({ ...prev, studentId: e.target.value }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            <option value="">Select Student</option>
                            {students.map(student => (
                                <option key={student.id} value={student.id}>{student.name} (Room {student.roomNumber})</option>
                            ))}
                        </select>

                        <select
                            value={vipForm.machineId}
                            onChange={(e) => setVipForm(prev => ({ ...prev, machineId: e.target.value }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            <option value="">Select Machine</option>
                            {machines.map(machine => (
                                <option key={machine.id} value={machine.id}>{machine.name}</option>
                            ))}
                        </select>

                        <select
                            value={vipForm.weekday}
                            onChange={(e) => setVipForm(prev => ({ ...prev, weekday: Number(e.target.value) }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            {WEEKDAY_LABELS.map((day, idx) => (
                                <option key={day} value={idx}>{day}</option>
                            ))}
                        </select>

                        <select
                            value={vipForm.startTime}
                            onChange={(e) => setVipForm(prev => ({ ...prev, startTime: e.target.value }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            {TIME_SLOTS.map(slot => (
                                <option key={slot} value={slot}>{slot}</option>
                            ))}
                        </select>
                    </div>

                    <button onClick={handleAddVipRule} className="glass-button" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>
                        Add VIP Rule
                    </button>

                    <div style={{ display: 'grid', gap: '10px' }}>
                        {vipRules.map(rule => {
                            const student = students.find(s => s.id === rule.studentId);
                            const machine = machines.find(m => m.id === rule.machineId);

                            return (
                                <div key={rule.id} className="glass-panel" style={{ padding: '10px 12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '14px' }}>
                                        <strong>{student?.name || 'Unknown student'}</strong> · {machine?.name || 'Unknown machine'} · {WEEKDAY_LABELS[rule.weekday]} {rule.startTime}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => toggleVipRule(rule)} className="glass-button" style={{ padding: '6px 10px', borderRadius: '8px' }}>
                                            {rule.isActive ? 'Active' : 'Paused'}
                                        </button>
                                        <button onClick={() => handleDeleteVipRule(rule)} className="glass-button" style={{ padding: '6px 10px', borderRadius: '8px', borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {vipRules.length === 0 && (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                No VIP rules yet. Add a rule and click "Apply VIP for Next Week".
                            </div>
                        )}
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
                <div className="grid-auto-fit">
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
                            <div className="grid-auto-fit">
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

                <div className="grid-auto-fit" style={{ marginBottom: '32px' }}>
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

                <div className="glass-panel" style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'auto', padding: 0, borderRadius: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead style={{ background: 'rgba(255,255,255,0.05)', position: 'sticky', top: 0, backdropFilter: 'blur(10px)' }}>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Room</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Name</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>PIN</th>
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
                                        <td style={{ padding: '12px', fontFamily: 'monospace', letterSpacing: '0.5px' }}>{s.pin || '---'}</td>
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
                    <h3 style={{ margin: 0 }}>All Bookings ({filteredBookings.length})</h3>
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
                            {paginatedBookings.map(b => {
                                const student = students.find(s => s.id === b.studentId);
                                const machine = machines.find(m => m.id === b.machineId);
                                return (
                                    <div key={b.id} className="glass-panel" style={{ padding: '16px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '16px', wordBreak: 'break-word' }}>
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

                {filteredBookings.length > 0 && (
                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            Page {bookingPage} of {totalBookingPages}
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                className="glass-button"
                                onClick={() => setBookingPage((prev) => Math.max(1, prev - 1))}
                                disabled={bookingPage === 1}
                                style={{ padding: '8px 12px', borderRadius: '8px', opacity: bookingPage === 1 ? 0.5 : 1 }}
                            >
                                Previous
                            </button>
                            <button
                                className="glass-button"
                                onClick={() => setBookingPage((prev) => Math.min(totalBookingPages, prev + 1))}
                                disabled={bookingPage === totalBookingPages}
                                style={{ padding: '8px 12px', borderRadius: '8px', opacity: bookingPage === totalBookingPages ? 0.5 : 1 }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* Feedback Section */}
            <section>
                <h3 style={{ marginBottom: '16px' }}>Student Feedback ({feedbacks.length})</h3>
                <div className="glass-panel" style={{ padding: 0, borderRadius: '16px', maxHeight: '400px', overflowY: 'auto', overflowX: 'auto' }}>
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
                                                    const confirmed = await confirmDialog('Delete Feedback?', 'Delete this feedback entry?', {
                                                        confirmText: 'Delete',
                                                        cancelText: 'Cancel',
                                                        isDanger: true
                                                    });
                                                    if (confirmed) {
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
            {dialogNode}
        </div >

    );
}
