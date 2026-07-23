/** Parse any timestamp format into milliseconds */
export function parseTimestamp(ts) {
  if (ts == null || ts === '') return 0
  const num = Number(ts)
  if (!isNaN(num) && num > 0) {
    if (num > 1e15) return Math.round(num / 1000) // microseconds → ms
    if (num > 1e12) return num                     // milliseconds
    return num * 1000                              // seconds → ms
  }
  const d = new Date(ts)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

/** Format any timestamp as human-readable ISO string */
export function formatTimestamp(ts) {
  if (ts == null || ts === '') return '–'
  const ms = parseTimestamp(ts)
  if (!ms) return String(ts)
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', ' UTC')
}

/** Apply column mapping { expectedCol: csvCol } to an array of rows */
export function applyMapping(rows, mapping) {
  if (!mapping || Object.keys(mapping).length === 0) return rows
  return rows.map((row) => {
    const out = { ...row }
    for (const [expected, csvCol] of Object.entries(mapping)) {
      if (csvCol && csvCol !== '' && row[csvCol] !== undefined) {
        out[expected] = row[csvCol]
      }
    }
    return out
  })
}

export const BIGQUERY_REQUIRED_HEADERS = [
  'event_name',
  'event_params',
  'user_id',
  'user_properties',
]

export function isBigQueryExportHeaders(headers = []) {
  const available = new Set(headers.map((header) => String(header).trim()))
  return BIGQUERY_REQUIRED_HEADERS.every((header) => available.has(header))
}

function firstFilled(...values) {
  return values.find((value) => value != null && String(value).trim() !== '')
}

function extractBigQueryValue(value) {
  if (value == null) return undefined
  if (typeof value !== 'object') return value

  return firstFilled(
    value.string_value,
    value.int_value,
    value.float_value,
    value.double_value,
  )
}

function parseJsonCell(rawValue, fieldName, rowIndex) {
  if (rawValue == null || String(rawValue).trim() === '') return null

  const baseValue = String(rawValue).trim()
  const candidates = [baseValue]
  if (baseValue.includes('""')) {
    candidates.push(baseValue.replace(/""/g, '"'))
  }
  if (baseValue.startsWith('"') && baseValue.endsWith('"')) {
    candidates.push(baseValue.slice(1, -1).replace(/""/g, '"'))
  }

  let lastError = null
  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate)
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`linha ${rowIndex + 2}: campo ${fieldName} com JSON inválido`)
}

function flattenBigQueryField(rawValue, fieldName, rowIndex) {
  const parsed = parseJsonCell(rawValue, fieldName, rowIndex)
  if (!parsed) return {}

  const entries = Array.isArray(parsed) ? parsed : parsed[fieldName]
  if (!Array.isArray(entries)) return {}

  const flattened = {}
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string') continue

    const value = extractBigQueryValue(entry.value)
    if (value != null && String(value).trim() !== '') {
      flattened[entry.key] = value
    }
  }

  return flattened
}

export function normalizeBigQueryRows(rows) {
  return rows
    .filter((row) => row && Object.values(row).some((value) => String(value ?? '').trim() !== ''))
    .map((row, rowIndex) => {
      const eventFields = flattenBigQueryField(row.event_params, 'event_params', rowIndex)
      const userFields = flattenBigQueryField(row.user_properties, 'user_properties', rowIndex)
      const mergedFields = { ...userFields, ...eventFields }

      return {
        ...mergedFields,
        event_name: firstFilled(row.event_name, mergedFields.event_name),
        sdk_version: firstFilled(mergedFields.sdk_version),
        miniapp: firstFilled(mergedFields.miniapp),
        miniapp_version: firstFilled(mergedFields.miniapp_version),
        app_version: firstFilled(mergedFields.app_version),
        app_screen: mergedFields.app_screen,
        app_screen_referrer: firstFilled(mergedFields.app_screen_referrer),
        firebase_screen: firstFilled(
          mergedFields.firebase_screen,
          mergedFields.firebase_screen_class,
        ),
        app_timestamp: firstFilled(
          mergedFields.app_timestamp,
          mergedFields.event_timestamp,
          mergedFields.timestamp,
        ),
        journey: firstFilled(mergedFields.journey),
        user_id: firstFilled(row.user_id, mergedFields.user_id),
        session_id: firstFilled(
          mergedFields.session_id,
          mergedFields.ga_session_id,
          userFields.session_id,
          userFields.ga_session_id,
        ),
        component_text: firstFilled(
          mergedFields.component_text,
          mergedFields.component_label,
          mergedFields.component_value,
        ),
        component_name: firstFilled(mergedFields.component_name),
        selected_option: firstFilled(
          mergedFields.selected_option,
          mergedFields.selected_content,
          mergedFields.option_selected,
        ),
      }
    })
}

