const ALLOWED_HOSTS = [
  'drive.google.com',
  'lh3.googleusercontent.com',
  'googleusercontent.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]

const BANNER_WIDTH_STEPS = [180, 240, 360, 480, 640, 720, 840, 960, 1280, 1600, 1920]

const getDriveFileId = (source) => {
  try {
    const url = new URL(source)
    const idFromQuery = url.searchParams.get('id')
    if (idFromQuery) return idFromQuery

    const fileMatch = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (fileMatch?.[1]) return fileMatch[1]

    const thumbnailMatch = url.pathname.includes('/thumbnail') ? url.searchParams.get('id') : null
    if (thumbnailMatch) return thumbnailMatch

    return null
  } catch {
    const idMatch = source.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/)
    return idMatch?.[1] ?? null
  }
}

const buildDriveThumbnailUrl = (fileId, width = 1920) => {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`
}

const roundBannerWidth = (requestedWidth) => {
  return BANNER_WIDTH_STEPS.find((step) => step >= requestedWidth) ?? BANNER_WIDTH_STEPS[BANNER_WIDTH_STEPS.length - 1]
}

const isAllowedHost = (hostname) => (
  ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
)

const normalizeSource = (source, width) => {
  const trimmedSource = source.trim()
  if (!trimmedSource) {
    throw new Error('Missing source')
  }

  const fileId = getDriveFileId(trimmedSource)
  if (fileId) {
    return buildDriveThumbnailUrl(fileId, roundBannerWidth(width || 960))
  }

  return trimmedSource
}

export const handler = async (event) => {
  try {
    const source = event.queryStringParameters?.src
    const requestedWidth = Number(event.queryStringParameters?.w || 0)
    const normalizedSource = normalizeSource(source, Number.isFinite(requestedWidth) ? requestedWidth : 0)
    const sourceUrl = new URL(normalizedSource)

    if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
      return {
        statusCode: 400,
        body: 'Only http(s) sources are supported',
      }
    }

    if (!isAllowedHost(sourceUrl.hostname)) {
      return {
        statusCode: 403,
        body: 'Source host is not allowed',
      }
    }

    const response = await fetch(sourceUrl.toString(), {
      headers: {
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        'User-Agent': 'HostelOne Banner Proxy',
      },
    })

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: 'Unable to fetch banner image',
      }
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const upstreamLength = response.headers.get('content-length')
    const bodyBuffer = Buffer.from(await response.arrayBuffer())

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
        Vary: 'Accept',
        ...(upstreamLength ? { 'Content-Length': upstreamLength } : {}),
      },
      body: bodyBuffer.toString('base64'),
    }
  } catch (error) {
    console.error('banner-asset failed', error)
    return {
      statusCode: 500,
      body: 'Unable to proxy banner image',
    }
  }
}
