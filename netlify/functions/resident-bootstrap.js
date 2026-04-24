import {
  decodeFirestoreDocument,
  getFirestoreDocument,
  jsonResponse,
  listFirestoreCollectionDocuments,
  runFirestoreQueryDocuments,
} from './_resident-firestore.js'
import { applyVipRecurringForNextWeek } from './_vip-auto-apply.js'

const SETTINGS_COL = 'settings'
const SETTINGS_DOC_ID = 'config'
const MACHINES_COL = 'machines'
const BOOKINGS_COL = 'bookings'
const BANNERS_COL = 'banners'
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
const BANNER_FIELDS = [
  'id',
  'title',
  'imageUrl',
  'previewImageUrl',
  'optimizedImageUrl',
  'mobileImageUrl',
  'desktopImageUrl',
  'responsiveSrcSet',
  'responsiveSizes',
  'linkUrl',
  'isActive',
  'createdAt',
  'priority',
  'type',
  'message',
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

const DEFAULT_MACHINES = [
  { id: '1', name: 'Machine 1', status: 'available' },
  { id: '2', name: 'Machine 2', status: 'available' },
  { id: '3', name: 'Machine 3', status: 'available' },
  { id: '4', name: 'Machine 4', status: 'available' },
]

const normalizeWeekIds = (weekIds) => Array.from(new Set(
  weekIds
    .map((weekId) => weekId.trim())
    .filter(Boolean)
)).sort()

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

const sortMachines = (machines) => [...machines].sort((left, right) => left.id.localeCompare(right.id))

const sortBookingsChronologically = (bookings) => {
  return [...bookings].sort((left, right) => {
    const leftKey = `${left.date}T${left.startTime}`
    const rightKey = `${right.date}T${right.startTime}`
    return leftKey.localeCompare(rightKey)
  })
}

const sortStudentBookingsByRecent = (bookings, limitCount = 12) => {
  const sorted = [...bookings].sort((left, right) => right.createdAt - left.createdAt)
  return sorted.slice(0, limitCount)
}

const sortBanners = (banners) => (
  [...banners].sort((left, right) => (left.priority || 99) - (right.priority || 99))
)

const parseBooleanFlag = (value) => value === '1' || value === 'true'

export const handler = async (event) => {
  try {
    const query = event.queryStringParameters ?? {}
    const weekIds = normalizeWeekIds((query.weeks ?? '').split(','))
    const studentId = query.studentId?.trim()
    const includeBanners = parseBooleanFlag(query.includeBanners ?? query.banners)
    const includeRecentBookings = parseBooleanFlag(query.includeRecentBookings ?? query.recent)

    if (weekIds.length === 0) {
      return jsonResponse(400, { error: 'Missing week ids' })
    }

    await applyVipRecurringForNextWeek({ source: 'resident-bootstrap' }).catch((error) => {
      console.error('resident-bootstrap VIP auto-apply failed', error)
      return null
    })

    const [settingsDoc, machineDocs, bookingDocs, bannerDocs, recentBookingDocs] = await Promise.all([
      getFirestoreDocument(SETTINGS_COL, SETTINGS_DOC_ID, SETTINGS_FIELDS),
      listFirestoreCollectionDocuments(MACHINES_COL, 100, MACHINE_FIELDS),
      runFirestoreQueryDocuments({
        collectionId: BOOKINGS_COL,
        fieldPaths: BOOKING_FIELDS,
        filters: [{
          fieldPath: 'weekId',
          op: 'IN',
          value: {
            arrayValue: {
              values: weekIds.map((weekId) => ({ stringValue: weekId })),
            },
          },
        }],
      }),
      includeBanners ? listFirestoreCollectionDocuments(BANNERS_COL, 100, BANNER_FIELDS) : Promise.resolve([]),
      includeRecentBookings && studentId
        ? runFirestoreQueryDocuments({
            collectionId: BOOKINGS_COL,
            fieldPaths: BOOKING_FIELDS,
            filters: [{
              fieldPath: 'studentId',
              op: 'EQUAL',
              value: { stringValue: studentId },
            }],
          })
        : Promise.resolve([]),
    ])

    const payload = {
      settings: settingsDoc
        ? normalizeAppSettings(decodeFirestoreDocument(settingsDoc, false))
        : DEFAULT_APP_SETTINGS,
      machines: machineDocs.length > 0
        ? sortMachines(machineDocs.map((document) => decodeFirestoreDocument(document)))
        : DEFAULT_MACHINES,
      weekBookings: sortBookingsChronologically(
        bookingDocs.map((document) => decodeFirestoreDocument(document))
      ),
      ...(includeBanners
        ? {
            banners: sortBanners(
              bannerDocs.map((document) => decodeFirestoreDocument(document))
            ),
          }
        : {}),
      ...(includeRecentBookings && studentId
        ? {
            recentBookings: sortStudentBookingsByRecent(
              recentBookingDocs.map((document) => decodeFirestoreDocument(document)),
              12
            ),
          }
        : {}),
    }

    return jsonResponse(200, payload, {
      'Cache-Control': 'public, max-age=20, stale-while-revalidate=180',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    })
  } catch (error) {
    console.error('resident-bootstrap failed', error)
    return jsonResponse(500, {
      error: 'Failed to load resident bootstrap payload',
    })
  }
}
