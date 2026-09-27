import {
  getReminderPreferenceStatus,
  normalizeReminderEmail,
  removeReminderPreference,
  setReminderPreference,
  verifyResidentIdentity,
} from './_reminder-preferences.js'

const reply = (status, body) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

export default async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })

  try {
    const payload = await request.json()
    const student = await verifyResidentIdentity(payload)
    if (!student) return reply(403, { error: 'Please sign in again to manage reminders.' })

    if (payload.action === 'status') {
      return reply(200, await getReminderPreferenceStatus(student.id))
    }
    if (payload.action === 'remove') {
      await removeReminderPreference(student.id)
      return reply(200, { enabled: false, email: '' })
    }
    if (payload.action !== 'subscribe') return reply(400, { error: 'Invalid action' })

    const email = normalizeReminderEmail(payload.email)
    if (!email) return reply(400, { error: 'Enter a valid email address.' })
    await setReminderPreference(student.id, email)
    return reply(200, await getReminderPreferenceStatus(student.id))
  } catch (error) {
    console.error('resident-email-preference failed', error)
    return reply(500, { error: 'Reminders are unavailable right now. Please try again later.' })
  }
}
