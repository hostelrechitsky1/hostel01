import { verifyResidentIdentity } from './_reminder-preferences.js'
import {
  commitFirestoreWrites,
  decodeFirestoreDocument,
  encodeFirestoreDocument,
  getFirestoreDocument,
} from './_resident-firestore.js'

const reply = (status, body) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

export default async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })

  let payload
  try { payload = await request.json() }
  catch { return reply(400, { error: 'Invalid request' }) }

  const feedbackId = payload?.feedbackId
  const repliedAt = payload?.repliedAt
  if (typeof feedbackId !== 'string' || !/^[^\u0000-\u001f/]{1,200}$/u.test(feedbackId)
    || !Number.isSafeInteger(repliedAt) || repliedAt <= 0) {
    return reply(400, { error: 'Invalid reply' })
  }

  try {
    const student = await verifyResidentIdentity(payload)
    if (!student) return reply(403, { error: 'Please sign in again.' })

    const document = await getFirestoreDocument('feedbacks', feedbackId)
    if (!document) return reply(404, { error: 'Reply not found.' })
    const feedback = decodeFirestoreDocument(document)
    const belongsToStudent = feedback.studentId
      ? feedback.studentId === student.id
      : feedback.roomNumber?.trim().toLowerCase() === student.roomNumber.trim().toLowerCase()
        && feedback.studentName?.trim().toLowerCase() === student.name.trim().toLowerCase()
    if (!belongsToStudent) return reply(403, { error: 'You can only remove your own replies.' })
    if (feedback.adminReply?.repliedAt !== repliedAt) return reply(409, { error: 'This reply has changed. Refresh and try again.' })

    await commitFirestoreWrites([{
      update: encodeFirestoreDocument('feedbacks', feedbackId, { residentDismissedReplyAt: repliedAt }),
      updateMask: { fieldPaths: ['residentDismissedReplyAt'] },
      currentDocument: { updateTime: document.updateTime },
    }])
    return reply(200, { success: true, feedbackId })
  } catch (error) {
    console.error('resident-dismiss-feedback failed', error)
    return reply(500, { error: 'Could not remove this reply. Please try again.' })
  }
}
