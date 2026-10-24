import { applyVipRecurringForNextWeek } from './_vip-auto-apply.js'

const handler = async () => {
  const summary = await applyVipRecurringForNextWeek({
    now: new Date(),
    source: 'scheduled-function',
  })

  console.log('VIP scheduled auto-apply summary', summary)
  return new Response(null, { status: 204 })
}

export default handler

export const config = {
  schedule: '@hourly',
}
