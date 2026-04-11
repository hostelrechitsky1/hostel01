const FIRESTORE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
const FIRESTORE_API_KEY = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY

const FIRESTORE_BASE_URL = FIRESTORE_PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`
  : ''

const ensureFirestoreRestConfig = () => {
  if (!FIRESTORE_BASE_URL || !FIRESTORE_API_KEY) {
    throw new Error('Missing Firebase REST configuration')
  }
}

const withApiKey = (path) => {
  const separator = path.includes('?') ? '&' : '?'
  return `${FIRESTORE_BASE_URL}${path}${separator}key=${FIRESTORE_API_KEY}`
}

const fetchFirestoreJson = async (path, init, allowNotFound = false) => {
  ensureFirestoreRestConfig()

  const response = await fetch(withApiKey(path), init)
  if (allowNotFound && response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Firestore REST request failed with ${response.status}`)
  }

  return response.json()
}

export const decodeFirestoreValue = (value) => {
  if (!value) return undefined

  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('nullValue' in value) return null
  if ('timestampValue' in value) return value.timestampValue
  if ('referenceValue' in value) return value.referenceValue
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map((item) => decodeFirestoreValue(item))
  }
  if ('mapValue' in value) {
    const fields = value.mapValue.fields ?? {}
    return Object.fromEntries(
      Object.entries(fields).map(([fieldName, fieldValue]) => [fieldName, decodeFirestoreValue(fieldValue)])
    )
  }

  return undefined
}

export const decodeFirestoreDocument = (document, includeFallbackId = true) => {
  const decoded = Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([fieldName, fieldValue]) => [fieldName, decodeFirestoreValue(fieldValue)])
  )

  if (includeFallbackId && typeof decoded.id === 'undefined') {
    const fallbackId = document.name.split('/').pop()
    if (fallbackId) {
      decoded.id = fallbackId
    }
  }

  return decoded
}

export const listFirestoreCollectionDocuments = async (collectionId, pageSize = 100) => {
  const response = await fetchFirestoreJson(`/${collectionId}?pageSize=${pageSize}`)
  return response?.documents ?? []
}

export const getFirestoreDocument = async (collectionId, documentId) => {
  return fetchFirestoreJson(`/${collectionId}/${documentId}`, undefined, true)
}

export const runFirestoreQueryDocuments = async ({
  collectionId,
  filters = [],
  limit,
}) => {
  const where = filters.length === 0
    ? undefined
    : filters.length === 1
      ? {
          fieldFilter: {
            field: { fieldPath: filters[0].fieldPath },
            op: filters[0].op,
            value: filters[0].value,
          },
        }
      : {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((filter) => ({
              fieldFilter: {
                field: { fieldPath: filter.fieldPath },
                op: filter.op,
                value: filter.value,
              },
            })),
          },
        }

  const response = await fetchFirestoreJson(':runQuery', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        ...(where ? { where } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    }),
  })

  return (response ?? []).flatMap((result) => (result.document ? [result.document] : []))
}

export const jsonResponse = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  },
  body: JSON.stringify(body),
})
