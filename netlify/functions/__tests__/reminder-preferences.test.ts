import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => {
  const items = new Map<string, unknown>()
  return {
    items,
    store: {
      get: vi.fn(async (key: string) => items.get(key) ?? null),
      setJSON: vi.fn(async (key: string, value: unknown) => { items.set(key, value) }),
      delete: vi.fn(async (key: string) => { items.delete(key) }),
    },
  }
})
const firestore = vi.hoisted(() => ({
  getFirestoreDocument: vi.fn(),
  decodeFirestoreDocument: vi.fn((doc) => doc),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => storage.store }))
vi.mock('../_resident-firestore.js', () => firestore)

import {
  confirmReminderVerification,
  getReminderPreference,
  getReminderPreferenceStatus,
  normalizeReminderEmail,
  removeReminderPreference,
  requestReminderVerification,
  verifyResidentIdentity,
} from '../_reminder-preferences.js'

describe('resident email opt-in', () => {
  beforeEach(() => {
    storage.items.clear()
    vi.clearAllMocks()
    firestore.getFirestoreDocument.mockResolvedValue({ id: 'resident-1', roomNumber: '52-2', pin: '123' })
  })

  it('requires the existing resident room PIN', async () => {
    expect(await verifyResidentIdentity({ studentId: 'resident-1', roomNumber: '52-2', pin: '000' })).toBeNull()
    expect(await verifyResidentIdentity({ studentId: 'resident-1', roomNumber: '52-2', pin: '123' })).toMatchObject({ id: 'resident-1' })
  })

  it('keeps email opt-in available for rooms that use the existing PIN-free login', async () => {
    firestore.getFirestoreDocument.mockResolvedValue({ id: 'resident-1', roomNumber: '52-2' })
    expect(await verifyResidentIdentity({ studentId: 'resident-1', roomNumber: '52-2' })).toMatchObject({ id: 'resident-1' })
  })

  it('supports the Cyrillic student IDs used by the existing login', async () => {
    const studentId = '311-джаялат-араччи-омави-акнара'
    firestore.getFirestoreDocument.mockResolvedValue({ id: studentId, roomNumber: '311', pin: '493' })
    expect(await verifyResidentIdentity({ studentId, roomNumber: '311', pin: '493' })).toMatchObject({ id: studentId })
    const { token } = await requestReminderVerification({ studentId, email: 'resident@example.com' })
    expect(await confirmReminderVerification(token)).toBe(true)
    expect(await getReminderPreference(studentId)).toMatchObject({ enabled: true })
  })

  it('activates only after email verification and removes the preference on request', async () => {
    const now = Date.parse('2026-09-27T00:00:00Z')
    const email = normalizeReminderEmail('  Ayon@Example.com  ')
    expect(email).toBe('ayon@example.com')
    const { token } = await requestReminderVerification({ studentId: 'resident-1', email, now })
    expect(await getReminderPreference('resident-1')).toBeNull()
    expect(await confirmReminderVerification(token, now + 60_000)).toBe(true)
    expect(await getReminderPreferenceStatus('resident-1')).toMatchObject({ enabled: true, email: 'a***@example.com' })
    expect(await confirmReminderVerification(token, now + 60_000)).toBe(false)
    await removeReminderPreference('resident-1')
    expect(await getReminderPreference('resident-1')).toBeNull()
  })

  it('expires unused links and limits repeated requests', async () => {
    const now = Date.parse('2026-09-27T00:00:00Z')
    const email = 'ayon@example.com'
    const { token } = await requestReminderVerification({ studentId: 'resident-1', email, now })
    expect(await requestReminderVerification({ studentId: 'resident-1', email, now: now + 1000 })).toEqual({ cooldown: true })
    expect(await confirmReminderVerification(token, now + 24 * 60 * 60 * 1000)).toBe(false)
    expect(await getReminderPreference('resident-1')).toBeNull()
  })
})
