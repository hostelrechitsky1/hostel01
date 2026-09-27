import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { decodeFirestoreDocument, getFirestoreDocument } from './_resident-firestore.js'

const STORE_NAME = 'resident-email-reminders'
const PENDING_TTL_MS = 24 * 60 * 60 * 1000
const REQUEST_COOLDOWN_MS = 60 * 1000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STUDENT_ID_PATTERN = /^[^\u0000-\u001f/]{1,200}$/u

const store = () => getStore({ name: STORE_NAME, consistency: 'strong' })
const safeStudentKey = (studentId) => Buffer.from(studentId).toString('base64url')
const preferenceKey = (studentId) => `preference/${safeStudentKey(studentId)}`
const pendingKey = (studentId) => `pending/${safeStudentKey(studentId)}`
const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export const normalizeReminderEmail = (value) => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null
}

export const maskReminderEmail = (email) => {
  if (!email) return ''
  const [name, domain] = email.split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 5)))}@${domain}`
}

export const getReminderPreference = async (studentId) => (
  store().get(preferenceKey(studentId), { type: 'json' })
)

export const getReminderPreferenceStatus = async (studentId) => {
  const [preference, pending] = await Promise.all([
    getReminderPreference(studentId),
    store().get(pendingKey(studentId), { type: 'json' }),
  ])
  return {
    enabled: Boolean(preference?.enabled && preference?.email),
    email: preference?.enabled ? maskReminderEmail(preference.email) : '',
    pendingEmail: pending?.expiresAt > Date.now() ? maskReminderEmail(pending.email) : '',
  }
}

export const verifyResidentIdentity = async ({ studentId, roomNumber, pin }) => {
  if (typeof studentId !== 'string' || !STUDENT_ID_PATTERN.test(studentId)
    || typeof roomNumber !== 'string' || (typeof pin !== 'string' && typeof pin !== 'undefined')) return null
  const document = await getFirestoreDocument('students', studentId, ['id', 'name', 'roomNumber', 'pin'])
  if (!document) return null
  const student = decodeFirestoreDocument(document)
  if (student.roomNumber !== roomNumber) return null
  const actualPin = Buffer.from(String(student.pin ?? ''))
  if (actualPin.length) {
    const suppliedPin = Buffer.from(pin ?? '')
    if (suppliedPin.length !== actualPin.length || !timingSafeEqual(suppliedPin, actualPin)) return null
  }
  return student
}

export const requestReminderVerification = async ({ studentId, email, now = Date.now() }) => {
  const preferenceStore = store()
  const pending = await preferenceStore.get(pendingKey(studentId), { type: 'json' })
  if (pending?.requestedAt && now - pending.requestedAt < REQUEST_COOLDOWN_MS) {
    return { cooldown: true }
  }
  const secret = randomBytes(32).toString('base64url')
  const token = `${Buffer.from(studentId).toString('base64url')}.${secret}`
  await preferenceStore.setJSON(pendingKey(studentId), {
    email, tokenHash: hashToken(secret), requestedAt: now, expiresAt: now + PENDING_TTL_MS,
  })
  return { token, cooldown: false }
}

export const clearPendingReminderVerification = async (studentId) => {
  await store().delete(pendingKey(studentId))
}

export const confirmReminderVerification = async (token, now = Date.now()) => {
  if (typeof token !== 'string' || token.length > 300) return false
  const [encodedId, secret] = token.split('.')
  if (!encodedId || !secret || !/^[A-Za-z0-9_-]+$/.test(encodedId) || !/^[A-Za-z0-9_-]+$/.test(secret)) return false
  const studentId = Buffer.from(encodedId, 'base64url').toString('utf8')
  if (!STUDENT_ID_PATTERN.test(studentId)) return false
  const preferenceStore = store()
  const pending = await preferenceStore.get(pendingKey(studentId), { type: 'json' })
  if (!pending || pending.expiresAt <= now || pending.tokenHash !== hashToken(secret)) return false
  await preferenceStore.setJSON(preferenceKey(studentId), {
    email: pending.email, enabled: true, verifiedAt: now,
  })
  await preferenceStore.delete(pendingKey(studentId))
  return true
}

export const removeReminderPreference = async (studentId) => {
  const preferenceStore = store()
  await Promise.all([
    preferenceStore.delete(preferenceKey(studentId)),
    preferenceStore.delete(pendingKey(studentId)),
  ])
}
