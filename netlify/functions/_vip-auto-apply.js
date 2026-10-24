import {
  commitFirestoreWrites,
  decodeFirestoreDocument,
  encodeFirestoreDocument,
  getFirestoreDocument,
  getFirestoreDocumentName,
  listFirestoreCollectionDocuments,
  runFirestoreQueryDocuments,
} from './_resident-firestore.js'
import { getVipWeeks, reconcileVipBookings } from '../../shared/vip-recurring.js'

const SETTINGS_COL = 'settings'
const SETTINGS_DOC_ID = 'config'
const VIP_RULES_COL = 'vipRecurringRules'
const STUDENTS_COL = 'students'
const MACHINES_COL = 'machines'
const BOOKINGS_COL = 'bookings'
const BOOKING_LIMITS_COL = 'bookingLimits'

const SETTINGS_FIELDS = [
  'forceShowNextWeek',
  'forceCloseBookings',
  'maintenanceDay',
  'autoOpenWeekday',
  'autoOpenTime',
  'autoOpenDurationHours',
  'slotDurationMinutes',
  'vipAutoEnabled',
  'vipLastAppliedWeekId',
  'topAlert',
]
const VIP_RULE_FIELDS = ['id', 'studentId', 'machineId', 'weekday', 'startTime', 'isActive', 'createdAt']
const STUDENT_FIELDS = ['id', 'name', 'roomNumber']
const MACHINE_FIELDS = ['id', 'name', 'status']
const BOOKING_FIELDS = [
  'machineId',
  'studentId',
  'date',
  'startTime',
  'endTime',
  'weekId',
  'studentName',
  'roomNumber',
  'createdAt',
]

const DEFAULT_APP_SETTINGS = {
  forceShowNextWeek: false,
  forceCloseBookings: false,
  maintenanceDay: 3,
  autoOpenWeekday: 6,
  autoOpenTime: '16:00',
  autoOpenDurationHours: 168,
  slotDurationMinutes: 90,
  vipAutoEnabled: true,
  vipLastAppliedWeekId: '',
  topAlert: { message: '', isActive: false, type: 'info' },
}

const normalizeAppSettings = (settings) => {
  const data = settings ?? {}
  const slotDurationMinutes = Number(data.slotDurationMinutes)

  return {
    ...DEFAULT_APP_SETTINGS,
    ...data,
    maintenanceDay: typeof data.maintenanceDay !== 'undefined' ? Number(data.maintenanceDay) : DEFAULT_APP_SETTINGS.maintenanceDay,
    autoOpenWeekday: typeof data.autoOpenWeekday !== 'undefined' ? Number(data.autoOpenWeekday) : DEFAULT_APP_SETTINGS.autoOpenWeekday,
    autoOpenDurationHours: typeof data.autoOpenDurationHours !== 'undefined' && Number.isFinite(Number(data.autoOpenDurationHours)) ? Math.max(Number(data.autoOpenDurationHours), DEFAULT_APP_SETTINGS.autoOpenDurationHours) : DEFAULT_APP_SETTINGS.autoOpenDurationHours,
    slotDurationMinutes: Number.isFinite(slotDurationMinutes)
      ? Math.min(240, Math.max(30, Math.round(slotDurationMinutes / 5) * 5))
      : DEFAULT_APP_SETTINGS.slotDurationMinutes,
    autoOpenTime: typeof data.autoOpenTime === 'string' && /^\d{2}:\d{2}$/.test(data.autoOpenTime)
      ? data.autoOpenTime
      : DEFAULT_APP_SETTINGS.autoOpenTime,
    vipAutoEnabled: typeof data.vipAutoEnabled === 'boolean' ? data.vipAutoEnabled : DEFAULT_APP_SETTINGS.vipAutoEnabled,
    vipLastAppliedWeekId: typeof data.vipLastAppliedWeekId === 'string' ? data.vipLastAppliedWeekId : DEFAULT_APP_SETTINGS.vipLastAppliedWeekId,
    topAlert: data.topAlert
      ? {
          ...DEFAULT_APP_SETTINGS.topAlert,
          ...data.topAlert,
        }
      : DEFAULT_APP_SETTINGS.topAlert,
  }
}

const precondition = (document) => document
  ? document.updateTime ? { updateTime: document.updateTime } : { exists: true }
  : { exists: false }

