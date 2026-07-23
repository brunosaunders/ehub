import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_PRIMARY_COLUMNS = [
  'event_name', 'sdk_version', 'miniapp', 'miniapp_version', 'app_version',
  'app_screen', 'app_screen_referrer', 'firebase_screen', 'app_timestamp', 'journey', 'user_id', 'session_id',
]
const DEFAULT_SECONDARY_COLUMNS = ['component_text', 'component_name', 'selected_option']
const DEFAULT_TABLE_COLUMN_ORDER = [...DEFAULT_PRIMARY_COLUMNS, ...DEFAULT_SECONDARY_COLUMNS]
const DEFAULT_KEY_EVENTS = [
  'screen_view', 'interaction', 'select_content',
  'http_request_completed', 'http_request_error',
]

function sanitizeList(items, fallback = []) {
  if (!Array.isArray(items)) return [...fallback]

  const seen = new Set()
  const sanitized = []

  items.forEach((item) => {
    const value = String(item ?? '').trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    sanitized.push(value)
  })

  return sanitized.length > 0 ? sanitized : [...fallback]
}

function insertAfter(list, item, afterItem) {
  if (list.includes(item)) return list

  const next = [...list]
  const afterIndex = next.indexOf(afterItem)
  if (afterIndex === -1) {
    next.push(item)
    return next
  }

  next.splice(afterIndex + 1, 0, item)
  return next
}

function migratePrimaryColumns(columns) {
  const sanitized = sanitizeList(columns, DEFAULT_PRIMARY_COLUMNS)
  return insertAfter(
    insertAfter(sanitized, 'app_screen', 'app_version'),
    'app_screen_referrer',
    'app_screen',
  )
}

function buildTableColumnOrder(primaryColumns, secondaryColumns, tableColumnOrder) {
  const scopedColumns = sanitizeList(
    [...primaryColumns, ...secondaryColumns],
    DEFAULT_TABLE_COLUMN_ORDER,
  )
  const allowed = new Set(scopedColumns)
  const persistedOrder = sanitizeList(tableColumnOrder).filter((column) => allowed.has(column))
  const missingColumns = scopedColumns.filter((column) => !persistedOrder.includes(column))

  return [...persistedOrder, ...missingColumns]
}

export const useStore = create(
  persist(
    (set) => ({
      files: [],          // [{ id, name, headers, mapping, rowCount, uploadedAt }]
      selectedFileIds: [],
      primaryColumns: [...DEFAULT_PRIMARY_COLUMNS],
      secondaryColumns: [...DEFAULT_SECONDARY_COLUMNS],
      tableColumnOrder: [...DEFAULT_TABLE_COLUMN_ORDER],
      keyEvents: [...DEFAULT_KEY_EVENTS],

      addFile: (meta) => set((s) => ({ files: [...s.files, meta] })),

      removeFile: (id) => set((s) => ({
        files: s.files.filter((f) => f.id !== id),
        selectedFileIds: s.selectedFileIds.filter((fid) => fid !== id),
      })),

      updateMapping: (id, mapping) =>
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, mapping } : f)),
        })),

      toggleFileSelection: (id) =>
        set((s) => ({
          selectedFileIds: s.selectedFileIds.includes(id)
            ? s.selectedFileIds.filter((fid) => fid !== id)
            : [...s.selectedFileIds, id],
        })),

      selectAll: () => set((s) => ({ selectedFileIds: s.files.map((f) => f.id) })),
      clearSelection: () => set({ selectedFileIds: [] }),

      setPrimaryColumns: (cols) => set((state) => {
        const primaryColumns = sanitizeList(cols, DEFAULT_PRIMARY_COLUMNS)
        return {
          primaryColumns,
          tableColumnOrder: buildTableColumnOrder(
            primaryColumns,
            state.secondaryColumns,
            state.tableColumnOrder,
          ),
        }
      }),
      setSecondaryColumns: (cols) => set((state) => {
        const secondaryColumns = sanitizeList(cols, DEFAULT_SECONDARY_COLUMNS)
        return {
          secondaryColumns,
          tableColumnOrder: buildTableColumnOrder(
            state.primaryColumns,
            secondaryColumns,
            state.tableColumnOrder,
          ),
        }
      }),
      setTableColumnOrder: (cols) => set((state) => ({
        tableColumnOrder: buildTableColumnOrder(
          state.primaryColumns,
          state.secondaryColumns,
          cols,
        ),
      })),
      setKeyEvents: (events) => set({ keyEvents: events }),
    }),
    {
      name: 'ehub-analytics-store',
      version: 4,
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState

        const nextState = { ...persistedState }
        const state = nextState.state && typeof nextState.state === 'object'
          ? { ...nextState.state }
          : { ...nextState }

        if (version < 2) {
          state.primaryColumns = migratePrimaryColumns(state.primaryColumns)
        } else {
          state.primaryColumns = migratePrimaryColumns(state.primaryColumns)
        }

        state.secondaryColumns = sanitizeList(state.secondaryColumns, DEFAULT_SECONDARY_COLUMNS)
        state.tableColumnOrder = buildTableColumnOrder(
          state.primaryColumns,
          state.secondaryColumns,
          version < 3
            ? [...state.primaryColumns, ...state.secondaryColumns]
            : state.tableColumnOrder,
        )
        state.keyEvents = sanitizeList(state.keyEvents, DEFAULT_KEY_EVENTS)

        if (nextState.state && typeof nextState.state === 'object') {
          nextState.state = state
          return nextState
        }

        return state
      },
    },
  ),
)
