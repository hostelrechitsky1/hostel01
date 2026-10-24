import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const firestoreMocks = vi.hoisted(() => ({
  commitFirestoreWrites: vi.fn(),
  decodeFirestoreDocument: vi.fn((document) => document.fields),
  encodeFirestoreDocument: vi.fn((collectionId, documentId, data) => ({ name: `${collectionId}/${documentId}`, fields: data })),
  getFirestoreDocument: vi.fn(),
  getFirestoreDocumentName: vi.fn((collectionId, documentId) => `${collectionId}/${documentId}`),
  listFirestoreCollectionDocuments: vi.fn(),
  runFirestoreQueryDocuments: vi.fn(),
}))
vi.mock('../_resident-firestore.js', () => firestoreMocks)
import { applyVipRecurringForNextWeek } from '../_vip-auto-apply.js'
import scheduledHandler from '../vip-auto-apply.mjs'

const now = new Date('2026-10-24T12:59:00Z') // Saturday 15:59 Minsk
const rule = { id: 'rule-1', studentId: 'student-1', machineId: 'machine-1', weekday: 6, startTime: '21:00', isActive: true, createdAt: 1 }
const settings = {
  forceShowNextWeek: false, forceCloseBookings: false, maintenanceDay: 3,
  autoOpenWeekday: 6, autoOpenTime: '16:00', autoOpenDurationHours: 168,
  slotDurationMinutes: 90, vipAutoEnabled: true, vipLastAppliedWeekId: '2026-W44',
  topAlert: { message: '', isActive: false, type: 'info' }, unrelatedSetting: 'keep me',
}
let database: Map<string, { name: string; fields: Record<string, unknown>; updateTime: string }>
let revision: number
const put = (name: string, fields: Record<string, unknown>) => {
  database.set(name, { name, fields: { ...fields }, updateTime: String(++revision) })
}
const bookings = () => [...database.values()].filter((document) => document.name.startsWith('bookings/')).map((document) => document.fields)
const seedBooking = (date: string, startTime = '19:30', studentId = 'student-1', machineId = 'machine-1') => {
  const id = `${date}_${machineId}_${startTime.replace(':', '-')}`
  const weekId = date < '2026-10-26' ? '2026-W43' : '2026-W44'
  put(`bookings/${id}`, { id, date, startTime, endTime: '21:00', studentId, machineId, weekId, createdAt: 1 })
  put(`bookingLimits/${studentId}_${weekId}`, { studentId, weekId, bookingId: id })
  return id
}

