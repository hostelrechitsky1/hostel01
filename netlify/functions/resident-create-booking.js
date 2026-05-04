import {
  commitFirestoreWrites,
  decodeFirestoreDocument,
  encodeFirestoreDocument,
  getFirestoreDocument,
  jsonResponse,
} from './_resident-firestore.js'

const BOOKINGS_COL = 'bookings'
const BOOKING_LIMITS_COL = 'bookingLimits'
const SETTINGS_COL = 'settings'
const SETTINGS_DOC_ID = 'config'

const getBookingConflictDetails = async (slotId, limitId) => {
  try {
    const [slotDoc, limitDoc] = await Promise.all([
      getFirestoreDocument(BOOKINGS_COL, slotId),
      getFirestoreDocument(BOOKING_LIMITS_COL, limitId),
    ])

    if (slotDoc) {
      return {
        error: 'Slot already booked by another student. Please try a different time.',
        errorCode: 'slot_conflict',
      }
    }

    if (limitDoc) {
      return {
        error: 'You have already booked a slot for this week.',
        errorCode: 'weekly_limit',
      }
    }
  } catch (error) {
    console.error('Failed to inspect booking conflict details', error)
  }

  return {
    error: 'This slot is no longer available right now. Please refresh and try another slot.',
    errorCode: 'unknown_conflict',
  }
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { success: false, error: 'Method not allowed' })
    }

    const booking = JSON.parse(event.body ?? '{}')

    if (!booking?.studentId || !booking?.machineId || !booking?.date || !booking?.startTime || !booking?.weekId) {
      return jsonResponse(400, { success: false, error: 'Missing booking fields' })
    }

    const slotId = `${booking.date}_${booking.machineId}_${booking.startTime.replace(':', '-')}`
    const limitId = `${booking.studentId}_${booking.weekId}`
    const bookingRecord = { ...booking, id: slotId }

    const settingsDoc = await getFirestoreDocument(SETTINGS_COL, SETTINGS_DOC_ID, ['forceCloseBookings'])
    const rawSettings = settingsDoc ? decodeFirestoreDocument(settingsDoc, false) : {}
    if (rawSettings.forceCloseBookings === true) {
      return jsonResponse(403, {
        success: false,
        error: 'Bookings are paused by admin.',
        errorCode: 'bookings_paused',
      }, {
        'Cache-Control': 'no-store',
      })
    }

    await commitFirestoreWrites([
      {
        update: encodeFirestoreDocument(BOOKINGS_COL, slotId, bookingRecord),
        currentDocument: { exists: false },
      },
      {
        update: encodeFirestoreDocument(BOOKING_LIMITS_COL, limitId, {
          studentId: booking.studentId,
          weekId: booking.weekId,
          bookingId: slotId,
        }),
        currentDocument: { exists: false },
      },
    ])

    return jsonResponse(200, {
      success: true,
      booking: bookingRecord,
    }, {
      'Cache-Control': 'no-store',
    })
  } catch (error) {
    console.error('resident-create-booking failed', error)

    const booking = JSON.parse(event.body ?? '{}')
    const slotId = booking?.date && booking?.machineId && booking?.startTime
      ? `${booking.date}_${booking.machineId}_${booking.startTime.replace(':', '-')}`
      : null
    const limitId = booking?.studentId && booking?.weekId
      ? `${booking.studentId}_${booking.weekId}`
      : null

    if (slotId && limitId) {
      const conflict = await getBookingConflictDetails(slotId, limitId)
      return jsonResponse(409, {
        success: false,
        ...conflict,
      }, {
        'Cache-Control': 'no-store',
      })
    }

    return jsonResponse(500, {
      success: false,
      error: 'Unable to confirm the booking right now. Please try again.',
    }, {
      'Cache-Control': 'no-store',
    })
  }
}
