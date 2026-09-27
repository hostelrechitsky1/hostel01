import { beforeEach, describe, expect, it, vi } from 'vitest'

const preferences = vi.hoisted(() => ({
  verifyResidentIdentity: vi.fn(),
  normalizeReminderEmail: vi.fn((email: string) => email.trim().toLowerCase()),
  getReminderPreferenceStatus: vi.fn(),
  setReminderPreference: vi.fn(),
  removeReminderPreference: vi.fn(),
}))

vi.mock('../_reminder-preferences.js', () => preferences)

import handler from '../resident-email-preference.js'

const post = (body: object) => handler(new Request('https://example.netlify.app/.netlify/functions/resident-email-preference', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}))

describe('resident email preference endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferences.verifyResidentIdentity.mockResolvedValue({ id: 'resident-1' })
    preferences.getReminderPreferenceStatus.mockResolvedValue({ enabled: true, email: 'a***@example.com' })
  })

  it('saves a valid address immediately after the existing resident sign-in', async () => {
    const response = await post({ action: 'subscribe', studentId: 'resident-1', email: '  Ayon@Example.com  ' })
    expect(response.status).toBe(200)
    expect(preferences.setReminderPreference).toHaveBeenCalledWith('resident-1', 'ayon@example.com')
    expect(await response.json()).toEqual({ enabled: true, email: 'a***@example.com' })
  })

  it('does not let an unrecognized resident change a preference', async () => {
    preferences.verifyResidentIdentity.mockResolvedValue(null)
    const response = await post({ action: 'subscribe', studentId: 'unknown', email: 'ayon@example.com' })
    expect(response.status).toBe(403)
    expect(preferences.setReminderPreference).not.toHaveBeenCalled()
  })
})