beforeEach(() => {
  vi.clearAllMocks()
  revision = 0
  database = new Map()
  put('settings/config', settings)
  put('vipRecurringRules/rule-1', rule)
  put('students/student-1', { id: 'student-1', name: 'VIP Student', roomNumber: '52-2' })
  put('machines/machine-1', { id: 'machine-1', name: 'Machine 1', status: 'available' })
  firestoreMocks.getFirestoreDocument.mockImplementation(async (collection: string, id: string) => database.get(`${collection}/${id}`) ?? null)
  firestoreMocks.listFirestoreCollectionDocuments.mockImplementation(async (collection: string) => [...database.values()].filter((document) => document.name.startsWith(`${collection}/`)))
  firestoreMocks.runFirestoreQueryDocuments.mockImplementation(async () => [...database.values()].filter((document) => document.name.startsWith('bookings/')))
  firestoreMocks.commitFirestoreWrites.mockImplementation(async (writes) => {
    // Validate the complete commit first, so failures model atomic Firestore writes.
    for (const write of writes) {
      const current = database.get(write.delete ?? write.update.name)
      if (write.currentDocument?.updateTime && current?.updateTime !== write.currentDocument.updateTime) throw new Error('changed concurrently')
      if (write.currentDocument?.exists === false && current) throw new Error('already exists')
    }
    for (const write of writes) {
      if (write.delete) database.delete(write.delete)
      else put(write.update.name, write.updateMask ? { ...database.get(write.update.name)?.fields, ...write.update.fields } : write.update.fields)
    }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('VIP reservation reconciliation', () => {
  it('repairs missing bookings despite an already-applied marker, then makes no changes on repeat', async () => {
    const result = await applyVipRecurringForNextWeek({ now })
    expect(result).toMatchObject({ applied: true, success: 2, nextWeekId: '2026-W44' })
    expect(bookings().map((booking) => booking.date)).toEqual(['2026-10-24', '2026-10-31'])
    expect(bookings().map((booking) => booking.endTime)).toEqual(['22:30', '22:30'])
    expect(firestoreMocks.commitFirestoreWrites).toHaveBeenCalledTimes(2)
    await applyVipRecurringForNextWeek({ now })
    expect(firestoreMocks.commitFirestoreWrites).toHaveBeenCalledTimes(2)
  })

  it('moves edited upcoming bookings in both weeks and updates the weekly limits atomically', async () => {
    seedBooking('2026-10-24')
    seedBooking('2026-10-31')
    const result = await applyVipRecurringForNextWeek({ now })
    expect(result).toMatchObject({ applied: true, success: 2, overridden: 2 })
    expect(bookings().every((booking) => booking.startTime === '21:00')).toBe(true)
    expect(database.get('bookingLimits/student-1_2026-W43')?.fields.bookingId).toBe('2026-10-24_machine-1_21-00')
    expect(firestoreMocks.commitFirestoreWrites.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ delete: 'bookings/2026-10-24_machine-1_19-30', currentDocument: expect.objectContaining({ updateTime: expect.any(String) }) }),
      expect.objectContaining({ update: expect.objectContaining({ name: 'bookings/2026-10-24_machine-1_21-00' }) }),
    ]))
  })

  it('keeps original bookings and limits intact when a replacement fails, then recovers on retry', async () => {
    const oldId = seedBooking('2026-10-24')
    firestoreMocks.commitFirestoreWrites.mockRejectedValueOnce(new Error('network failure'))
    const result = await applyVipRecurringForNextWeek({ now })
    expect(result).toMatchObject({ applied: false, reason: 'retry_pending', failed: 1, overridden: 0 })
    expect(database.has(`bookings/${oldId}`)).toBe(true)
    expect(database.get('bookingLimits/student-1_2026-W43')?.fields.bookingId).toBe(oldId)
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: true, success: 2 })
    expect(database.has(`bookings/${oldId}`)).toBe(false)
  })

  it('overrides an occupied slot and releases only the displaced resident limit', async () => {
    seedBooking('2026-10-24', '21:00', 'other-student')
    const result = await applyVipRecurringForNextWeek({ now })
    expect(result).toMatchObject({ applied: true, overridden: 1 })
    expect(database.has('bookingLimits/other-student_2026-W43')).toBe(false)
    expect(database.get('bookings/2026-10-24_machine-1_21-00')?.fields.studentId).toBe('student-1')
  })

  it('repairs a stale weekly limit pointing to a missing booking', async () => {
    put('bookingLimits/student-1_2026-W43', { studentId: 'student-1', weekId: '2026-W43', bookingId: 'missing-booking' })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: true, failed: 0 })
    expect(database.get('bookingLimits/student-1_2026-W43')?.fields.bookingId).toBe('2026-10-24_machine-1_21-00')
  })

  it('does not mark conflicting VIP rules successful or let one rule erase another', async () => {
    put('vipRecurringRules/rule-2', { ...rule, id: 'rule-2', startTime: '19:30' })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: false, blocked: 2, success: 0 })
    expect(bookings()).toHaveLength(0)
  })

  it('blocks off-grid legacy slot times instead of creating invisible bookings', async () => {
    put('vipRecurringRules/rule-1', { ...rule, startTime: '20:00' })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: false, blocked: 1 })
    expect(firestoreMocks.commitFirestoreWrites).not.toHaveBeenCalled()
  })

  it('uses the configured duration and repairs existing booking end times', async () => {
    put('settings/config', { ...settings, slotDurationMinutes: 60 })
    seedBooking('2026-10-24', '21:00')
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: true })
    expect(bookings().map((booking) => booking.endTime)).toEqual(['22:00', '22:00'])
  })

  it('keeps completed weekly bookings instead of granting another booking after a rule edit', async () => {
    const old = seedBooking('2026-10-22')
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: true, success: 1, skipped: 1 })
    expect(database.has(`bookings/${old}`)).toBe(true)
    expect(bookings()).toHaveLength(2)
  })

  it('retries a maintenance-blocked rule when the machine becomes available', async () => {
    put('machines/machine-1', { id: 'machine-1', name: 'Machine 1', status: 'maintenance' })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: false, blocked: 1 })
    put('machines/machine-1', { id: 'machine-1', name: 'Machine 1', status: 'available' })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: true, success: 2 })
  })

  it('updates only the reporting marker and preserves unrelated settings', async () => {
    put('settings/config', { ...settings, vipLastAppliedWeekId: '' })
    await applyVipRecurringForNextWeek({ now })
    const writes = firestoreMocks.commitFirestoreWrites.mock.calls.at(-1)![0]
    expect(writes).toEqual([{ update: { name: 'settings/config', fields: { vipLastAppliedWeekId: '2026-W44' } }, updateMask: { fieldPaths: ['vipLastAppliedWeekId'] } }])
    expect(database.get('settings/config')?.fields.unrelatedSetting).toBe('keep me')
  })

  it('honors disabled auto mode', async () => {
    put('settings/config', { ...settings, vipAutoEnabled: false })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: false, reason: 'disabled' })
    expect(firestoreMocks.commitFirestoreWrites).not.toHaveBeenCalled()
  })

  it('rejects an older scheduled run if the manager edits the rule before its commit', async () => {
    const oldId = seedBooking('2026-10-24')
    const commit = firestoreMocks.commitFirestoreWrites.getMockImplementation()!
    firestoreMocks.commitFirestoreWrites.mockImplementationOnce(async (writes) => {
      put('vipRecurringRules/rule-1', { ...rule, startTime: '18:00' })
      return commit(writes)
    })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: false, failed: 2, success: 0 })
    expect(database.has(`bookings/${oldId}`)).toBe(true)
    expect(database.has('bookings/2026-10-24_machine-1_21-00')).toBe(false)
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: true, success: 2 })
    expect(bookings().every((booking) => booking.startTime === '18:00')).toBe(true)
  })

  it('repairs a mismatched stored date even when the slot id and owner are correct', async () => {
    const id = seedBooking('2026-10-31', '21:00')
    put(`bookings/${id}`, { ...database.get(`bookings/${id}`)!.fields, date: '2026-10-30', endTime: '22:30' })
    expect(await applyVipRecurringForNextWeek({ now })).toMatchObject({ applied: true })
    expect(database.get(`bookings/${id}`)?.fields.date).toBe('2026-10-31')
  })

  it('uses execution time, rather than the scheduled next_run across Minsk Monday midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T20:30:00Z')) // Sunday 23:30 Minsk
    await scheduledHandler(new Request('https://example.com', { method: 'POST', body: JSON.stringify({ next_run: '2026-10-25T21:30:00Z' }) }))
    expect(bookings().map((booking) => booking.date)).toEqual(['2026-10-31'])
  })
})