// Compare every document read before committing. Competing resident bookings,
// scheduled runs and manager edits cannot leave half of a move applied.
const reserveVipBooking = async (booking, previous, rule) => {
  const ruleDoc = await getFirestoreDocument(VIP_RULES_COL, rule.id)
  const currentRule = ruleDoc ? decodeFirestoreDocument(ruleDoc) : null
  if (!currentRule?.isActive || ['studentId', 'machineId', 'weekday', 'startTime'].some((field) => currentRule[field] !== rule[field])) {
    throw new Error('VIP rule changed during sync. Retry with the saved rule.')
  }
  const ids = [...new Set([booking.id, ...previous.map((item) => item.id)])]
  const documents = new Map(await Promise.all(ids.map(async (id) => [id, await getFirestoreDocument(BOOKINGS_COL, id)])))
  const limitId = `${booking.studentId}_${booking.weekId}`
  const limitDoc = await getFirestoreDocument(BOOKING_LIMITS_COL, limitId)
  const currentLimit = limitDoc ? decodeFirestoreDocument(limitDoc) : null
  if (currentLimit?.bookingId && !documents.has(currentLimit.bookingId)) {
    documents.set(currentLimit.bookingId, await getFirestoreDocument(BOOKINGS_COL, currentLimit.bookingId))
  }

  const existing = [...documents.values()].filter(Boolean).map((document) => decodeFirestoreDocument(document))
    .filter((item) => item.id === booking.id || (item.studentId === booking.studentId && item.weekId === booking.weekId))
  const atSlot = existing.find((item) => item.id === booking.id)
  const removed = existing.filter((item) => item.id !== booking.id)
  const localNow = new Date(booking.createdAt + 3 * 60 * 60 * 1000).toISOString().slice(0, 16)
  if (removed.some((item) => item.studentId === booking.studentId && `${item.date}T${item.startTime}` <= localNow)) {
    throw new Error('The existing weekly booking has already started. Refresh before syncing.')
  }
  const ownerLimitIds = [...new Set(existing.filter((item) => item.studentId !== booking.studentId)
    .map((item) => `${item.studentId}_${item.weekId}`))]
  const ownerLimits = await Promise.all(ownerLimitIds.map(async (id) => [id, await getFirestoreDocument(BOOKING_LIMITS_COL, id)]))
  const matches = atSlot && ['studentId', 'machineId', 'date', 'startTime', 'endTime', 'weekId'].every((field) => atSlot[field] === booking[field])
    && currentLimit?.bookingId === booking.id && removed.length === 0
  if (matches) return { overridden: 0 }

  const writes = removed.map((item) => ({
    delete: getFirestoreDocumentName(BOOKINGS_COL, item.id),
    currentDocument: precondition(documents.get(item.id)),
  }))
  for (const [id, document] of ownerLimits) {
    if (document && existing.some((item) => item.id === decodeFirestoreDocument(document).bookingId)) {
      writes.push({ delete: getFirestoreDocumentName(BOOKING_LIMITS_COL, id), currentDocument: precondition(document) })
    }
  }
  writes.push({
    // Include the rule revision in the atomic commit so an older scheduled run
    // cannot restore a slot after a manager has saved a newer rule.
    update: encodeFirestoreDocument(VIP_RULES_COL, rule.id, { isActive: true }),
    updateMask: { fieldPaths: ['isActive'] },
    currentDocument: precondition(ruleDoc),
  }, {
    update: encodeFirestoreDocument(BOOKINGS_COL, booking.id, { ...booking, createdAt: atSlot?.studentId === booking.studentId ? atSlot.createdAt : booking.createdAt }),
    currentDocument: precondition(documents.get(booking.id)),
  }, {
    update: encodeFirestoreDocument(BOOKING_LIMITS_COL, limitId, { studentId: booking.studentId, weekId: booking.weekId, bookingId: booking.id }),
    currentDocument: precondition(limitDoc),
  })
  await commitFirestoreWrites(writes)
  return { overridden: removed.length + (atSlot && atSlot.studentId !== booking.studentId ? 1 : 0) }
}

export const applyVipRecurringForNextWeek = async ({ now = new Date(), source = 'unknown' } = {}) => {
  const settingsDoc = await getFirestoreDocument(SETTINGS_COL, SETTINGS_DOC_ID, SETTINGS_FIELDS)
  const settings = normalizeAppSettings(settingsDoc ? decodeFirestoreDocument(settingsDoc, false) : DEFAULT_APP_SETTINGS)
  const weeks = getVipWeeks(now)
  const emptyResult = { applied: false, source, nextWeekId: weeks[1].weekId, success: 0, skipped: 0, overridden: 0, failed: 0, blocked: 0 }
  if (settings.vipAutoEnabled === false) return { ...emptyResult, reason: 'disabled' }

  const [ruleDocs, studentDocs, machineDocs, bookingDocs] = await Promise.all([
    listFirestoreCollectionDocuments(VIP_RULES_COL, 200, VIP_RULE_FIELDS),
    listFirestoreCollectionDocuments(STUDENTS_COL, 400, STUDENT_FIELDS),
    listFirestoreCollectionDocuments(MACHINES_COL, 100, MACHINE_FIELDS),
    runFirestoreQueryDocuments({
      collectionId: BOOKINGS_COL, fieldPaths: BOOKING_FIELDS,
      filters: [{ fieldPath: 'weekId', op: 'IN', value: { arrayValue: { values: weeks.map((week) => ({ stringValue: week.weekId })) } } }],
    }),
  ])
  const rules = ruleDocs.map((document) => decodeFirestoreDocument(document))
  if (!rules.some((rule) => rule.isActive)) return { ...emptyResult, reason: 'no_active_rules' }

  const result = await reconcileVipBookings({
    now, settings, rules,
    students: studentDocs.map((document) => decodeFirestoreDocument(document)),
    machines: machineDocs.map((document) => decodeFirestoreDocument(document)),
    bookings: bookingDocs.map((document) => decodeFirestoreDocument(document)),
    reserve: reserveVipBooking,
  })
  if (result.applied && settings.vipLastAppliedWeekId !== result.nextWeekId) {
    await commitFirestoreWrites([{
      update: encodeFirestoreDocument(SETTINGS_COL, SETTINGS_DOC_ID, { vipLastAppliedWeekId: result.nextWeekId }),
      updateMask: { fieldPaths: ['vipLastAppliedWeekId'] },
    }])
  }
  return { ...result, source, reason: result.applied ? 'applied' : 'retry_pending' }
}
