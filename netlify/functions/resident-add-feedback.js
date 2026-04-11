import {
  commitFirestoreWrites,
  encodeFirestoreDocument,
  jsonResponse,
} from './_resident-firestore.js'

const FEEDBACKS_COL = 'feedbacks'

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { success: false, error: 'Method not allowed' })
    }

    const feedback = JSON.parse(event.body ?? '{}')

    if (!feedback?.id || !feedback?.studentName || !feedback?.roomNumber || !feedback?.text) {
      return jsonResponse(400, { success: false, error: 'Missing feedback fields' })
    }

    await commitFirestoreWrites([
      {
        update: encodeFirestoreDocument(FEEDBACKS_COL, feedback.id, feedback),
      },
    ])

    return jsonResponse(200, {
      success: true,
    }, {
      'Cache-Control': 'no-store',
    })
  } catch (error) {
    console.error('resident-add-feedback failed', error)
    return jsonResponse(500, {
      success: false,
      error: 'Unable to send feedback right now. Please try again.',
    }, {
      'Cache-Control': 'no-store',
    })
  }
}
