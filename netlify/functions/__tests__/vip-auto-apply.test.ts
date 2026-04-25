import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestoreMocks = vi.hoisted(() => ({
  commitFirestoreWrites: vi.fn(),
  decodeFirestoreDocument: vi.fn((document) => document),
  encodeFirestoreDocument: vi.fn((collectionId, documentId, data) => ({
    name: `${collectionId}/${documentId}`,
    fields: data,
  })),
  getFirestoreDocument: vi.fn(),
  getFirestoreDocumentName: vi.fn((collectionId, documentId) => `${collectionId}/${documentId}`),
  listFirestoreCollectionDocuments: vi.fn(),
  runFirestoreQueryDocuments: vi.fn(),
}))

vi.mock('../_resident-firestore.js', () => firestoreMocks)

import { applyVipRecurringForNextWeek } from '../_vip-auto-apply.js'

vi.spyOn(console, 'error').mockImplementation(() => {})

const {
  commitFirestoreWrites,
  getFirestoreDocument,
  listFirestoreCollectionDocuments,
  runFirestoreQueryDocuments,
} = firestoreMocks

const BELARUS_OFFSET_MS = 3 * 60 * 60 * 1000

const addBelarusDays = (date: Date, days: number) => (
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
)

const getBelarusDate = (now: Date) => {
  const belarusNow = new Date(now.getTime() + BELARUS_OFFSET_MS)
  return new Date(Date.UTC(belarusNow.getUTCFullYear(), belarusNow.getUTCMonth(), belarusNow.getUTCDate()))
}

const getBelarusWeekStart = (date: Date) => {
  const weekday = date.getUTCDay()
  const diffToMonday = weekday === 0 ? 6 : weekday - 1
  return addBelarusDays(date, -diffToMonday)
}

const getBelarusWeekId = (date: Date) => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${utcDate.getUTCFullYear()}-W${weekNumber}`
}

const getNextWeekId = (now: Date) => {
  const currentWeekStart = getBelarusWeekStart(getBelarusDate(now))
  return getBelarusWeekId(addBelarusDays(currentWeekStart, 7))
}

const testNow = new Date('2026-04-10T12:00:00.000Z')

const settingsDoc = (overrides: Record<string, unknown> = {}) => ({
  forceShowNextWeek: false,
  forceCloseBookings: false,
  maintenanceDay: 3,
  autoOpenWeekday: 6,
  autoOpenTime: '16:00',
  autoOpenDurationHours: 28,
  vipAutoEnabled: true,
  vipLastAppliedWeekId: '',
  topAlert: { message: '', isActive: false, type: 'info' },
  ...overrides,
})

const activeRuleDoc = {
  id: 'rule-1',
  studentId: 'student-1',
  machineId: 'machine-1',
  weekday: 6,
  startTime: '16:30',
  isActive: true,
  createdAt: 1,
}

const studentDoc = {
  id: 'student-1',
  name: 'VIP Student',
  roomNumber: '52-2',
}

const machineDoc = {
  id: 'machine-1',
  name: 'Machine 1',
  status: 'available',
}

describe('applyVipRecurringForNextWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getFirestoreDocument.mockImplementation(async (collectionId: string, documentId: string) => {
      if (collectionId === 'settings' && documentId === 'config') {
        return settingsDoc()
      }

      return null
    })

    listFirestoreCollectionDocuments.mockImplementation(async (collectionId: string) => {
      if (collectionId === 'vipRecurringRules') return [activeRuleDoc]
      if (collectionId === 'students') return [studentDoc]
      if (collectionId === 'machines') return [machineDoc]
      return []
    })

    runFirestoreQueryDocuments.mockResolvedValue([])
    commitFirestoreWrites.mockResolvedValue({})
  })

  it('skips work when the next week is already marked as applied', async () => {
    getFirestoreDocument.mockImplementation(async (collectionId: string, documentId: string) => {
      if (collectionId === 'settings' && documentId === 'config') {
        return settingsDoc({ vipLastAppliedWeekId: getNextWeekId(testNow) })
      }

      return null
    })

    const result = await applyVipRecurringForNextWeek({ now: testNow, source: 'test' })

    expect(result).toMatchObject({
      applied: false,
      reason: 'already_applied',
      nextWeekId: getNextWeekId(testNow),
    })
    expect(commitFirestoreWrites).not.toHaveBeenCalled()
  })

  it('creates the VIP booking and marks the week as applied when writes succeed', async () => {
    const result = await applyVipRecurringForNextWeek({ now: testNow, source: 'test' })

    expect(result).toMatchObject({
      applied: true,
      reason: 'applied',
      success: 1,
      failed: 0,
      blocked: 0,
    })
    expect(commitFirestoreWrites).toHaveBeenCalledTimes(2)

    const settingsWrite = commitFirestoreWrites.mock.calls[1][0][0]
    expect(settingsWrite.update.fields.vipLastAppliedWeekId).toBe(result.nextWeekId)
  })

  it('leaves the week retryable when booking creation fails', async () => {
    commitFirestoreWrites.mockRejectedValueOnce(new Error('conflict'))
    getFirestoreDocument.mockImplementation(async (collectionId: string, documentId: string) => {
      if (collectionId === 'settings' && documentId === 'config') {
        return settingsDoc()
      }

      if (collectionId === 'bookings') {
        return {
          id: documentId,
          studentId: 'student-2',
          weekId: getNextWeekId(testNow),
        }
      }

      return null
    })

    const result = await applyVipRecurringForNextWeek({ now: testNow, source: 'test' })

    expect(result).toMatchObject({
      applied: false,
      reason: 'retry_pending',
      success: 0,
      failed: 1,
    })
    expect(commitFirestoreWrites).toHaveBeenCalledTimes(1)
  })
})