export function getBigQueryHeaders(rows, preferredOrder = [], fallbackOrder = []) {
  const keySet = new Set()
  rows.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        keySet.add(key)
      }
    })
  })

  const priority = [...preferredOrder, ...fallbackOrder]
  const orderedPriority = priority.filter((key, index) => priority.indexOf(key) === index && keySet.has(key))
  const others = [...keySet].filter((key) => !orderedPriority.includes(key)).sort()

  return [...orderedPriority, ...others]
}

export function getMiniappLabel(row) {
  return firstFilled(row?.miniapp, '(sem miniapp)')
}

export function getJourneyLabel(row) {
  return firstFilled(row?.journey, '(sem jornada)')
}

export function getScreenLabel(row) {
  return firstFilled(row?.firebase_screen, row?.app_screen, '(sem tela)')
}

function getSessionKey(row) {
  return firstFilled(row?.session_id, row?.user_id, '__sem_sessao__')
}

function getUserKey(row) {
  return firstFilled(row?.user_id, '__sem_usuario__')
}

function getNavigationSource(rows) {
  const withScreen = rows.filter((row) => getScreenLabel(row) !== '(sem tela)')
  const screenViews = withScreen.filter((row) => row.event_name === 'screen_view')
  return screenViews.length > 0 ? screenViews : withScreen
}

export function buildHolisticOverview(rows) {
  const miniappMap = new Map()

  rows.forEach((row) => {
    if (!row || Object.values(row).every((value) => String(value ?? '').trim() === '')) return

    const miniapp = getMiniappLabel(row)
    const journey = getJourneyLabel(row)

    if (!miniappMap.has(miniapp)) {
      miniappMap.set(miniapp, {
        miniapp,
        rows: [],
        users: new Set(),
        sessions: new Set(),
        journeys: new Map(),
      })
    }

    const miniappEntry = miniappMap.get(miniapp)
    miniappEntry.rows.push(row)
    miniappEntry.users.add(getUserKey(row))
    miniappEntry.sessions.add(getSessionKey(row))

    if (!miniappEntry.journeys.has(journey)) {
      miniappEntry.journeys.set(journey, {
        journey,
        rows: [],
        users: new Set(),
        sessions: new Map(),
      })
    }

    const journeyEntry = miniappEntry.journeys.get(journey)
    journeyEntry.rows.push(row)
    journeyEntry.users.add(getUserKey(row))

    const sessionKey = getSessionKey(row)
    if (!journeyEntry.sessions.has(sessionKey)) {
      journeyEntry.sessions.set(sessionKey, [])
    }
    journeyEntry.sessions.get(sessionKey).push(row)
  })

  return [...miniappMap.values()]
    .map((miniappEntry) => {
      const journeys = [...miniappEntry.journeys.values()]
        .map((journeyEntry) => {
          const viewRows = getNavigationSource(journeyEntry.rows)
          const screenMap = new Map()
          const edgeMap = new Map()

          viewRows.forEach((row) => {
            const screen = getScreenLabel(row)
            if (!screenMap.has(screen)) {
              screenMap.set(screen, {
                screen,
                views: 0,
                users: new Set(),
                events: 0,
              })
            }

            const screenEntry = screenMap.get(screen)
            screenEntry.views += 1
            screenEntry.events += 1
            screenEntry.users.add(getUserKey(row))
          })

          journeyEntry.sessions.forEach((sessionRows) => {
            const sortedRows = [...sessionRows].sort(
              (a, b) => parseTimestamp(a.app_timestamp) - parseTimestamp(b.app_timestamp),
            )
            const navSequence = []

            getNavigationSource(sortedRows).forEach((row) => {
              const screen = getScreenLabel(row)
              if (navSequence[navSequence.length - 1] !== screen) {
                navSequence.push(screen)
              }
            })

            for (let index = 1; index < navSequence.length; index += 1) {
              const key = `${navSequence[index - 1]}||${navSequence[index]}`
              edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
            }
          })

          const screens = [...screenMap.values()]
            .map((screenEntry) => ({
              screen: screenEntry.screen,
              views: screenEntry.views,
              events: screenEntry.events,
              userCount: screenEntry.users.size,
            }))
            .sort((a, b) => b.views - a.views || a.screen.localeCompare(b.screen))

          const edges = [...edgeMap.entries()]
            .map(([key, count]) => {
              const [source, target] = key.split('||')
              return { id: `${journeyEntry.journey}::${key}`, source, target, count }
            })
            .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))

          return {
            journey: journeyEntry.journey,
            totalEvents: journeyEntry.rows.length,
            totalUsers: journeyEntry.users.size,
            totalSessions: journeyEntry.sessions.size,
            totalViews: screens.reduce((sum, screen) => sum + screen.views, 0),
            screenCount: screens.length,
            screens,
            edges,
          }
        })
        .sort((a, b) => b.totalViews - a.totalViews || a.journey.localeCompare(b.journey))

      return {
        miniapp: miniappEntry.miniapp,
        totalEvents: miniappEntry.rows.length,
        totalUsers: miniappEntry.users.size,
        totalSessions: miniappEntry.sessions.size,
        totalViews: journeys.reduce((sum, journey) => sum + journey.totalViews, 0),
        screenCount: journeys.reduce((sum, journey) => sum + journey.screenCount, 0),
        journeys,
      }
    })
    .sort((a, b) => b.totalViews - a.totalViews || a.miniapp.localeCompare(b.miniapp))
}

