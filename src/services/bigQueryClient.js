const BIGQUERY_API_BASE_URL = 'https://bigquery.googleapis.com/bigquery/v2'
const BYTES_PER_TEBIBYTE = 1024 ** 4
const BIGQUERY_ON_DEMAND_PRICE_PER_TIB = 5

function buildQueryString(params) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null && item !== '') searchParams.append(key, item)
      })
      return
    }

    searchParams.set(key, String(value))
  })

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

async function fetchBigQueryJson(path, accessToken, params = {}) {
  const response = await fetch(`${BIGQUERY_API_BASE_URL}${path}${buildQueryString(params)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    let errorMessage = `BigQuery retornou ${response.status}`
    try {
      const payload = await response.json()
      errorMessage = payload?.error?.message || errorMessage
    } catch {
      // Ignore JSON parse errors and keep the generic message.
    }

    throw new Error(errorMessage)
  }

  return response.json()
}

function parseScalarBigQueryValue(type, value) {
  if (value == null) return null

  if (type === 'BOOL' || type === 'BOOLEAN') return value === 'true'
  return value
}

function parseBigQueryCell(field, rawValue) {
  if (rawValue == null) return null

  if (field.mode === 'REPEATED') {
    const values = Array.isArray(rawValue) ? rawValue : []
    return values.map((item) => parseBigQueryCell({ ...field, mode: 'NULLABLE' }, item?.v ?? item))
  }

  if (field.type === 'RECORD' || field.type === 'STRUCT') {
    const values = rawValue?.f ?? []
    const result = {}
    ;(field.fields || []).forEach((nestedField, index) => {
      result[nestedField.name] = parseBigQueryCell(nestedField, values[index]?.v)
    })
    return result
  }

  return parseScalarBigQueryValue(field.type, rawValue)
}

export function convertBigQueryRows(schemaFields = [], rows = []) {
  return rows.map((row) => {
    const converted = {}
    schemaFields.forEach((field, index) => {
      converted[field.name] = parseBigQueryCell(field, row?.f?.[index]?.v)
    })
    return converted
  })
}

export function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const scaled = value / (1024 ** unitIndex)
  const precision = scaled >= 100 || unitIndex === 0 ? 0 : scaled >= 10 ? 1 : 2
  return `${scaled.toFixed(precision)} ${units[unitIndex]}`
}

export function estimateBigQueryQueryCost(bytesProcessed, cacheHit = false) {
  const value = Number(bytesProcessed)
  if (cacheHit || !Number.isFinite(value) || value <= 0) return 0
  return (value / BYTES_PER_TEBIBYTE) * BIGQUERY_ON_DEMAND_PRICE_PER_TIB
}

export function estimateDownloadSizeFromSample(rows, totalRows) {
  const total = Number(totalRows)
  if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(total) || total <= 0) return null

  const bytes = rows.reduce((sum, row) => sum + new Blob([JSON.stringify(row)]).size, 0)
  return Math.round((bytes / rows.length) * total)
}

export async function listBigQueryJobs(accessToken, projectId, options = {}) {
  const response = await fetchBigQueryJson(`/projects/${projectId}/jobs`, accessToken, {
    projection: 'full',
    stateFilter: ['DONE'],
    allUsers: false,
    maxResults: 20,
    ...options,
  })

  return (response.jobs || []).filter((job) => job?.configuration?.query)
}

export async function getBigQueryJob(accessToken, projectId, jobId, location) {
  return fetchBigQueryJson(`/projects/${projectId}/jobs/${jobId}`, accessToken, { location })
}

export async function getBigQueryQueryResultsPage(accessToken, projectId, jobId, options = {}) {
  return fetchBigQueryJson(`/projects/${projectId}/queries/${jobId}`, accessToken, options)
}
