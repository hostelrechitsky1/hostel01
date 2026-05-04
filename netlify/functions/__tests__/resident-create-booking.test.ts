import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  commitFirestoreWrites: vi.fn(() => Promise.resolve()),
  decodeFirestoreDocument: vi.fn((document: { fields?: { forceCloseBookings?: { booleanValue?: boolean } } }) => ({
    forceCloseBookings: document?.fields?.forceCloseBookings?.booleanValue === true,
  })),
  encodeFirestoreDocument: vi.fn(),
  getFirestoreDocument: vi.fn(),
  jsonResponse: vi.fn((statusCode: number, body: unknown, headers?: Record<string, string>) => ({
    statusCode,
    body: JSON.stringify(body),
    headers: headers ?? {},
  })),
}));

vi.mock('../_resident-firestore.js', () => firestoreMocks);

describe('resident-create-booking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when forceCloseBookings is true', async () => {
    firestoreMocks.getFirestoreDocument.mockImplementation(async (collectionId: string) => {
      if (collectionId === 'settings') {
        return {
          fields: { forceCloseBookings: { booleanValue: true } },
        };
      }
      return null;
    });

    const { handler } = await import('../resident-create-booking.js');

    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        studentId: 'student-1',
        machineId: '1',
        date: '2026-05-05',
        startTime: '09:00',
        endTime: '10:30',
        weekId: '2026-W19',
        createdAt: 1,
      }),
    });

    expect(result.statusCode).toBe(403);
    expect(firestoreMocks.commitFirestoreWrites).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.body as string);
    expect(parsed.errorCode).toBe('bookings_paused');
  });

  it('creates booking when forceCloseBookings is false', async () => {
    firestoreMocks.getFirestoreDocument.mockImplementation(async (collectionId: string) => {
      if (collectionId === 'settings') {
        return {
          fields: { forceCloseBookings: { booleanValue: false } },
        };
      }
      return null;
    });

    const { handler } = await import('../resident-create-booking.js');

    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        studentId: 'student-1',
        machineId: '1',
        date: '2026-05-05',
        startTime: '09:00',
        endTime: '10:30',
        weekId: '2026-W19',
        createdAt: 1,
      }),
    });

    expect(result.statusCode).toBe(200);
    expect(firestoreMocks.commitFirestoreWrites).toHaveBeenCalled();
  });
});
