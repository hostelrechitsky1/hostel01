const DAY_MS = 86400000
const BELARUS_OFFSET_MS = 3 * 60 * 60 * 1000

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS)
const dateString = (date) => date.toISOString().slice(0, 10)
const weekId = (date) => {
  const thursday = addDays(date, 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  return `${thursday.getUTCFullYear()}-W${Math.ceil(((thursday - yearStart) / DAY_MS + 1) / 7)}`
}

export const getVipWeeks = (now = new Date()) => {
  const localNow = new Date(now.getTime() + BELARUS_OFFSET_MS)
  const today = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()))
  const monday = addDays(today, 1 - (today.getUTCDay() || 7))
  return [monday, addDays(monday, 7)].map((start) => ({
    start: dateString(start),
    end: dateString(addDays(start, 6)),
    weekId: weekId(start),
  }))
}

export const getVipRuleDate = (rule, week) => (
  dateString(addDays(new Date(`${week.start}T00:00:00Z`), (rule.weekday + 6) % 7))
)

export const getVipSlotId = (rule, date) => `${date}_${rule.machineId}_${rule.startTime.replace(':', '-')}`

export const getVipRuleProblem = (rule, rules, settings) => {
  if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) return 'Invalid weekday'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.startTime)) return 'Invalid slot time'
  const duration = settings.slotDurationMinutes
  const [hours, minutes] = rule.startTime.split(':').map(Number)
  const start = hours * 60 + minutes
  if (!Number.isFinite(duration) || duration < 30 || start < 540 || start + duration > 1350 || (start - 540) % duration !== 0) {
    return 'Time does not match the current slot schedule; edit this rule'
  }
  if (rule.weekday === settings.maintenanceDay) return 'Day is closed for maintenance'
  if (rules.some((other) => other.id !== rule.id && other.isActive && (
    other.studentId === rule.studentId
    || (other.machineId === rule.machineId && other.weekday === rule.weekday && other.startTime === rule.startTime)
  ))) return 'Conflicting active VIP rules; edit or pause one rule'
  return null
}

// Reconcile actual future reservations. The last-applied marker is only a report:
// it cannot prove that edited rules or deleted bookings are still satisfied.
export const reconcileVipBookings = async ({ now = new Date(), settings, rules, students, machines, bookings, reserve }) => {
  const weeks = getVipWeeks(now)
  const result = { applied: false, nextWeekId: weeks[1].weekId, success: 0, skipped: 0, overridden: 0, failed: 0, blocked: 0 }
  const activeRules = rules.filter((rule) => rule.isActive)
  const studentsById = new Map(students.map((student) => [student.id, student]))
  const machinesById = new Map(machines.map((machine) => [machine.id, machine]))
  let workingBookings = [...bookings]
  const localNow = new Date(now.getTime() + BELARUS_OFFSET_MS).toISOString().slice(0, 16)

  for (const rule of activeRules) {
    const student = studentsById.get(rule.studentId)
    const machine = machinesById.get(rule.machineId)
    if (!student || !machine || machine.status === 'maintenance' || getVipRuleProblem(rule, activeRules, settings)) {
      result.blocked += 1
      continue
    }

    for (const week of weeks) {
      const date = getVipRuleDate(rule, week)
      if (`${date}T${rule.startTime}` <= localNow) {
        result.skipped += 1
        continue
      }
      const startMinutes = Number(rule.startTime.slice(0, 2)) * 60 + Number(rule.startTime.slice(3))
      const endMinutes = startMinutes + settings.slotDurationMinutes
      const booking = {
        id: getVipSlotId(rule, date), machineId: machine.id, studentId: student.id,
        studentName: student.name, roomNumber: student.roomNumber, date,
        startTime: rule.startTime,
        endTime: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`,
        weekId: week.weekId, createdAt: now.getTime(),
      }
      const previous = workingBookings.filter((existing) => (
        existing.id === booking.id || (existing.studentId === student.id && existing.weekId === week.weekId)
      ))
      // Do not move a reservation which has already started or finished.
      if (previous.some((existing) => existing.studentId === student.id && `${existing.date}T${existing.startTime}` <= localNow)) {
        result.skipped += 1
        continue
      }
      try {
        const outcome = await reserve(booking, previous, rule)
        result.success += 1
        result.overridden += outcome.overridden
        workingBookings = workingBookings.filter((existing) => !previous.some((old) => old.id === existing.id))
        workingBookings.push(booking)
      } catch (error) {
        result.failed += 1
        console.error('VIP reservation failed', { ruleId: rule.id, slotId: booking.id, error })
      }
    }
  }
  result.applied = activeRules.length > 0 && result.failed === 0 && result.blocked === 0
  return result
}
