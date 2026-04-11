const FIRESTORE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
const FIRESTORE_API_KEY = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY

const FIRESTORE_BASE_URL = FIRESTORE_PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`
  : ''
const FIRESTORE_DATABASE = FIRESTORE_PROJECT_ID
  ? `projects/${FIRESTORE_PROJECT_ID}/databases/(default)`
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

export const getFirestoreDocumentName = (collectionId, documentId) => {
  ensureFirestoreRestConfig()
  return `${FIRESTORE_DATABASE}/documents/${collectionId}/${documentId}`
}

export const encodeFirestoreValue = (value) => {
  if (value === null) {
    return { nullValue: null }
  }

  if (typeof value === 'string') {
    return { stringValue: value }
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value }
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) }
    }

    return { doubleValue: value }
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)),
      },
    }
  }

  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, fieldValue]) => typeof fieldValue !== 'undefined')
            .map(([fieldName, fieldValue]) => [fieldName, encodeFirestoreValue(fieldValue)])
        ),
      },
    }
  }

  return { stringValue: String(value) }
}

export const encodeFirestoreDocument = (collectionId, documentId, data) => ({
  name: getFirestoreDocumentName(collectionId, documentId),
  fields: Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => typeof value !== 'undefined')
      .map(([fieldName, value]) => [fieldName, encodeFirestoreValue(value)])
  ),
})

export const commitFirestoreWrites = async (writes) => {
  return fetchFirestoreJson(':commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes,
    }),
  })
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

const appendFieldMaskParams = (params, fieldPaths = []) => {
  fieldPaths
    .filter(Boolean)
    .forEach((fieldPath) => {
      params.append('mask.fieldPaths', fieldPath)
    })
}

export const listFirestoreCollectionDocuments = async (collectionId, pageSize = 100, fieldPaths = []) => {
  const params = new URLSearchParams({
    pageSize: String(pageSize),
  })
  appendFieldMaskParams(params, fieldPaths)
  const response = await fetchFirestoreJson(`/${collectionId}?${params.toString()}`)
  return response?.documents ?? []
}

export const getFirestoreDocument = async (collectionId, documentId, fieldPaths = []) => {
  const params = new URLSearchParams()
  appendFieldMaskParams(params, fieldPaths)
  const maskQuery = params.toString()
  return fetchFirestoreJson(`/${collectionId}/${documentId}${maskQuery ? `?${maskQuery}` : ''}`, undefined, true)
}

export const runFirestoreQueryDocuments = async ({
  collectionId,
  filters = [],
  limit,
  fieldPaths = [],
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
        ...(fieldPaths.length > 0
          ? {
              select: {
                fields: fieldPaths.map((fieldPath) => ({ fieldPath })),
              },
            }
          : {}),
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
