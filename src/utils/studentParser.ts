import type { Student } from '../types';

export function parseRawStudentData(rawData: string): Student[] {
    const lines = rawData.split('\n').map(l => l.trim()).filter(l => l);
    const students: Student[] = [];
    let currentRoom = '';

    for (const line of lines) {
        // Detect Room Header (e.g., "**Room 311**" or "Room 311")
        const roomMatch = line.match(/Room\s+([0-9-]+)/i);
        if (roomMatch) {
            currentRoom = roomMatch[1];
            continue;
        }

        // If it's a name line (usually starts with * or just text if cleaned)
        // User input has "* Name", so remove leading * and whitespace
        const name = line.replace(/^\*\s*/, '').trim();

        if (name && currentRoom) {
            // Generate a simple ID (e.g., room-name-slug)
            const id = `${currentRoom}-${name.toLowerCase().replace(/\s+/g, '-')}`;
            students.push({
                id,
                name,
                roomNumber: currentRoom
            });
        }
    }
    return students;
}
