import {
  commitFirestoreWrites,
  decodeFirestoreDocument,
  getFirestoreDocument,
  getFirestoreDocumentName,
  jsonResponse,
} from './_resident-firestore.js'

const BELARUS_UTC_OFFSET_HOURS = 3
const BOOKINGS_COL = 'bookings'
const BOOKING_LIMITS_COL = 'bookingLimits'

const parseBelarusDateTimeToUtcMs = (dateString, timeString) => {
  const [year, month, day] = dateString.split('-').map(Number)
  const [hours, minutes] = timeString.split(':').map(Number)

  return Date.UTC(
    year,
    Math.max((month || 1) - 1, 0),
    day || 1,
    (hours || 0) - BELARUS_UTC_OFFSET_HOURS,
    minutes || 0,
    0,
    0
  )
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { success: false, error: 'Method not allowed' })
    }

    const payload = JSON.parse(event.body ?? '{}')
    const bookingId = typeof payload?.bookingId === 'string' ? payload.bookingId.trim() : ''
    const studentId = typeof payload?.studentId === 'string' ? payload.studentId.trim() : ''

    if (!bookingId || !studentId) {
      return jsonResponse(400, {
        success: false,
        error: 'Missing cancel booking fields',
        errorCode: 'system_error',
      })
    }

    const bookingDoc = await getFirestoreDocument(BOOKINGS_COL, bookingId)
    if (!bookingDoc) {
      return jsonResponse(404, {
        success: false,
        error: 'This booking was already removed.',
        errorCode: 'not_found',
      }, {
        'Cache-Control': 'no-store',
      })
    }

    const booking = decodeFirestoreDocument(bookingDoc)
    if (booking.studentId !== studentId) {
      return jsonResponse(403, {
        success: false,
        error: 'You can only cancel your own booking.',
        errorCode: 'not_allowed',
      }, {
        'Cache-Control': 'no-store',
      })
    }

    const bookingStartAtMs = parseBelarusDateTimeToUtcMs(booking.date, booking.startTime)
    if (bookingStartAtMs <= Date.now()) {
      return jsonResponse(409, {
        success: false,
        error: 'This booking has already started and can no longer be cancelled.',
        errorCode: 'already_started',
      }, {
        'Cache-Control': 'no-store',
      })
    }

    const limitId = `${booking.studentId}_${booking.weekId}`
    await commitFirestoreWrites([
      {
        delete: getFirestoreDocumentName(BOOKINGS_COL, bookingId),
      },
      {
        delete: getFirestoreDocumentName(BOOKING_LIMITS_COL, limitId),
      },
    ])

    return jsonResponse(200, {
      success: true,
      bookingId,
    }, {
      'Cache-Control': 'no-store',
    })
  } catch (error) {
    console.error('resident-cancel-booking failed', error)
    return jsonResponse(500, {
      success: false,
      error: 'Unable to cancel the booking right now. Please try again.',
      errorCode: 'system_error',
    }, {
      'Cache-Control': 'no-store',
    })
  }
}
