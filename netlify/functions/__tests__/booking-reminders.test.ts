import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  decodeFirestoreDocument: vi.fn((doc) => doc),
  getFirestoreDocument: vi.fn(),
  runFirestoreQueryDocuments: vi.fn(),
}))
const deliveries = vi.hoisted(() => {
  const items = new Map<string, unknown>()
  return {
    items,
    store: {
      setJSON: vi.fn(async (key: string, value: unknown, options: { onlyIfNew: boolean }) => {
        if (options.onlyIfNew && items.has(key)) return { modified: false }
        items.set(key, value)
        return { modified: true }
      }),
      delete: vi.fn(async (key: string) => { items.delete(key) }),
    },
  }
})
const preferences = vi.hoisted(() => ({ getReminderPreference: vi.fn() }))
const emails = vi.hoisted(() => ({ buildReminderEmail: vi.fn(), sendBrevoEmail: vi.fn() }))

vi.mock('../_resident-firestore.js', () => firestore)
vi.mock('@netlify/blobs', () => ({ getStore: () => deliveries.store }))
vi.mock('../_reminder-preferences.js', () => preferences)
vi.mock('../_reminder-email.js', () => emails)

import { dispatchBookingReminders, getDueReminderKinds, parseBookingTime } from '../_booking-reminders.js'

const booking = {
  id: '2026-09-28_2_16-30', studentId: 'resident-1', studentName: 'Ayon Silva',
  roomNumber: '52-2', machineId: '2', date: '2026-09-28', startTime: '16:30', endTime: '18:00', createdAt: 1790590000000,
}

describe('booking reminder scheduling', () => {
  beforeEach(() => {
    deliveries.items.clear()
    vi.clearAllMocks()
    firestore.runFirestoreQueryDocuments.mockResolvedValue([booking])
    firestore.getFirestoreDocument.mockImplementation(async (collection: string) => collection === 'bookings' ? booking : null)
    preferences.getReminderPreference.mockResolvedValue({ enabled: true, email: 'resident@example.com' })
    emails.buildReminderEmail.mockReturnValue({ subject: 'Reminder', htmlContent: '<p>Reminder</p>', textContent: 'Reminder' })
    emails.sendBrevoEmail.mockResolvedValue({ messageId: 'message-1' })
  })

  it('uses Minsk local time and finds both reminder events', () => {
    expect(parseBookingTime('2026-09-28', '16:30')).toBe(Date.parse('2026-09-28T13:30:00Z'))
    expect(getDueReminderKinds(booking, Date.parse('2026-09-28T13:15:00Z'))).toEqual(['start'])
    expect(getDueReminderKinds(booking, Date.parse('2026-09-28T14:45:00Z'))).toEqual(['collect'])
    expect(getDueReminderKinds(booking, Date.parse('2026-09-28T13:00:00Z'))).toEqual([])
  })

  it('sends the start reminder once to a verified subscriber', async () => {
    const summary = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
    expect(summary.sent).toBe(1)
    expect(firestore.runFirestoreQueryDocuments).toHaveBeenCalledWith(expect.objectContaining({
      filters: [{ fieldPath: 'date', op: 'EQUAL', value: { stringValue: '2026-09-28' } }],
    }))
    expect(deliveries.store.setJSON).toHaveBeenCalledWith(expect.any(String), expect.any(Object), { onlyIfNew: true })
    expect(emails.sendBrevoEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'resident@example.com' }))
  })

  it('does not send after a booking is cancelled', async () => {
    firestore.getFirestoreDocument.mockResolvedValue(null)
    const summary = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
    expect(summary.sent).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(emails.sendBrevoEmail).not.toHaveBeenCalled()
    expect(deliveries.store.setJSON).toHaveBeenCalledTimes(1)
    expect(deliveries.store.delete).toHaveBeenCalledTimes(1)
  })

  it('does not send an old reminder after a slot is booked by someone else', async () => {
    firestore.getFirestoreDocument.mockResolvedValue({ ...booking, studentId: 'resident-2', createdAt: booking.createdAt + 1 })
    const summary = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
    expect(summary.skipped).toBe(1)
    expect(emails.sendBrevoEmail).not.toHaveBeenCalled()
  })

  it('sends for a replacement booking after the original slot was cancelled', async () => {
    let current = booking
    firestore.runFirestoreQueryDocuments.mockImplementation(async () => [current])
    firestore.getFirestoreDocument.mockImplementation(async (collection: string) => collection === 'bookings' ? current : null)
    const first = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
    current = { ...booking, studentId: 'resident-2', createdAt: booking.createdAt + 1 }
    const second = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
    expect(first.sent).toBe(1)
    expect(second.sent).toBe(1)
    const claims = deliveries.store.setJSON.mock.calls.map(([key]) => key)
    expect(claims).toHaveLength(2)
    expect(claims[0]).not.toBe(claims[1])
  })

  it('does not send the same reminder twice when the scheduler runs again', async () => {
    const now = new Date('2026-09-28T13:15:00Z')
    expect((await dispatchBookingReminders({ now })).sent).toBe(1)
    expect((await dispatchBookingReminders({ now })).skipped).toBe(1)
    expect(emails.sendBrevoEmail).toHaveBeenCalledTimes(1)
  })

  it('skips a cancelled slot and reminds the newly booked time instead', async () => {
    const newBooking = {
      ...booking, id: '2026-09-28_2_18-00', startTime: '18:00', endTime: '19:30', createdAt: booking.createdAt + 10,
    }
    firestore.getFirestoreDocument.mockResolvedValueOnce(null).mockResolvedValueOnce(newBooking)
    const oldResult = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
    firestore.runFirestoreQueryDocuments.mockResolvedValue([newBooking])
    const newResult = await dispatchBookingReminders({ now: new Date('2026-09-28T14:45:00Z') })
    expect(oldResult).toMatchObject({ sent: 0, skipped: 1 })
    expect(newResult).toMatchObject({ sent: 1, skipped: 0 })
    expect(emails.sendBrevoEmail).toHaveBeenCalledTimes(1)
  })

  it('continues with other bookings when one preference lookup fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      firestore.runFirestoreQueryDocuments.mockResolvedValue([booking, { ...booking, id: '2026-09-28_3_16-30', machineId: '3' }])
      preferences.getReminderPreference.mockRejectedValueOnce(new Error('storage unavailable'))
      const summary = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
      expect(summary.failed).toBe(1)
      expect(summary.sent).toBe(1)
    } finally {
      errorLog.mockRestore()
    }
  })

  it('skips residents who did not opt in', async () => {
    preferences.getReminderPreference.mockResolvedValue(null)
    const summary = await dispatchBookingReminders({ now: new Date('2026-09-28T13:15:00Z') })
    expect(summary.skipped).toBe(1)
    expect(deliveries.store.setJSON).not.toHaveBeenCalled()
    expect(emails.sendBrevoEmail).not.toHaveBeenCalled()
  })
})
