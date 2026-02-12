import { useNavigate } from 'react-router-dom';
import { Printer, Users, LogOut, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import type { Student } from '../types';
import { useAdminDialog } from '../components/useAdminDialog';

export default function HostelAdminDashboard() {
    const navigate = useNavigate();
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const { alertDialog, confirmDialog, promptDialog, dialogNode } = useAdminDialog();

    useEffect(() => {
        if (!sessionStorage.getItem('hostel_admin_auth')) {
            navigate('/hostel-admin');
            return;
        }

        refreshStudents();
    }, [navigate]);

    const refreshStudents = async () => {
        setLoading(true);
        try {
            const fetchedStudents = await firestoreService.getAllStudents();
            setStudents(fetchedStudents);
        } catch (error) {
            console.error('Failed to load residents', error);
            await alertDialog('Load Failed', 'Failed to load residents from database. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('hostel_admin_auth');
        navigate('/hostel-admin');
    };

    const verifyHostelAdminBeforePrintingCodes = async () => {
        const enteredPin = await promptDialog('Security Check', 'Enter hostel admin PIN to open Print Codes', {
            placeholder: 'Enter PIN',
            inputType: 'password',
            confirmText: 'Verify'
        });
        if (!enteredPin) return;

        if (enteredPin !== '2001') {
            await alertDialog('Access Denied', 'Incorrect PIN. Print Codes access denied.');
            return;
        }

        navigate('/manager/print-credentials');
    };

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
        const existingStudent = students.find((s) => s.roomNumber === room.trim());
        const pin = existingStudent?.pin || Math.floor(100 + Math.random() * 900).toString();

        const newStudent: Student = {
            id: `${room.trim()}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name: name.trim(),
            roomNumber: room.trim(),
            pin
        };

        await firestoreService.addStudent(newStudent);
        await alertDialog('Resident Added', `Name: ${newStudent.name}\nRoom: ${newStudent.roomNumber}\nPIN: ${newStudent.pin}`);
        refreshStudents();
    };

    const handleDeleteStudent = async (student: Student) => {
        const confirmed = await confirmDialog(
            'Remove Resident?',
            `Remove ${student.name} from Room ${student.roomNumber}?`,
            { confirmText: 'Delete', cancelText: 'Keep', isDanger: true }
        );
        if (confirmed) {
            await firestoreService.deleteStudent(student.id);
            refreshStudents();
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
            refreshStudents();
        }
    };

    const filteredStudents = useMemo(() => {
        return students
            .filter(
                (s) =>
                    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    }, [students, searchTerm]);

    return (
        <div className="container animate-fade-in" style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', paddingBottom: '80px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px' }}>Staff Portal</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Printing & Resident Administration</p>
                </div>
                <button onClick={handleLogout} className="glass-button" style={{ padding: '8px 16px', fontSize: '14px' }}>
                    <LogOut size={16} style={{ marginRight: '8px' }} /> Logout
                </button>
            </div>

            <div className="grid-cols-2" style={{ marginBottom: '32px' }}>
                <button
                    onClick={() => navigate('/manager/print-schedule')}
                    className="glass-panel hover-scale"
                    style={{
                        padding: '32px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '16px',
                        cursor: 'pointer',
                        border: '1px solid var(--glass-border)'
                    }}
                >
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '50%' }}>
                        <Printer size={40} color="#3b82f6" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px' }}>Print Schedule</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                            Generate weekly booking sheet for notice board
                        </p>
                        <div style={{ marginTop: '16px', color: '#3b82f6', fontSize: '14px', fontWeight: 600 }}>Open →</div>
                    </div>
                </button>

                <button
                    onClick={verifyHostelAdminBeforePrintingCodes}
                    className="glass-panel hover-scale"
                    style={{
                        padding: '32px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '16px',
                        cursor: 'pointer',
                        border: '1px solid var(--glass-border)'
                    }}
                >
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '20px', borderRadius: '50%' }}>
                        <Users size={40} color="#10b981" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px' }}>Print Codes</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                            Print login credentials handout for residents
                        </p>
                        <div style={{ marginTop: '16px', color: '#10b981', fontSize: '14px', fontWeight: 600 }}>Open →</div>
                    </div>
                </button>
            </div>

            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ margin: 0 }}>Residents ({students.length})</h3>
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

                <div className="glass-panel" style={{ maxHeight: '420px', overflowY: 'auto', padding: 0, borderRadius: '16px' }}>
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
                            {filteredStudents.map((s) => (
                                <tr key={s.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                    <td style={{ padding: '12px', fontWeight: 600 }}>{s.roomNumber}</td>
                                    <td style={{ padding: '12px' }}>{s.name}</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace', letterSpacing: '0.5px' }}>{s.pin || '---'}</td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleEditStudent(s)}
                                            style={{ marginRight: '8px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--primary)' }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteStudent(s)}
                                            style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {!loading && filteredStudents.length === 0 && (
                        <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
                            No residents found for this search.
                        </div>
                    )}
                    {loading && (
                        <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
                            Loading residents...
                        </div>
                    )}
                </div>
            </section>

            <div style={{ marginTop: '40px', textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>
                Restricted Area • Authorized Personnel Only
            </div>
            {dialogNode}
        </div>
    );
}
