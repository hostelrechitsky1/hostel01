import { useEffect, useRef } from 'react';
import { Activity, WashingMachine as Washer } from 'lucide-react';
import type { Booking, Machine } from '../types';
import { getMachineSlotNeighbors } from '../utils/machineSlotNeighbors';

export type MachineQrOverviewProps = {
    machines: Machine[];
    bookingsForToday: Booking[];
    nowMinutes: number;
    highlightMachineId?: string | null;
    clockLabel: string;
};

function ownerLabel(booking: Booking | null): string {
    if (!booking) return 'Free';
    const name = booking.studentName?.trim() || 'Student';
    const room = booking.roomNumber?.trim() || '—';
    return `${name} · Room ${room}`;
}

export default function MachineQrOverview({
    machines,
    bookingsForToday,
    nowMinutes,
    highlightMachineId,
    clockLabel,
}: MachineQrOverviewProps) {
    const highlightedRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!highlightMachineId || !highlightedRef.current) return;
        highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [highlightMachineId]);

    return (
        <section data-testid="machine-qr-overview" style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: 600 }}>
                    Machine slots — today
                    <span style={{
                        fontSize: '12px',
                        fontWeight: 'normal',
                        background: 'var(--glass-button-bg)',
                        border: '1px solid var(--glass-border)',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        color: 'var(--text-muted)',
                    }}
                    >
                        {clockLabel}
                    </span>
                </h3>
            </div>

            <div className="grid-cols-2">
                {machines.map((machine) => {
                    const neighbors = getMachineSlotNeighbors({
                        bookingsForDate: bookingsForToday,
                        machineId: machine.id,
                        nowMinutes,
                    });
                    const isHighlight = highlightMachineId === machine.id;
                    const isMaintenance = machine.status === 'maintenance';

                    return (
                        <div
                            key={machine.id}
                            ref={isHighlight ? highlightedRef : undefined}
                            className="glass-panel"
                            style={{
                                padding: '16px',
                                borderRadius: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px',
                                border: isHighlight ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                                boxShadow: isHighlight ? '0 0 18px rgba(99, 102, 241, 0.25)' : undefined,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        background: 'rgba(99, 102, 241, 0.12)',
                                        padding: '10px',
                                        borderRadius: '14px',
                                        display: 'flex',
                                    }}
                                    >
                                        <Washer size={22} color="var(--primary)" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '15px', fontWeight: 700 }}>{machine.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {isMaintenance ? 'Under maintenance' : 'Before · Now · After'}
                                        </div>
                                    </div>
                                </div>
                                {!isMaintenance && (
                                    <div style={{
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        padding: '6px 8px',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}
                                    >
                                        <Activity size={14} color="var(--success)" />
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--success)' }}>Live</span>
                                    </div>
                                )}
                            </div>

                            {isMaintenance ? (
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unavailable until maintenance completes.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {neighbors.before && (
                                        <div style={{ fontSize: '12px' }}>
                                            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>
                                                Before ({neighbors.before.startTime})
                                            </div>
                                            <div style={{ fontWeight: 600 }}>{ownerLabel(neighbors.before.booking)}</div>
                                        </div>
                                    )}
                                    <div style={{ fontSize: '12px' }}>
                                        <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>
                                            Now ({neighbors.current.startTime})
                                        </div>
                                        <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{ownerLabel(neighbors.current.booking)}</div>
                                    </div>
                                    {neighbors.after && (
                                        <div style={{ fontSize: '12px' }}>
                                            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>
                                                After ({neighbors.after.startTime})
                                            </div>
                                            <div style={{ fontWeight: 600 }}>{ownerLabel(neighbors.after.booking)}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
