const FIRESTORE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const FIRESTORE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;
const FIRESTORE_BASE_URL = FIRESTORE_PROJECT_ID
    ? `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`
    : '';

export type FirestoreRestValue =
    | { stringValue: string }
    | { integerValue: string }
    | { doubleValue: number }
    | { booleanValue: boolean }
    | { nullValue: null }
    | { timestampValue: string }
    | { referenceValue: string }
    | { arrayValue: { values?: FirestoreRestValue[] } }
    | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

export type FirestoreRestDocument = {
    name: string;
    fields?: Record<string, FirestoreRestValue>;
};

type FirestoreRunQueryResult = {
    document?: FirestoreRestDocument;
};

type FirestoreFieldFilter = {
    fieldPath: string;
    op: 'EQUAL' | 'IN';
    value: FirestoreRestValue;
};

const appendFieldMaskParams = (params: URLSearchParams, fieldPaths: string[] = []) => {
    fieldPaths
        .filter(Boolean)
        .forEach((fieldPath) => {
            params.append('mask.fieldPaths', fieldPath);
        });
};

const ensureFirestoreRestConfig = () => {
    if (!FIRESTORE_BASE_URL || !FIRESTORE_API_KEY) {
        throw new Error('Missing Firebase REST configuration');
    }
};

const withApiKey = (path: string) => {
    const separator = path.includes('?') ? '&' : '?';
    return `${FIRESTORE_BASE_URL}${path}${separator}key=${FIRESTORE_API_KEY}`;
};

const fetchFirestoreJson = async <T>(path: string, init?: RequestInit, allowNotFound = false): Promise<T | null> => {
    ensureFirestoreRestConfig();

    const response = await fetch(withApiKey(path), init);
    if (allowNotFound && response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Firestore REST request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
};

export const decodeFirestoreValue = (value?: FirestoreRestValue): unknown => {
    if (!value) return undefined;

    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return value.timestampValue;
    if ('referenceValue' in value) return value.referenceValue;
    if ('arrayValue' in value) {
        return (value.arrayValue.values ?? []).map((item) => decodeFirestoreValue(item));
    }
    if ('mapValue' in value) {
        const fields = value.mapValue.fields ?? {};
        return Object.fromEntries(
            Object.entries(fields).map(([fieldName, fieldValue]) => [fieldName, decodeFirestoreValue(fieldValue)])
        );
    }

    return undefined;
};

export const decodeFirestoreDocument = <T>(document: FirestoreRestDocument, includeFallbackId = true): T => {
    const decoded = Object.fromEntries(
        Object.entries(document.fields ?? {}).map(([fieldName, fieldValue]) => [fieldName, decodeFirestoreValue(fieldValue)])
    ) as Record<string, unknown>;

    if (includeFallbackId && typeof decoded.id === 'undefined') {
        const fallbackId = document.name.split('/').pop();
        if (fallbackId) {
            decoded.id = fallbackId;
        }
    }

    return decoded as T;
};

export const listFirestoreCollectionDocuments = async (collectionId: string, pageSize = 100, fieldPaths: string[] = []) => {
    const params = new URLSearchParams({
        pageSize: String(pageSize),
    });
    appendFieldMaskParams(params, fieldPaths);

    const response = await fetchFirestoreJson<{ documents?: FirestoreRestDocument[] }>(
        `/${collectionId}?${params.toString()}`
    );

    return response?.documents ?? [];
};

export const getFirestoreDocument = async (collectionId: string, documentId: string, fieldPaths: string[] = []) => {
    const params = new URLSearchParams();
    appendFieldMaskParams(params, fieldPaths);
    const maskQuery = params.toString();

    return fetchFirestoreJson<FirestoreRestDocument>(
        `/${collectionId}/${documentId}${maskQuery ? `?${maskQuery}` : ''}`,
        undefined,
        true
    );
};

export const runFirestoreQueryDocuments = async ({
    collectionId,
    filters = [],
    limit,
    fieldPaths = [],
}: {
    collectionId: string;
    filters?: FirestoreFieldFilter[];
    limit?: number;
    fieldPaths?: string[];
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
            };

    const response = await fetchFirestoreJson<FirestoreRunQueryResult[]>(
        ':runQuery',
        {
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
        }
    );

    return (response ?? []).flatMap((result) => result.document ? [result.document] : []);
};