/** Get all sessions for a given user_id from merged data */
export function getSessions(data, userId) {
  const userRows = data.filter((r) => String(r.user_id) === String(userId))
  const map = new Map()

  for (const row of userRows) {
    const sid = row.session_id || '__no_session__'
    if (!map.has(sid)) map.set(sid, [])
    map.get(sid).push(row)
  }

  return Array.from(map.entries())
    .map(([id, events]) => {
      const timestamps = events.map((e) => parseTimestamp(e.app_timestamp)).filter((t) => t > 0)
      return {
        id,
        events,
        startTs: timestamps.length ? Math.min(...timestamps) : 0,
        endTs: timestamps.length ? Math.max(...timestamps) : 0,
        eventCount: events.length,
      }
    })
    .sort((a, b) => a.startTs - b.startTs)
}

export function getSessionById(data, sessionId) {
  const events = data.filter((row) => String(row.session_id) === String(sessionId))
  if (events.length === 0) return null

  const timestamps = events.map((event) => parseTimestamp(event.app_timestamp)).filter((t) => t > 0)
  return {
    id: sessionId,
    events,
    startTs: timestamps.length ? Math.min(...timestamps) : 0,
    endTs: timestamps.length ? Math.max(...timestamps) : 0,
    eventCount: events.length,
  }
}

/** Build React Flow nodes and edges from session events */
export function buildSessionGraph(sessionEvents) {
  const sorted = [...sessionEvents].sort(
    (a, b) => parseTimestamp(a.app_timestamp) - parseTimestamp(b.app_timestamp),
  )

  // Group events by firebase_screen
  const screenMap = new Map()
  for (const ev of sorted) {
    const screen = ev.firebase_screen || 'unknown'
    if (!screenMap.has(screen)) screenMap.set(screen, [])
    screenMap.get(screen).push(ev)
  }

  // Build navigation sequence: prefer screen_view events, fallback to all
  const screenViews = sorted.filter((e) => e.event_name === 'screen_view')
  const navSource = screenViews.length > 0 ? screenViews : sorted

  const navSequence = []
  for (const ev of navSource) {
    const screen = ev.firebase_screen || 'unknown'
    if (navSequence.length === 0 || navSequence[navSequence.length - 1] !== screen) {
      navSequence.push(screen)
    }
  }

  const uniqueScreens = [...new Set(navSequence)]
  const nodes = uniqueScreens.map((screen) => ({
    id: screen,
    screen,
    events: screenMap.get(screen) || [],
  }))

  // Build edges with visit count
  const edgeMap = new Map()
  for (let i = 1; i < navSequence.length; i++) {
    const key = `${navSequence[i - 1]}||${navSequence[i]}`
    edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
  }

  const edges = Array.from(edgeMap.entries()).map(([key, count]) => {
    const [source, target] = key.split('||')
    return { id: key, source, target, count }
  })

  return { nodes, edges }
}
