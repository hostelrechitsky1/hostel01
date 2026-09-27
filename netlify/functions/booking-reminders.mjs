import { dispatchBookingReminders } from './_booking-reminders.js'

const handler = async () => {
  const summary = await dispatchBookingReminders()
  console.log('Booking reminders summary', summary)
  return new Response(null, { status: 204 })
}

export default handler

export const config = { schedule: '* * * * *' }
