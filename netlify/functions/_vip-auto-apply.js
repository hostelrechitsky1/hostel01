import {
  commitFirestoreWrites,
  decodeFirestoreDocument,
  encodeFirestoreDocument,
  getFirestoreDocument,
  getFirestoreDocumentName,
  listFirestoreCollectionDocuments,
  runFirestoreQueryDocuments,
} from './_resident-firestore.js'

const BELARUS_UTC_OFFSET_HOURS = 3
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
  autoOpenDurationHours: 28,
  vipAutoEnabled: true,
  vipLastAppliedWeekId: '',
  topAlert: { message: '', isActive: false, type: 'info' },
}

const normalizeAppSettings = (settings) => {
  const data = settings ?? {}

  return {
    ...DEFAULT_APP_SETTINGS,
    ...data,
    maintenanceDay: typeof data.maintenanceDay !== 'undefined' ? Number(data.maintenanceDay) : DEFAULT_APP_SETTINGS.maintenanceDay,
    autoOpenWeekday: typeof data.autoOpenWeekday !== 'undefined' ? Number(data.autoOpenWeekday) : DEFAULT_APP_SETTINGS.autoOpenWeekday,
    autoOpenDurationHours: typeof data.autoOpenDurationHours !== 'undefined' ? Number(data.autoOpenDurationHours) : DEFAULT_APP_SETTINGS.autoOpenDurationHours,
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

const getBelarusNow = (now = new Date()) => new Date(now.getTime() + BELARUS_UTC_OFFSET_HOURS * 60 * 60 * 1000)

const getBelarusDate = (now = new Date()) => {
  const belarusNow = getBelarusNow(now)
  return new Date(Date.UTC(belarusNow.getUTCFullYear(), belarusNow.getUTCMonth(), belarusNow.getUTCDate()))
}

const addBelarusDays = (date, days) => (
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
)

const getBelarusWeekStart = (date) => {
  const weekday = date.getUTCDay()
  const diffToMonday = weekday === 0 ? 6 : weekday - 1
  return addBelarusDays(date, -diffToMonday)
}

const getBelarusWeekId = (date) => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${utcDate.getUTCFullYear()}-W${weekNumber}`
}

const formatBelarusDate = (date) => date.toISOString().slice(0, 10)

const addMinutesToTimeString = (timeString, minutesToAdd) => {
  const [hours, minutes] = timeString.split(':').map(Number)
  const totalMinutes = ((hours || 0) * 60) + (minutes || 0) + minutesToAdd
  const nextHours = Math.floor(totalMinutes / 60)
  const nextMinutes = totalMinutes % 60
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`
}

const getTargetWeekContext = (now = new Date()) => {
  const currentWeekStart = getBelarusWeekStart(getBelarusDate(now))
  const nextWeekStart = addBelarusDays(currentWeekStart, 7)
  const nextWeekId = getBelarusWeekId(nextWeekStart)
  return { nextWeekStart, nextWeekId }
}

const removeWorkingBooking = (workingBookings, bookingId) => (
  workingBookings.filter((booking) => booking.id !== bookingId)
)

const findBookingLimitId = (booking) => `${booking.studentId}_${booking.weekId}`

const inspectCurrentSlotOwner = async (slotId) => {
  try {
    const slotDoc = await getFirestoreDocument(BOOKINGS_COL, slotId, BOOKING_FIELDS)
    return slotDoc ? decodeFirestoreDocument(slotDoc) : null
  } catch (error) {
    console.error('VIP auto-apply slot inspection failed', error)
    return null
  }
}

export const applyVipRecurringForNextWeek = async ({ now = new Date(), source = 'unknown' } = {}) => {
  const settingsDoc = await getFirestoreDocument(SETTINGS_COL, SETTINGS_DOC_ID, SETTINGS_FIELDS)
  const rawSettings = settingsDoc ? decodeFirestoreDocument(settingsDoc, false) : DEFAULT_APP_SETTINGS
  const settings = normalizeAppSettings(rawSettings)
  const { nextWeekStart, nextWeekId } = getTargetWeekContext(now)

  if (settings.vipAutoEnabled === false) {
    return { applied: false, reason: 'disabled', source, nextWeekId, success: 0, skipped: 0, overridden: 0, failed: 0, blocked: 0 }
  }

  if (settings.vipLastAppliedWeekId === nextWeekId) {
    return { applied: false, reason: 'already_applied', source, nextWeekId, success: 0, skipped: 0, overridden: 0, failed: 0, blocked: 0 }
  }

  const [ruleDocs, studentDocs, machineDocs, bookingDocs] = await Promise.all([
    listFirestoreCollectionDocuments(VIP_RULES_COL, 200, VIP_RULE_FIELDS),
    listFirestoreCollectionDocuments(STUDENTS_COL, 400, STUDENT_FIELDS),
    listFirestoreCollectionDocuments(MACHINES_COL, 100, MACHINE_FIELDS),
    runFirestoreQueryDocuments({
      collectionId: BOOKINGS_COL,
      fieldPaths: BOOKING_FIELDS,
      filters: [{
        fieldPath: 'weekId',
        op: 'EQUAL',
        value: { stringValue: nextWeekId },
      }],
    }),
  ])

  const activeRules = ruleDocs
    .map((ruleDoc) => decodeFirestoreDocument(ruleDoc))
    .filter((rule) => rule.isActive)

  if (activeRules.length === 0) {
    return { applied: false, reason: 'no_active_rules', source, nextWeekId, success: 0, skipped: 0, overridden: 0, failed: 0, blocked: 0 }
  }

  const studentsById = new Map(studentDocs.map((studentDoc) => {
    const student = decodeFirestoreDocument(studentDoc)
    return [student.id, student]
  }))
  const machinesById = new Map(machineDocs.map((machineDoc) => {
    const machine = decodeFirestoreDocument(machineDoc)
    return [machine.id, machine]
  }))
  let workingBookings = bookingDocs.map((bookingDoc) => decodeFirestoreDocument(bookingDoc))

  let success = 0
  let skipped = 0
  let overridden = 0
  let failed = 0
  let blocked = 0

  for (const rule of activeRules) {
    const student = studentsById.get(rule.studentId)
    const machine = machinesById.get(rule.machineId)

    if (!student || !machine) {
      blocked += 1
      continue
    }

    if (machine.status === 'maintenance') {
      skipped += 1
      continue
    }

    if (rule.weekday === (settings.maintenanceDay ?? 3)) {
      skipped += 1
      continue
    }

    const dayOffset = rule.weekday === 0 ? 6 : rule.weekday - 1
    const targetDate = addBelarusDays(nextWeekStart, dayOffset)
    const targetDateStr = formatBelarusDate(targetDate)
    const slotId = `${targetDateStr}_${rule.machineId}_${rule.startTime.replace(':', '-')}`
    const limitId = `${student.id}_${nextWeekId}`
    const bookingPayload = {
      id: slotId,
      machineId: rule.machineId,
      studentId: student.id,
      studentName: student.name,
      roomNumber: student.roomNumber,
      date: targetDateStr,
      startTime: rule.startTime,
      endTime: addMinutesToTimeString(rule.startTime, 90),
      weekId: nextWeekId,
      createdAt: Date.now(),
    }

    const existingAtSlot = workingBookings.find((booking) => booking.id === slotId)
    if (existingAtSlot?.studentId === student.id) {
      success += 1
      continue
    }

    const writes = []

    if (existingAtSlot && existingAtSlot.studentId !== student.id) {
      writes.push({
        delete: getFirestoreDocumentName(BOOKINGS_COL, existingAtSlot.id),
      })
      writes.push({
        delete: getFirestoreDocumentName(BOOKING_LIMITS_COL, findBookingLimitId(existingAtSlot)),
      })
      workingBookings = removeWorkingBooking(workingBookings, existingAtSlot.id)
      overridden += 1
    }

    const existingStudentBooking = workingBookings.find((booking) => (
      booking.studentId === student.id
      && booking.weekId === nextWeekId
      && booking.id !== slotId
    ))

    if (existingStudentBooking) {
      writes.push({
        delete: getFirestoreDocumentName(BOOKINGS_COL, existingStudentBooking.id),
      })
      writes.push({
        delete: getFirestoreDocumentName(BOOKING_LIMITS_COL, findBookingLimitId(existingStudentBooking)),
      })
      workingBookings = removeWorkingBooking(workingBookings, existingStudentBooking.id)
      overridden += 1
    }

    writes.push({
      update: encodeFirestoreDocument(BOOKINGS_COL, slotId, bookingPayload),
      currentDocument: { exists: false },
    })
    writes.push({
      update: encodeFirestoreDocument(BOOKING_LIMITS_COL, limitId, {
        studentId: student.id,
        weekId: nextWeekId,
        bookingId: slotId,
      }),
      currentDocument: { exists: false },
    })

    try {
      await commitFirestoreWrites(writes)
      success += 1
      workingBookings.push(bookingPayload)
    } catch (error) {
      console.error('VIP auto-apply write failed', { source, nextWeekId, slotId, studentId: student.id, error })
      const currentSlot = await inspectCurrentSlotOwner(slotId)
      if (currentSlot?.studentId === student.id) {
        success += 1
        if (!workingBookings.some((booking) => booking.id === slotId)) {
          workingBookings.push(currentSlot)
        }
        continue
      }

      failed += 1
    }
  }

  const shouldMarkApplied = failed === 0 && blocked === 0

  if (shouldMarkApplied) {
    const nextSettings = {
      ...settings,
      vipLastAppliedWeekId: nextWeekId,
    }

    await commitFirestoreWrites([
      {
        update: encodeFirestoreDocument(SETTINGS_COL, SETTINGS_DOC_ID, nextSettings),
      },
    ])
  }

  return {
    applied: shouldMarkApplied,
    reason: shouldMarkApplied ? 'applied' : 'retry_pending',
    source,
    nextWeekId,
    success,
    skipped,
    overridden,
    failed,
    blocked,
  }
}
