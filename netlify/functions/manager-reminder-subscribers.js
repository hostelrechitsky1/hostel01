import { getSubscribedReminderStatuses } from './_reminder-preferences.js'

const reply = (status, body) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

export default async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })

  let payload
  try { payload = await request.json() }
  catch { return reply(400, { error: 'Invalid request' }) }

  const residents = payload?.residents
  if (!Array.isArray(residents) || residents.length > 1000 || residents.some((resident) => (
    !resident || typeof resident.studentId !== 'string' || resident.studentId.length > 200
    || typeof resident.roomNumber !== 'string' || resident.roomNumber.length > 100
    || (typeof resident.pin !== 'undefined' && (typeof resident.pin !== 'string' || resident.pin.length > 100))
  ))) return reply(400, { error: 'Invalid residents' })

  try {
    const uniqueResidents = [...new Map(residents.map((resident) => [resident.studentId, resident])).values()]
    return reply(200, { subscribers: await getSubscribedReminderStatuses(uniqueResidents) })
  } catch (error) {
    console.error('manager-reminder-subscribers failed', error)
    return reply(500, { error: 'Could not load reminder subscribers.' })
  }
}
