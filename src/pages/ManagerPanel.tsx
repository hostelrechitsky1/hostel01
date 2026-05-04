import { useEffect, useState, useMemo, useRef } from 'react';
import {
    Trash2,
    ShieldCheck,
    Printer,
    Plus,
    AlertTriangle,
    Database,
    MessageSquare,
    Reply,
    Send,
    Bug,
    Lightbulb,
    Sparkles,
    Clock3,
    CheckCircle2
} from 'lucide-react';
// bookingService removed
import { firestoreService } from '../services/firestoreService';
import { studentsRawData } from '../data/studentsRaw';
import type { Booking, Machine, Student, Feedback, Banner, AppSettings, VipRecurringRule } from '../types';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAdminDialog } from '../components/useAdminDialog';
import { toast } from 'sonner';
import { TIME_SLOTS } from '../types';
import { addBelarusDays, formatBelarusDate, getAutoOpenWindowDisplay, getBelarusDate, getBelarusWeekId, getBelarusWeekStart } from '../utils/time';
import { normalizeBannerSource } from '../utils/bannerImages';

const BOOKING_ITEMS_PER_PAGE = 12;
const INITIAL_RECENT_BOOKINGS_LIMIT = 80;
const INITIAL_RECENT_FEEDBACK_LIMIT = 40;
const feedbackTypeMeta = {
    bug: {
        label: 'Bug',
        color: '#f87171',
        background: 'rgba(239, 68, 68, 0.14)',
        border: 'rgba(239, 68, 68, 0.24)'
    },
    feature: {
        label: 'Suggestion',
        color: '#60a5fa',
        background: 'rgba(59, 130, 246, 0.14)',
        border: 'rgba(59, 130, 246, 0.24)'
    },
    other: {
        label: 'General',
        color: '#c4b5fd',
        background: 'rgba(139, 92, 246, 0.14)',
        border: 'rgba(139, 92, 246, 0.24)'
    }
} as const;

