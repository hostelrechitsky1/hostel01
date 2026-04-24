import { applyVipRecurringForNextWeek } from './_vip-auto-apply.js'

const parseNextRun = async (request) => {
  try {
    const payload = await request.json()
    if (typeof payload?.next_run === 'string' && payload.next_run) {
      const nextRun = new Date(payload.next_run)
      if (!Number.isNaN(nextRun.getTime())) {
        return nextRun
      }
    }
  } catch {
    // Ignore malformed or empty scheduled payloads and fall back to "now".
  }

  return new Date()
}

const handler = async (request) => {
  const now = await parseNextRun(request)
  const summary = await applyVipRecurringForNextWeek({
    now,
    source: 'scheduled-function',
  })

  console.log('VIP scheduled auto-apply summary', summary)
  return new Response(null, { status: 204 })
}

export default handler

export const config = {
  schedule: '@hourly',
}
