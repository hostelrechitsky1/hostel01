import { useState, useRef } from 'react';
import { firestoreService } from '../services/firestoreService';
import type { Ticket } from '../types';
import Barcode from 'react-barcode';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Loader2, Ticket as TicketIcon, Download } from 'lucide-react';

export default function TicketGenerator() {
    const [count, setCount] = useState(1);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedTickets, setGeneratedTickets] = useState<Ticket[]>([]);
    const ticketsContainerRef = useRef<HTMLDivElement>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const batchId = `BATCH-${Date.now()}`;
            const newTickets: Ticket[] = [];

            for (let i = 0; i < count; i++) {
                // Generate secure random ID (e.g., SLN-8492-X7Z)
                const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
                const ticketID = `SLN-${randomPart}`;

                newTickets.push({
                    id: ticketID,
                    batchId,
                    status: 'active',
                    generatedAt: Date.now()
                });
            }

            // Save to DB
            await firestoreService.createTickets(newTickets);
            setGeneratedTickets(newTickets);
        } catch (error) {
            console.error(error);
            alert('Failed to generate tickets');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!ticketsContainerRef.current) return;
        setIsGenerating(true); // Re-use loading state

        try {
            const canvas = await html2canvas(ticketsContainerRef.current, {
                scale: 2, // High resolution
                useCORS: true,
                backgroundColor: '#ffffff' // Paper color
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`tickets-${Date.now()}.pdf`);
        } catch (err) {
            console.error(err);
            alert("Error creating PDF");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', color: 'white' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TicketIcon color="#a855f7" /> Ticket Factory
            </h1>

            {/* Controls */}
            <div style={{ background: '#1f2937', padding: '20px', borderRadius: '12px', marginBottom: '30px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#9ca3af' }}>Quantity</label>
                    <input
                        type="number"
                        min="1"
                        max="50"
                        value={count}
                        onChange={(e) => setCount(parseInt(e.target.value))}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#374151', border: '1px solid #4b5563', color: 'white' }}
                    />
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    style={{ background: '#a855f7', color: 'white', padding: '12px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                    {isGenerating ? <Loader2 className="animate-spin" size={18} /> : 'Generate Tickets'}
                </button>

                {generatedTickets.length > 0 && (
                    <button
                        onClick={handleDownloadPDF}
                        style={{ background: '#10b981', color: 'white', padding: '12px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', display: 'flex', gap: '8px', alignItems: 'center' }}
                    >
                        <Download size={18} /> Save PDF
                    </button>
                )}
            </div>

            {/* Ticket Preview Area (Hidden logic handled by PDF generator normally, but we show preview here) */}
            {generatedTickets.length > 0 && (
                <div>
                    <h3 style={{ marginBottom: '10px', color: '#9ca3af' }}>Preview ({generatedTickets.length})</h3>
                    <div ref={ticketsContainerRef} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr', // 1 column for A4 fit usually, or 2 if small
                        gap: '20px',
                        padding: '20px',
                        background: 'white', // Paper background for the PDF capture
                        color: 'black'
                    }}>
                        {generatedTickets.map((ticket) => (
                            <div key={ticket.id} style={{
                                position: 'relative',
                                width: '100%',
                                maxWidth: '600px', // A4 width constraint roughly
                                aspectRatio: '3/1', // Ticket shape
                                borderRadius: '12px',
                                overflow: 'hidden',
                                display: 'flex',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                border: '1px solid #ddd'
                            }}>
                                {/* Left Side: Visuals */}
                                <div style={{
                                    flex: 2,
                                    background: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #4c1d95 100%)', // Deep Blue/Purple
                                    padding: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    position: 'relative'
                                }}>
                                    {/* Abstract Decoration */}
                                    <div style={{ position: 'absolute', top: -20, left: -20, width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(234, 179, 8, 0.2)', filter: 'blur(20px)' }} />

                                    <h2 style={{
                                        margin: 0,
                                        color: '#fbbf24', // Gold
                                        fontSize: '28px',
                                        fontWeight: '900',
                                        letterSpacing: '1px',
                                        textTransform: 'uppercase',
                                        textShadow: '0 2px 10px rgba(251, 191, 36, 0.5)'
                                    }}>
                                        Sri Lankan Night
                                    </h2>
                                    <p style={{ margin: '4px 0', color: 'rgba(255,255,255,0.9)', fontSize: '14px', letterSpacing: '2px' }}>FEBRUARY 2026</p>
                                    <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>VIP ACCESS</span>
                                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>NON-REFUNDABLE</span>
                                    </div>
                                </div>

                                {/* Right Side: Barcode */}
                                <div style={{
                                    flex: 1,
                                    background: 'white',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderLeft: '2px dashed #cbd5e1',
                                    position: 'relative'
                                }}>
                                    {/* Cut Marks */}
                                    <div style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, background: 'white', borderRadius: '50%' }} />
                                    <div style={{ position: 'absolute', left: -10, bottom: -10, width: 20, height: 20, background: 'white', borderRadius: '50%' }} />

                                    <div style={{ transform: 'scale(0.9)' }}>
                                        <Barcode value={ticket.id} width={1.5} height={50} fontSize={12} />
                                    </div>
                                    <p style={{ margin: '8px 0 0 0', fontSize: '10px', color: '#64748b' }}>Scan at Entry</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