const getFeedbackTypeIcon = (type: Feedback['type']) => {
    if (type === 'bug') return Bug;
    if (type === 'feature') return Lightbulb;
    return Sparkles;
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const getManagerTopAlert = (topAlert: AppSettings['topAlert']) => ({
    message: topAlert?.message ?? '',
    isActive: topAlert?.isActive ?? false,
    type: topAlert?.type ?? 'info',
});

export default function ManagerPanel() {
    const cachedMachines = useMemo(() => firestoreService.getCachedMachines(), []);
    const cachedStudents = useMemo(() => firestoreService.getCachedStudents(), []);
    const cachedBanners = useMemo(() => firestoreService.getCachedBanners(), []);
    const cachedSettings = useMemo(() => firestoreService.getCachedSettings(), []);
    const cachedBookings = useMemo(() => firestoreService.getCachedRecentAdminBookings(INITIAL_RECENT_BOOKINGS_LIMIT), []);
    const cachedFeedbacks = useMemo(() => firestoreService.getCachedFeedbacks(INITIAL_RECENT_FEEDBACK_LIMIT), []);
    const [bookings, setBookings] = useState<Booking[]>(() => cachedBookings ?? []);
    const [machines, setMachines] = useState<Machine[]>(() => cachedMachines ?? []);
    const [students, setStudents] = useState<Student[]>(() => cachedStudents ?? []);
    const [feedbacks, setFeedbacks] = useState<Feedback[]>(() => cachedFeedbacks ?? []);
    const [banners, setBanners] = useState<Banner[]>(() => cachedBanners ?? []);
    const [vipRules, setVipRules] = useState<VipRecurringRule[]>([]);
    const [showBannerForm, setShowBannerForm] = useState(false);
    const [newBanner, setNewBanner] = useState({ title: '', imageUrl: '', linkUrl: '', priority: 1 });
    const [vipForm, setVipForm] = useState({
        studentId: '',
        machineId: '',
        weekday: 6,
        startTime: '16:30'
    });
    const [vipStudentSearch, setVipStudentSearch] = useState('');
    const [vipApplyStatus, setVipApplyStatus] = useState<{
        weekId: string;
        success: number;
        skipped: number;
        overridden: number;
        failed: number;
        blocked: number;
        applied: boolean;
        mode: 'auto' | 'manual';
        at: number;
    } | null>(null);
    const [residentSearchTerm, setResidentSearchTerm] = useState('');
    const [bookingSearchTerm, setBookingSearchTerm] = useState('');
    const [bookingPage, setBookingPage] = useState(1);
    const [loading, setLoading] = useState(() => !cachedMachines && !cachedStudents && !cachedBanners);
    const [activityLoading, setActivityLoading] = useState(() => !cachedBookings && !cachedFeedbacks);
    const [settings, setSettings] = useState<AppSettings>(() => cachedSettings ?? {
        forceShowNextWeek: false,
        forceCloseBookings: false,
        maintenanceDay: 3,
        autoOpenWeekday: 6,
        autoOpenTime: '16:00',
        autoOpenDurationHours: 28,
        vipAutoEnabled: true,
        vipLastAppliedWeekId: '',
        topAlert: { message: '', isActive: false, type: 'info' }
    });
    const [recentBookingLimit, setRecentBookingLimit] = useState(INITIAL_RECENT_BOOKINGS_LIMIT);
    const [recentFeedbackLimit, setRecentFeedbackLimit] = useState(INITIAL_RECENT_FEEDBACK_LIMIT);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [replyingFeedbackId, setReplyingFeedbackId] = useState<string | null>(null);
    const [addingVipRule, setAddingVipRule] = useState(false);
    const [applyingVipRules, setApplyingVipRules] = useState(false);
    const autoVipInFlightRef = useRef(false);
    const navigate = useNavigate();
    const { alertDialog, confirmDialog, promptDialog, dialogNode } = useAdminDialog();

    useEffect(() => {
        if (!sessionStorage.getItem('manager_auth')) {
            navigate('/manager/login');
            return;
        }
        void refreshCoreData();
    }, [navigate]);

    useEffect(() => {
        if (!sessionStorage.getItem('manager_auth')) {
            return;
        }
        void refreshActivityData();
    }, [recentBookingLimit, recentFeedbackLimit]);

    const refreshCoreData = async () => {
        setLoading(true);
        try {
            const [fetchedMachines, fetchedStudents, fetchedSettings, fetchedBanners, fetchedVipRules] = await Promise.all([
                firestoreService.getMachines(),
                firestoreService.getAllStudents(),
                firestoreService.getSettings(),
                firestoreService.getBanners(),
                firestoreService.getVipRecurringRules()
            ]);
            setMachines(fetchedMachines);
            setStudents(fetchedStudents);
            setSettings(fetchedSettings);
            setBanners(fetchedBanners);
            setVipRules(fetchedVipRules);
        } catch (error) {
            console.error("Failed to load admin data", error);
            await alertDialog('Load Failed', 'Failed to load data from database.');
        } finally {
            setLoading(false);
        }
    };

    const refreshActivityData = async () => {
        setActivityLoading(true);
        try {
            const [fetchedBookings, fetchedFeedbacks] = await Promise.all([
                firestoreService.getRecentAdminBookings(recentBookingLimit),
                firestoreService.getFeedbacks(recentFeedbackLimit)
            ]);
            setBookings(fetchedBookings);
            setFeedbacks(fetchedFeedbacks);
        } catch (error) {
            console.error('Failed to load admin activity', error);
            await alertDialog('Load Failed', 'Failed to load recent booking activity.');
        } finally {
            setActivityLoading(false);
        }
    };

    const studentById = useMemo(() => {
        return new Map(students.map((student) => [student.id, student]));
    }, [students]);

    const machineById = useMemo(() => {
        return new Map(machines.map((machine) => [machine.id, machine]));
    }, [machines]);

    const filteredBookings = useMemo(() => {
        const searchLower = bookingSearchTerm.trim().toLowerCase();
        return bookings.filter(b => {
            if (!searchLower) return true;
            const student = studentById.get(b.studentId);
            const machine = machineById.get(b.machineId);

            return (
                student?.name.toLowerCase().includes(searchLower) ||
                student?.roomNumber.toLowerCase().includes(searchLower) ||
                machine?.name.toLowerCase().includes(searchLower) ||
                b.date.toLowerCase().includes(searchLower) ||
                b.startTime.toLowerCase().includes(searchLower)
            );
        });
    }, [bookingSearchTerm, bookings, machineById, studentById]);

    const getReplyDraft = (feedback: Feedback) => {
        return replyDrafts[feedback.id] ?? feedback.adminReply?.text ?? '';
    };

    const handleReplyDraftChange = (feedbackId: string, value: string) => {
        setReplyDrafts((currentDrafts) => ({
            ...currentDrafts,
            [feedbackId]: value
        }));
    };

    const totalBookingPages = Math.max(1, Math.ceil(filteredBookings.length / BOOKING_ITEMS_PER_PAGE));

    const paginatedBookings = useMemo(() => {
        const start = (bookingPage - 1) * BOOKING_ITEMS_PER_PAGE;
        return filteredBookings.slice(start, start + BOOKING_ITEMS_PER_PAGE);
    }, [filteredBookings, bookingPage]);

    const filteredVipStudents = useMemo(() => {
        const search = vipStudentSearch.trim().toLowerCase();
        if (!search) return students;

        return students.filter((student) =>
            student.name.toLowerCase().includes(search)
            || student.roomNumber.toLowerCase().includes(search)
        );
    }, [students, vipStudentSearch]);

    useEffect(() => {
        setBookingPage(1);
    }, [bookingSearchTerm, bookings.length]);

    useEffect(() => {
        if (bookingPage > totalBookingPages) {
            setBookingPage(totalBookingPages);
        }
    }, [bookingPage, totalBookingPages]);


    const toggleMachine = async (machine: Machine) => {
        const newStatus = machine.status === 'available' ? 'maintenance' : 'available';
        await firestoreService.updateMachineStatus(machine.id, newStatus);
        refreshCoreData();
    };

    const handleAddMachine = async () => {
        const name = await promptDialog('Add Machine', 'Enter New Machine Name (e.g. Machine 5)', {
            placeholder: 'Machine name',
            confirmText: 'Add Machine'
        });
        if (name?.trim()) {
            await firestoreService.addMachine(name.trim());
            refreshCoreData();
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
            refreshCoreData();
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
            refreshActivityData();
        }
    };

    // --- Banner Management ---
    // Helper to convert Google Drive share links to direct image URLs
    const getDirectImageUrl = (url: string): string => {
        return normalizeBannerSource(url);
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
        refreshCoreData();
    };

    const handleDeleteBanner = async (id: string) => {
        const confirmed = await confirmDialog('Delete Banner?', 'Delete this banner?', {
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDanger: true
        });
        if (confirmed) {
            await firestoreService.deleteBanner(id);
            refreshCoreData();
        }
    };

    const toggleBanner = async (banner: Banner) => {
        await firestoreService.toggleBannerStatus(banner.id, !banner.isActive);
        refreshCoreData();
    };

    const handleAddVipRule = async () => {
        setAddingVipRule(true);

        try {
            if (!vipForm.studentId || !vipForm.machineId || !vipForm.startTime) {
                await alertDialog('Missing Fields', 'Please select student, machine, day, and time.');
                return;
            }

            const existingRule = vipRules.find((rule) =>
                rule.studentId === vipForm.studentId
                && rule.machineId === vipForm.machineId
                && rule.weekday === vipForm.weekday
                && rule.startTime === vipForm.startTime
            );

            if (existingRule) {
                await alertDialog('Rule Exists', 'This VIP recurring rule already exists.');
                return;
            }

            const nextRule: VipRecurringRule = {
                id: `vip-${Date.now()}`,
                studentId: vipForm.studentId,
                machineId: vipForm.machineId,
                weekday: vipForm.weekday,
                startTime: vipForm.startTime,
                isActive: true,
                createdAt: Date.now()
            };

            await firestoreService.addVipRecurringRule(nextRule);
            await refreshCoreData();
            setVipForm({
                studentId: '',
                machineId: '',
                weekday: 6,
                startTime: '16:30'
            });
            toast.success('VIP recurring rule added.');
        } catch (error) {
            console.error('Failed to add VIP rule', error);
            toast.error('Failed to add VIP rule.');
        } finally {
            setAddingVipRule(false);
        }
    };

    const toggleVipRule = async (rule: VipRecurringRule) => {
        await firestoreService.toggleVipRecurringRule(rule.id, !rule.isActive);
        await refreshCoreData();
    };

    const handleDeleteVipRule = async (rule: VipRecurringRule) => {
        const confirmed = await confirmDialog('Delete VIP Rule?', 'Delete this recurring VIP booking rule?', {
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDanger: true
        });

        if (!confirmed) return;

        await firestoreService.deleteVipRecurringRule(rule.id);
        await refreshCoreData();
    };

    const applyVipForWeek = async (mode: 'auto' | 'manual') => {
        const activeRules = vipRules.filter((rule) => rule.isActive);
        if (activeRules.length === 0) {
            if (mode === 'manual') {
                await alertDialog('No Active Rules', 'Enable or add at least one VIP rule first.');
            }
            return;
        }

        try {
            const nextWeekStart = addBelarusDays(getBelarusWeekStart(getBelarusDate()), 7);
            const nextWeekId = getBelarusWeekId(nextWeekStart);
            const maintenanceDay = settings.maintenanceDay ?? 3;
            let workingBookings = await firestoreService.getBookingsForWeekIds([nextWeekId]);

            let success = 0;
            let skipped = 0;
            let overridden = 0;
            let failed = 0;
            let blocked = 0;

            for (const rule of activeRules) {
                const student = studentById.get(rule.studentId);
                const machine = machineById.get(rule.machineId);

                if (!student || !machine) {
                    blocked += 1;
                    continue;
                }

                if (machine.status === 'maintenance') {
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
                const targetSlotId = `${targetDateStr}_${rule.machineId}_${rule.startTime.replace(':', '-')}`;

                const existingAtSlot = workingBookings.find((booking) => booking.id === targetSlotId);
                if (existingAtSlot) {
                    if (existingAtSlot.studentId === student.id) {
                        success += 1;
                        continue;
                    }

                    await firestoreService.cancelBooking(existingAtSlot.id);
                    workingBookings = workingBookings.filter((booking) => booking.id !== existingAtSlot.id);
                    overridden += 1;
                }

                const existingStudentBooking = workingBookings.find((booking) => booking.studentId === student.id && booking.weekId === nextWeekId);
                if (existingStudentBooking) {
                    await firestoreService.cancelBooking(existingStudentBooking.id);
                    workingBookings = workingBookings.filter((booking) => booking.id !== existingStudentBooking.id);
                    overridden += 1;
                }

                const bookingPayload: Booking = {
                    id: targetSlotId,
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
                    workingBookings.push({ ...bookingPayload, id: targetSlotId });
                } else {
                    failed += 1;
                }
            }

            const applied = failed === 0 && blocked === 0;

            setVipApplyStatus({ weekId: nextWeekId, success, skipped, overridden, failed, blocked, applied, mode, at: Date.now() });

            if (mode === 'manual') {
                await alertDialog(
                    applied ? 'VIP Apply Complete' : 'VIP Apply Needs Attention',
                    `${applied ? 'Applied' : 'Processed'} for week ${nextWeekId}.\nSuccess: ${success}\nOverridden: ${overridden}\nSkipped: ${skipped}\nBlocked: ${blocked}\nFailed: ${failed}${applied ? '' : '\n\nThe week was NOT marked as applied, so the system can retry automatically.'}`
                );
            }

            if (applied && settings.vipLastAppliedWeekId !== nextWeekId) {
                await firestoreService.updateSettings({ vipLastAppliedWeekId: nextWeekId });
                setSettings((current) => ({ ...current, vipLastAppliedWeekId: nextWeekId }));
            }

            await refreshActivityData();
        } catch (error) {
            console.error('VIP apply failed', error);
            if (mode === 'manual') {
                await alertDialog('VIP Apply Failed', 'Could not apply VIP recurring bookings.');
            }
        }
    };

    const handleApplyVipForNextWeek = async () => {
        setApplyingVipRules(true);
        try {
            await applyVipForWeek('manual');
        } finally {
            setApplyingVipRules(false);
        }
    };

    const handleReplyToFeedback = async (feedback: Feedback) => {
        const nextReply = getReplyDraft(feedback).trim();
        if (!nextReply) {
            toast.error('Write a reply first.');
            return;
        }

        setReplyingFeedbackId(feedback.id);

        try {
            await firestoreService.updateFeedbackReply(feedback.id, nextReply, 'Hostel Team');
            const nextFeedbacks = await firestoreService.getFeedbacks(recentFeedbackLimit);
            setFeedbacks(nextFeedbacks);
            toast.success(feedback.adminReply ? 'Reply updated.' : 'Reply sent to resident.');
        } catch (error) {
            console.error('Failed to reply to feedback', error);
            toast.error('Failed to save reply.');
        } finally {
            setReplyingFeedbackId(null);
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
        refreshCoreData();
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
            refreshCoreData();
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
            refreshCoreData();
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
                refreshCoreData();
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
                refreshActivityData();
            } catch (e) {
                await alertDialog('Delete Failed', 'Error: ' + e);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleToggleSetting = async (key: 'forceShowNextWeek' | 'forceCloseBookings') => {
        const newValue = !settings[key];

        const messages: Record<'forceShowNextWeek' | 'forceCloseBookings', string> = {
            forceShowNextWeek: newValue ? "This will OPEN booking immediately." : "Returning to automatic schedule.",
            forceCloseBookings: newValue ? "This will CLOSE booking immediately (Kill Switch)." : "Booking will follow schedule rules."
        };

        const confirmed = await confirmDialog('Confirm Setting Update', messages[key]);
        if (confirmed) {
            await firestoreService.updateSettings({ [key]: newValue });
            refreshCoreData();
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

    const autoWindowDisplay = getAutoOpenWindowDisplay(settings);

    useEffect(() => {
        if (!settings.vipAutoEnabled) return;
        if (loading) return;
        if (autoVipInFlightRef.current) return;

        const activeRules = vipRules.filter((rule) => rule.isActive);
        if (activeRules.length === 0) return;

        const nextWeekStart = addBelarusDays(getBelarusWeekStart(getBelarusDate()), 7);
        const nextWeekId = getBelarusWeekId(nextWeekStart);

        if (settings.vipLastAppliedWeekId === nextWeekId) return;

        autoVipInFlightRef.current = true;

        void applyVipForWeek('auto').finally(() => {
            autoVipInFlightRef.current = false;
        });
    }, [applyVipForWeek, loading, settings.vipAutoEnabled, settings.vipLastAppliedWeekId, vipRules, studentById, machineById]);

    if (loading && bookings.length === 0 && machines.length === 0 && students.length === 0) {
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
                    <button
                        type="button"
                        onClick={() => navigate('/manager/print-qr')}
                        className="glass-button"
                        style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Printer size={16} /> Print QR
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
                                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                                    <option key={day} value={index}>{day}</option>
                                ))}
                            </select>
                            <p style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                                Students will see "Maintenance Day" on this day of the week.
                            </p>
                        </div>

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
                                Schedule window: {autoWindowDisplay.openDay} {autoWindowDisplay.openTime} - {autoWindowDisplay.closeDay} {autoWindowDisplay.closeTime} (Belarus).
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
                                            topAlert: {
                                                ...getManagerTopAlert(settings.topAlert),
                                                isActive: !settings.topAlert?.isActive
                                            }
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
                                        const newAlert = { ...getManagerTopAlert(settings.topAlert), message: e.target.value };
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
                                                const newAlert = { ...getManagerTopAlert(settings.topAlert), type };
                                                setSettings(prev => ({ ...prev, topAlert: newAlert }));
                                                updateSettings({ topAlert: newAlert });
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
                                    : <span>Auto: {autoWindowDisplay.openDay} {autoWindowDisplay.openTime} - {autoWindowDisplay.closeDay} {autoWindowDisplay.closeTime}</span>}
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

            <section>
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>VIP Recurring Bookings ({vipRules.length})</h3>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                <input
                                    type="checkbox"
                                    checked={settings.vipAutoEnabled !== false}
                                    onChange={async (event) => {
                                        const enabled = event.target.checked;
                                        await updateSettings({ vipAutoEnabled: enabled });
                                    }}
                                />
                                Auto-apply every week
                            </label>
                            <button
                                onClick={handleApplyVipForNextWeek}
                                className="primary-button"
                                disabled={applyingVipRules}
                                style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}
                            >
                                {applyingVipRules ? 'Applying...' : 'Apply VIP for Next Week'}
                            </button>
                        </div>
                    </div>

                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        Status: {settings.vipAutoEnabled !== false ? 'Auto mode ON' : 'Auto mode OFF'} · Last applied week: {settings.vipLastAppliedWeekId || 'Not yet'}
                    </div>

                    {vipApplyStatus && (
                        <div className="glass-panel" style={{ padding: '10px 12px', borderRadius: '10px', marginBottom: '12px', border: '1px solid rgba(16,185,129,0.35)' }}>
                            {vipApplyStatus.mode === 'auto' ? 'Auto' : 'Manual'} apply {vipApplyStatus.applied ? 'complete' : 'pending retry'} for <strong>{vipApplyStatus.weekId}</strong> — Success: {vipApplyStatus.success}, Overridden: {vipApplyStatus.overridden}, Skipped: {vipApplyStatus.skipped}, Blocked: {vipApplyStatus.blocked}, Failed: {vipApplyStatus.failed}.
                        </div>
                    )}

                    <div style={{ marginBottom: '10px' }}>
                        <input
                            type="text"
                            placeholder="Search student by name or room"
                            value={vipStudentSearch}
                            onChange={(event) => setVipStudentSearch(event.target.value)}
                            className="glass-button"
                            style={{ width: '100%', padding: '10px', borderRadius: '8px' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '14px' }}>
                        <select
                            value={vipForm.studentId}
                            onChange={(event) => setVipForm((current) => ({ ...current, studentId: event.target.value }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            <option value="">Select Student</option>
                            {filteredVipStudents.map((student) => (
                                <option key={student.id} value={student.id}>{student.name} (Room {student.roomNumber})</option>
                            ))}
                        </select>

                        <select
                            value={vipForm.machineId}
                            onChange={(event) => setVipForm((current) => ({ ...current, machineId: event.target.value }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            <option value="">Select Machine</option>
                            {machines.map((machine) => (
                                <option key={machine.id} value={machine.id}>{machine.name}</option>
                            ))}
                        </select>

                        <select
                            value={vipForm.weekday}
                            onChange={(event) => setVipForm((current) => ({ ...current, weekday: Number(event.target.value) }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            {WEEKDAY_LABELS.map((day, index) => (
                                <option key={day} value={index}>{day}</option>
                            ))}
                        </select>

                        <select
                            value={vipForm.startTime}
                            onChange={(event) => setVipForm((current) => ({ ...current, startTime: event.target.value }))}
                            className="glass-button"
                            style={{ padding: '10px', borderRadius: '8px' }}
                        >
                            {TIME_SLOTS.map((slot) => (
                                <option key={slot} value={slot}>{slot}</option>
                            ))}
                        </select>
                    </div>

                    <button onClick={handleAddVipRule} disabled={addingVipRule} className="glass-button" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>
                        {addingVipRule ? 'Adding VIP...' : 'Add VIP Rule'}
                    </button>

                    <div style={{ display: 'grid', gap: '10px' }}>
                        {vipRules.map((rule) => {
                            const student = students.find((resident) => resident.id === rule.studentId);
                            const machine = machines.find((washer) => washer.id === rule.machineId);

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
                        value={residentSearchTerm}
                        onChange={(e) => setResidentSearchTerm(e.target.value)}
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
                                    s.name.toLowerCase().includes(residentSearchTerm.toLowerCase()) ||
                                    s.roomNumber.toLowerCase().includes(residentSearchTerm.toLowerCase())
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
                    <div>
                        <h3 style={{ margin: 0 }}>Recent Bookings ({filteredBookings.length})</h3>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Showing the latest {bookings.length} booking records for a faster manager dashboard.
                        </div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search Name or Room..."
                        value={bookingSearchTerm}
                        onChange={(e) => setBookingSearchTerm(e.target.value)}
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
                                const student = studentById.get(b.studentId);
                                const machine = machineById.get(b.machineId);
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
                            {activityLoading ? 'Loading booking activity...' : `No bookings found matching "${bookingSearchTerm}"`}
                        </div>
                    )}
                </div>

                {(filteredBookings.length > 0 || bookings.length > 0) && (
                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            Page {bookingPage} of {totalBookingPages}{activityLoading ? ' • Refreshing…' : ''}
                        </span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                            {!bookingSearchTerm && bookings.length >= recentBookingLimit && (
                                <button
                                    className="glass-button"
                                    onClick={() => setRecentBookingLimit((current) => current + INITIAL_RECENT_BOOKINGS_LIMIT)}
                                    style={{ padding: '8px 12px', borderRadius: '8px' }}
                                >
                                    Load Older
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Feedback Section */}
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MessageSquare size={20} />
                            Feedback Inbox ({feedbacks.length})
                        </h3>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Reply to resident suggestions and bugs here. Your answer will appear inside their dashboard.
                        </div>
                    </div>
                    {!activityLoading && feedbacks.length >= recentFeedbackLimit && (
                        <button
                            className="glass-button"
                            onClick={() => setRecentFeedbackLimit((current) => current + INITIAL_RECENT_FEEDBACK_LIMIT)}
                            style={{ padding: '8px 12px', borderRadius: '8px' }}
                        >
                            Load Older
                        </button>
                    )}
                </div>
                <div className="glass-panel" style={{ padding: '12px', borderRadius: '18px', maxHeight: '620px', overflowY: 'auto' }}>
                    {feedbacks.length > 0 ? (
                        <div style={{ display: 'grid', gap: '14px' }}>
                            {feedbacks.map((feedback) => {
                                const meta = feedbackTypeMeta[feedback.type];
                                const Icon = getFeedbackTypeIcon(feedback.type);
                                const hasReply = Boolean(feedback.adminReply?.text?.trim());
                                const replyDraft = getReplyDraft(feedback);

                                return (
                                    <div
                                        key={feedback.id}
                                        className="glass-panel"
                                        style={{
                                            padding: '18px',
                                            borderRadius: '18px',
                                            border: hasReply ? '1px solid rgba(16, 185, 129, 0.24)' : `1px solid ${meta.border}`,
                                            background: hasReply
                                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.28) 100%)'
                                                : 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(15, 23, 42, 0.26) 100%)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                <div
                                                    style={{
                                                        width: '42px',
                                                        height: '42px',
                                                        borderRadius: '14px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: meta.background,
                                                        border: `1px solid ${meta.border}`
                                                    }}
                                                >
                                                    <Icon size={18} color={meta.color} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                                                        {feedback.studentName}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        Room {feedback.roomNumber}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderRadius: '999px',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        color: meta.color,
                                                        background: meta.background,
                                                        border: `1px solid ${meta.border}`
                                                    }}
                                                >
                                                    {meta.label}
                                                </span>
                                                <span
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '6px 10px',
                                                        borderRadius: '999px',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        color: hasReply ? '#6ee7b7' : '#fbbf24',
                                                        background: hasReply ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                                                        border: hasReply ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)'
                                                    }}
                                                >
                                                    {hasReply ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                                                    {hasReply ? 'Replied' : 'Awaiting reply'}
                                                </span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {format(feedback.timestamp, 'MMM d, HH:mm')}
                                                </span>
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                padding: '14px 16px',
                                                borderRadius: '14px',
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                color: 'var(--text-main)',
                                                lineHeight: 1.6,
                                                whiteSpace: 'pre-wrap'
                                            }}
                                        >
                                            {feedback.text}
                                        </div>

                                        {hasReply && (
                                            <div
                                                style={{
                                                    marginTop: '14px',
                                                    padding: '16px',
                                                    borderRadius: '16px',
                                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(16, 185, 129, 0.06) 100%)',
                                                    border: '1px solid rgba(16, 185, 129, 0.18)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a7f3d0', fontWeight: 700 }}>
                                                        <Reply size={16} />
                                                        Current reply
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.72)' }}>
                                                        {format(feedback.adminReply!.repliedAt, 'MMM d, HH:mm')}
                                                    </div>
                                                </div>
                                                <div style={{ color: 'white', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                                    {feedback.adminReply?.text}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                                            <textarea
                                                value={replyDraft}
                                                onChange={(event) => handleReplyDraftChange(feedback.id, event.target.value)}
                                                placeholder="Write a helpful reply for the resident..."
                                                style={{
                                                    width: '100%',
                                                    minHeight: '92px',
                                                    borderRadius: '14px',
                                                    padding: '14px 16px',
                                                    background: 'rgba(0,0,0,0.18)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    color: 'white',
                                                    outline: 'none',
                                                    resize: 'vertical',
                                                    boxSizing: 'border-box',
                                                    lineHeight: 1.5
                                                }}
                                            />

                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {hasReply
                                                        ? 'Update the reply any time. Residents will see the latest version in their dashboard.'
                                                        : 'Send a reply to publish it to the resident dashboard.'}
                                                </div>

                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={async () => {
                                                            const confirmed = await confirmDialog('Delete Feedback?', 'Delete this feedback entry?', {
                                                                confirmText: 'Delete',
                                                                cancelText: 'Cancel',
                                                                isDanger: true
                                                            });
                                                            if (confirmed) {
                                                                await firestoreService.deleteFeedback(feedback.id);
                                                                const nextFeedbacks = await firestoreService.getFeedbacks(recentFeedbackLimit);
                                                                setFeedbacks(nextFeedbacks);
                                                            }
                                                        }}
                                                        className="glass-button"
                                                        style={{
                                                            padding: '10px 14px',
                                                            borderRadius: '12px',
                                                            color: 'var(--error)',
                                                            border: '1px solid rgba(239, 68, 68, 0.22)'
                                                        }}
                                                    >
                                                        <Trash2 size={15} style={{ marginRight: '6px' }} />
                                                        Delete
                                                    </button>
                                                    <button
                                                        onClick={() => handleReplyToFeedback(feedback)}
                                                        disabled={replyingFeedbackId === feedback.id}
                                                        className="primary-button"
                                                        style={{
                                                            padding: '10px 16px',
                                                            borderRadius: '12px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            opacity: replyingFeedbackId === feedback.id ? 0.75 : 1
                                                        }}
                                                    >
                                                        {replyingFeedbackId === feedback.id ? <Clock3 size={15} /> : <Send size={15} />}
                                                        {replyingFeedbackId === feedback.id ? 'Saving...' : hasReply ? 'Update Reply' : 'Send Reply'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {activityLoading ? 'Loading recent feedback...' : 'No feedback yet.'}
                        </div>
                    )}
                </div>
            </section>
            {dialogNode}
        </div >

    );
}
