import {
  commitFirestoreWrites,
  encodeFirestoreDocument,
  getFirestoreDocument,
  jsonResponse,
} from './_resident-firestore.js'

const BOOKINGS_COL = 'bookings'
const BOOKING_LIMITS_COL = 'bookingLimits'

const getBookingConflictMessage = async (slotId, limitId) => {
  try {
    const [slotDoc, limitDoc] = await Promise.all([
      getFirestoreDocument(BOOKINGS_COL, slotId),
      getFirestoreDocument(BOOKING_LIMITS_COL, limitId),
    ])

    if (slotDoc) {
      return 'Slot already booked by another student. Please try a different time.'
    }

    if (limitDoc) {
      return 'You have already booked a slot for this week.'
    }
  } catch (error) {
    console.error('Failed to inspect booking conflict details', error)
  }

  return 'This slot is no longer available right now. Please refresh and try another slot.'
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
      const message = await getBookingConflictMessage(slotId, limitId)
      return jsonResponse(409, {
        success: false,
        error: message,
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
