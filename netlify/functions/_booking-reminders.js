import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { decodeFirestoreDocument, getFirestoreDocument, runFirestoreQueryDocuments } from './_resident-firestore.js'
import { getReminderPreference } from './_reminder-preferences.js'
import { buildReminderEmail, sendBrevoEmail } from './_reminder-email.js'

const BOOKINGS_COL = 'bookings'
const DELIVERIES_STORE = 'booking-reminder-deliveries'
const REMINDER_ADVANCE_MS = 15 * 60 * 1000
const EARLY_TOLERANCE_MS = 60 * 1000
const LATE_TOLERANCE_MS = 90 * 1000
const BOOKING_FIELDS = ['id', 'studentId', 'studentName', 'roomNumber', 'machineId', 'date', 'startTime', 'endTime', 'createdAt']

export const parseBookingTime = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{2}:\d{2}$/.test(time ?? '')) return NaN
  const timestamp = Date.parse(`${date}T${time}:00+03:00`)
  return Number.isFinite(timestamp) ? timestamp : NaN
}

const belarusDate = (timestamp) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(timestamp)

export const getDueReminderKinds = (booking, nowMs) => {
  return /** @type {Array<'start' | 'collect'>} */ (['start', 'collect']).filter((kind) => {
    const eventTime = parseBookingTime(booking.date, kind === 'start' ? booking.startTime : booking.endTime)
    const lead = eventTime - nowMs
    return Number.isFinite(lead)
      && lead >= REMINDER_ADVANCE_MS - LATE_TOLERANCE_MS
      && lead <= REMINDER_ADVANCE_MS + EARLY_TOLERANCE_MS
  })
}

const deliveryStore = () => getStore({ name: DELIVERIES_STORE, consistency: 'strong' })

const claimDelivery = async (booking, kind, nowMs) => {
  // A slot ID can be reused after a cancellation. A new booking needs its own reminder.
  const deliveryId = createHash('sha256')
    .update(JSON.stringify([booking.id, booking.studentId, booking.createdAt ?? null, kind]))
    .digest('hex')
  const result = await deliveryStore().setJSON(deliveryId, {
    bookingId: booking.id, kind, claimedAt: nowMs,
  }, { onlyIfNew: true })
  return result.modified ? deliveryId : null
}

const releaseDelivery = async (deliveryId) => {
  await deliveryStore().delete(deliveryId)
}

export const dispatchBookingReminders = async ({ now = new Date() } = {}) => {
  const nowMs = now.getTime()
  const dueDate = belarusDate(new Date(nowMs + REMINDER_ADVANCE_MS))
  const bookingDocs = await runFirestoreQueryDocuments({
    collectionId: BOOKINGS_COL,
    filters: [{ fieldPath: 'date', op: 'EQUAL', value: { stringValue: dueDate } }],
    fieldPaths: BOOKING_FIELDS,
    limit: 400,
  })
  const summary = { examined: bookingDocs.length, sent: 0, skipped: 0, failed: 0 }

  for (const document of bookingDocs) {
    const booking = decodeFirestoreDocument(document)
    if (!booking.id || !booking.studentId) continue
    for (const kind of getDueReminderKinds(booking, nowMs)) {
      let deliveryId = null
      try {
        const preference = await getReminderPreference(booking.studentId)
        if (!preference?.enabled || !preference.email) {
          summary.skipped += 1
          continue
        }
        deliveryId = await claimDelivery(booking, kind, nowMs)
        if (!deliveryId) {
          summary.skipped += 1
          continue
        }
        const currentDoc = await getFirestoreDocument(BOOKINGS_COL, booking.id, BOOKING_FIELDS)
        const current = currentDoc ? decodeFirestoreDocument(currentDoc) : null
        if (!current || current.studentId !== booking.studentId
          || current.date !== booking.date || current.startTime !== booking.startTime
          || current.endTime !== booking.endTime || current.createdAt !== booking.createdAt) {
          await releaseDelivery(deliveryId)
          deliveryId = null
          summary.skipped += 1
          continue
        }
        const email = buildReminderEmail(kind, current)
        await sendBrevoEmail({ to: preference.email, ...email, tags: [`booking-${kind}-reminder`] })
        summary.sent += 1
      } catch (error) {
        summary.failed += 1
        console.error('Booking reminder delivery failed', { bookingId: booking.id, kind, error })
        if (deliveryId) {
          try {
            await releaseDelivery(deliveryId)
          } catch (releaseError) {
            console.error('Booking reminder claim release failed', { bookingId: booking.id, kind, releaseError })
          }
        }
      }
    }
  }
  return summary
}
