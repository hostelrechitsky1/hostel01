import { useNavigate } from 'react-router-dom';
import { Printer, Users, LogOut, Plus, Trash2, Languages } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import type { Student } from '../types';
import { useAdminDialog } from '../components/useAdminDialog';

export default function HostelAdminDashboard() {
    const navigate = useNavigate();
    const cachedStudents = useMemo(() => firestoreService.getCachedStudents(), []);
    const [students, setStudents] = useState<Student[]>(() => cachedStudents ?? []);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(() => cachedStudents === undefined);
    const [isRussian, setIsRussian] = useState(() => sessionStorage.getItem('hostel_admin_lang') === 'ru');
    const { alertDialog, confirmDialog, promptDialog, dialogNode } = useAdminDialog();

    const t = useMemo(() => {
        return isRussian
            ? {
                staffPortal: 'Портал персонала',
                subtitle: 'Печать и управление жильцами',
                logout: 'Выйти',
                switchLanguage: 'English',
                printSchedule: 'Печать расписания',
                printScheduleDesc: 'Сформировать недельный лист бронирований для доски объявлений',
                printCodes: 'Печать PIN-кодов',
                printCodesDesc: 'Распечатать лист с кодами входа для жильцов',
                open: 'Открыть →',
                residents: 'Жильцы',
                addResident: 'Добавить жильца',
                searchPlaceholder: 'Поиск жильцов по имени или комнате...',
                room: 'Комната',
                name: 'Имя',
                pin: 'PIN',
                actions: 'Действия',
                edit: 'Изменить',
                delete: 'Удалить',
                noResidents: 'По вашему запросу жильцы не найдены.',
                loadingResidents: 'Загрузка жильцов...',
                restricted: 'Закрытая зона • Только для авторизованного персонала',
                loadFailedTitle: 'Ошибка загрузки',
                loadFailedMessage: 'Не удалось загрузить жильцов из базы. Попробуйте снова.',
                securityCheck: 'Проверка безопасности',
                pinPrompt: 'Введите PIN администратора, чтобы открыть страницу PIN-кодов',
                enterPin: 'Введите PIN',
                verify: 'Проверить',
                accessDenied: 'Доступ запрещён',
                incorrectPin: 'Неверный PIN. Доступ к печати PIN-кодов запрещён.',
                addResidentTitle: 'Добавить жильца',
                enterStudentName: 'Введите имя жильца:',
                studentNamePlaceholder: 'Имя жильца',
                next: 'Далее',
                enterRoom: 'Введите номер комнаты (например, 101):',
                roomPlaceholder: 'Номер комнаты',
                create: 'Создать',
                residentAdded: 'Жилец добавлен',
                removeResidentTitle: 'Удалить жильца?',
                removeResidentMessage: (name: string, room: string) => `Удалить ${name} из комнаты ${room}?`,
                keep: 'Оставить',
                editResidentTitle: 'Изменить жильца',
                updateResidentName: 'Обновите имя жильца:',
                save: 'Сохранить'
            }
            : {
                staffPortal: 'Staff Portal',
                subtitle: 'Printing & Resident Administration',
                logout: 'Logout',
                switchLanguage: 'Русский',
                printSchedule: 'Print Schedule',
                printScheduleDesc: 'Generate weekly booking sheet for notice board',
                printCodes: 'Print Codes',
                printCodesDesc: 'Print login credentials handout for residents',
                open: 'Open →',
                residents: 'Residents',
                addResident: 'Add Resident',
                searchPlaceholder: 'Search residents by Name or Room...',
                room: 'Room',
                name: 'Name',
                pin: 'PIN',
                actions: 'Actions',
                edit: 'Edit',
                delete: 'Delete',
                noResidents: 'No residents found for this search.',
                loadingResidents: 'Loading residents...',
                restricted: 'Restricted Area • Authorized Personnel Only',
                loadFailedTitle: 'Load Failed',
                loadFailedMessage: 'Failed to load residents from database. Please try again.',
                securityCheck: 'Security Check',
                pinPrompt: 'Enter hostel admin PIN to open Print Codes',
                enterPin: 'Enter PIN',
                verify: 'Verify',
                accessDenied: 'Access Denied',
                incorrectPin: 'Incorrect PIN. Print Codes access denied.',
                addResidentTitle: 'Add Resident',
                enterStudentName: 'Enter Student Name:',
                studentNamePlaceholder: 'Student name',
                next: 'Next',
                enterRoom: 'Enter Room Number (e.g. 101):',
                roomPlaceholder: 'Room number',
                create: 'Create',
                residentAdded: 'Resident Added',
                removeResidentTitle: 'Remove Resident?',
                removeResidentMessage: (name: string, room: string) => `Remove ${name} from Room ${room}?`,
                keep: 'Keep',
                editResidentTitle: 'Edit Resident',
                updateResidentName: 'Update resident name:',
                save: 'Save'
            };
    }, [isRussian]);

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
            await alertDialog(t.loadFailedTitle, t.loadFailedMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('hostel_admin_auth');
        navigate('/hostel-admin');
    };

    const verifyHostelAdminBeforePrintingCodes = async () => {
        const enteredPin = await promptDialog(t.securityCheck, t.pinPrompt, {
            placeholder: t.enterPin,
            inputType: 'password',
            confirmText: t.verify
        });
        if (!enteredPin) return;

        if (enteredPin !== '2001') {
            await alertDialog(t.accessDenied, t.incorrectPin);
            return;
        }

        navigate('/manager/print-credentials');
    };

    const handleAddStudent = async () => {
        const name = await promptDialog(t.addResidentTitle, t.enterStudentName, {
            placeholder: t.studentNamePlaceholder,
            confirmText: t.next
        });
        if (!name?.trim()) return;

        const room = await promptDialog(t.addResidentTitle, t.enterRoom, {
            placeholder: t.roomPlaceholder,
            confirmText: t.create
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
        await alertDialog(t.residentAdded, `${t.name}: ${newStudent.name}\n${t.room}: ${newStudent.roomNumber}\nPIN: ${newStudent.pin}`);
        refreshStudents();
    };

    const handleDeleteStudent = async (student: Student) => {
        const confirmed = await confirmDialog(
            t.removeResidentTitle,
            t.removeResidentMessage(student.name, student.roomNumber),
            { confirmText: t.delete, cancelText: t.keep, isDanger: true }
        );
        if (confirmed) {
            await firestoreService.deleteStudent(student.id);
            refreshStudents();
        }
    };

    const handleEditStudent = async (student: Student) => {
        const newName = await promptDialog(t.editResidentTitle, t.updateResidentName, {
            defaultValue: student.name,
            confirmText: t.save
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
                    <h1 style={{ margin: 0, fontSize: '24px' }}>{t.staffPortal}</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>{t.subtitle}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => {
                        const next = !isRussian;
                        setIsRussian(next);
                        sessionStorage.setItem('hostel_admin_lang', next ? 'ru' : 'en');
                    }} className="glass-button" style={{ padding: '8px 14px', fontSize: '14px' }}>
                        <Languages size={16} style={{ marginRight: '8px' }} /> {t.switchLanguage}
                    </button>
                    <button onClick={handleLogout} className="glass-button" style={{ padding: '8px 16px', fontSize: '14px' }}>
                        <LogOut size={16} style={{ marginRight: '8px' }} /> {t.logout}
                    </button>
                </div>
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
                        <h3 style={{ margin: '0 0 8px' }}>{t.printSchedule}</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                            {t.printScheduleDesc}
                        </p>
                        <div style={{ marginTop: '16px', color: '#3b82f6', fontSize: '14px', fontWeight: 600 }}>{t.open}</div>
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
                        <h3 style={{ margin: '0 0 8px' }}>{t.printCodes}</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                            {t.printCodesDesc}
                        </p>
                        <div style={{ marginTop: '16px', color: '#10b981', fontSize: '14px', fontWeight: 600 }}>{t.open}</div>
                    </div>
                </button>
            </div>

            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ margin: 0 }}>{t.residents} ({students.length})</h3>
                    <button
                        onClick={handleAddStudent}
                        className="primary-button"
                        style={{ padding: '10px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Plus size={18} /> {t.addResident}
                    </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <input
                        type="text"
                        placeholder={t.searchPlaceholder}
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
                                <th style={{ padding: '12px', textAlign: 'left' }}>{t.room}</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>{t.name}</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>{t.pin}</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>{t.actions}</th>
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
                                            {t.edit}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteStudent(s)}
                                            style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Trash2 size={14} /> {t.delete}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {!loading && filteredStudents.length === 0 && (
                        <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
                            {t.noResidents}
                        </div>
                    )}
                    {loading && (
                        <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
                            {t.loadingResidents}
                        </div>
                    )}
                </div>
            </section>

            <div style={{ marginTop: '40px', textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>
                {t.restricted}
            </div>
            {dialogNode}
        </div>
    );
}
