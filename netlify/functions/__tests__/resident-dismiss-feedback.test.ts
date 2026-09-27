import { beforeEach, describe, expect, it, vi } from 'vitest'

const preferences = vi.hoisted(() => ({ verifyResidentIdentity: vi.fn() }))
const firestore = vi.hoisted(() => ({
  getFirestoreDocument: vi.fn(),
  decodeFirestoreDocument: vi.fn((document) => document),
  encodeFirestoreDocument: vi.fn((_collection, id, value) => ({ name: id, fields: value })),
  commitFirestoreWrites: vi.fn(),
}))
vi.mock('../_reminder-preferences.js', () => preferences)
vi.mock('../_resident-firestore.js', () => firestore)
import handler from '../resident-dismiss-feedback.js'

const post = (body: object) => handler(new Request('https://example.netlify.app/.netlify/functions/resident-dismiss-feedback', {
  method: 'POST', body: JSON.stringify(body),
}))
const request = { studentId: 'resident-1', roomNumber: '52-2', pin: '123', feedbackId: 'feedback-1', repliedAt: 1727460000000 }

describe('resident reply dismissal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferences.verifyResidentIdentity.mockResolvedValue({ id: 'resident-1', name: 'Ayon Silva', roomNumber: '52-2' })
    firestore.getFirestoreDocument.mockResolvedValue({
      id: 'feedback-1', studentId: 'resident-1', adminReply: { text: 'Hello', repliedAt: request.repliedAt },
      updateTime: '2026-09-27T12:00:00Z',
    })
  })

  it('hides the current reply while preserving the manager feedback record', async () => {
    const response = await post(request)
    expect(response.status).toBe(200)
    expect(firestore.commitFirestoreWrites).toHaveBeenCalledWith([{
      update: { name: 'feedback-1', fields: { residentDismissedReplyAt: request.repliedAt } },
      updateMask: { fieldPaths: ['residentDismissedReplyAt'] },
      currentDocument: { updateTime: '2026-09-27T12:00:00Z' },
    }])
  })

  it('does not let another resident hide the reply', async () => {
    firestore.getFirestoreDocument.mockResolvedValue({
      id: 'feedback-1', studentId: 'resident-2', adminReply: { text: 'Hello', repliedAt: request.repliedAt },
    })
    expect((await post(request)).status).toBe(403)
    expect(firestore.commitFirestoreWrites).not.toHaveBeenCalled()
  })

  it('does not hide a newly edited reply using an older timestamp', async () => {
    firestore.getFirestoreDocument.mockResolvedValue({
      id: 'feedback-1', studentId: 'resident-1', adminReply: { text: 'Updated', repliedAt: request.repliedAt + 1 },
    })
    expect((await post(request)).status).toBe(409)
    expect(firestore.commitFirestoreWrites).not.toHaveBeenCalled()
  })

  it('supports older feedback matched by resident name and room', async () => {
    firestore.getFirestoreDocument.mockResolvedValue({
      id: 'feedback-1', studentName: '  ayon silva ', roomNumber: '52-2',
      adminReply: { text: 'Hello', repliedAt: request.repliedAt },
      updateTime: '2026-09-27T12:00:00Z',
    })
    expect((await post(request)).status).toBe(200)
  })
})
