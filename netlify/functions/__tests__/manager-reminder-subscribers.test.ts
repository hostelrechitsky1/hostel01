import { beforeEach, describe, expect, it, vi } from 'vitest'

const preferences = vi.hoisted(() => ({ getSubscribedReminderStatuses: vi.fn() }))
vi.mock('../_reminder-preferences.js', () => preferences)
import handler from '../manager-reminder-subscribers.js'

const post = (body: object) => handler(new Request('https://example.netlify.app/.netlify/functions/manager-reminder-subscribers', {
  method: 'POST', body: JSON.stringify(body),
}))

describe('manager reminder subscriber list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferences.getSubscribedReminderStatuses.mockResolvedValue([{ studentId: 'resident-1', email: 'a***@example.com' }])
  })

  it('returns only masked addresses for submitted resident credentials', async () => {
    const resident = { studentId: 'resident-1', roomNumber: '52-2', pin: '123' }
    const response = await post({ residents: [resident, resident] })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(preferences.getSubscribedReminderStatuses).toHaveBeenCalledWith([resident])
    expect(await response.json()).toEqual({ subscribers: [{ studentId: 'resident-1', email: 'a***@example.com' }] })
  })

  it('rejects malformed bulk requests', async () => {
    expect((await post({ residents: [{ studentId: 'one' }] })).status).toBe(400)
    expect((await post({ residents: Array.from({ length: 1001 }, () => ({ studentId: 'one', roomNumber: '1' })) })).status).toBe(400)
    expect(preferences.getSubscribedReminderStatuses).not.toHaveBeenCalled()
  })
})
