import { timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { decodeFirestoreDocument, getFirestoreDocument } from './_resident-firestore.js'

const STORE_NAME = 'resident-email-reminders'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STUDENT_ID_PATTERN = /^[^\u0000-\u001f/]{1,200}$/u

const store = () => getStore({ name: STORE_NAME, consistency: 'strong' })
const safeStudentKey = (studentId) => Buffer.from(studentId).toString('base64url')
const preferenceKey = (studentId) => `preference/${safeStudentKey(studentId)}`

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
  const preference = await getReminderPreference(studentId)
  return {
    enabled: Boolean(preference?.enabled && preference?.email),
    email: preference?.enabled ? maskReminderEmail(preference.email) : '',
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

export const setReminderPreference = async (studentId, email) => {
  await store().setJSON(preferenceKey(studentId), {
    email, enabled: true, updatedAt: Date.now(),
  })
}

export const removeReminderPreference = async (studentId) => {
  await store().delete(preferenceKey(studentId))
}
