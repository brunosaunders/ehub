import { openDB } from 'idb'

const DB_NAME = 'ehub-analytics-db'
const DB_VERSION = 2
const FILE_STORE = 'csv'
const CHUNK_STORE = 'csvChunks'
const CHUNK_INDEX = 'by-file-id'
const DEFAULT_CHUNK_SIZE = 1000
let _db = null

async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunkStore = db.createObjectStore(CHUNK_STORE, { keyPath: 'id' })
        chunkStore.createIndex(CHUNK_INDEX, 'fileId')
      }
    },
  })
  return _db
}

function chunkRows(rows, chunkSize = DEFAULT_CHUNK_SIZE) {
  const chunks = []

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize))
  }

  return chunks
}

async function clearFileChunks(db, fileId) {
  const tx = db.transaction(CHUNK_STORE, 'readwrite')
  const index = tx.store.index(CHUNK_INDEX)
  let cursor = await index.openCursor(IDBKeyRange.only(fileId))

  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }

  await tx.done
}

async function readChunkedRows(db, fileId, maxRows = Infinity) {
  const rows = []
  const tx = db.transaction(CHUNK_STORE, 'readonly')
  const index = tx.store.index(CHUNK_INDEX)
  let cursor = await index.openCursor(IDBKeyRange.only(fileId))

  while (cursor) {
    const chunkRows = Array.isArray(cursor.value?.rows) ? cursor.value.rows : []

    if (rows.length + chunkRows.length > maxRows) {
      rows.push(...chunkRows.slice(0, Math.max(0, maxRows - rows.length)))
      break
    }

    rows.push(...chunkRows)
    cursor = await cursor.continue()
  }

  await tx.done
  return rows
}

export async function initializeFileWrite(metadata) {
  const db = await getDB()
  const uploadedAt = metadata.uploadedAt || new Date().toISOString()

  await clearFileChunks(db, metadata.id)
  await db.put(FILE_STORE, {
    ...metadata,
    uploadedAt,
    rowCount: metadata.rowCount ?? 0,
    chunkCount: metadata.chunkCount ?? 0,
    storageMode: metadata.storageMode || 'chunked',
  })
}

export async function appendFileChunk(fileId, chunkIndex, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return

  const db = await getDB()
  await db.put(CHUNK_STORE, {
    id: `${fileId}::${chunkIndex}`,
    fileId,
    chunkIndex,
    rows,
  })
}

export async function finalizeFileWrite(fileId, updates) {
  const db = await getDB()
  const current = await db.get(FILE_STORE, fileId)

  await db.put(FILE_STORE, {
    ...(current || { id: fileId }),
    ...updates,
    storageMode: updates.storageMode || current?.storageMode || 'chunked',
  })
}

export async function saveFile(id, name, headers, data, mapping, options = {}) {
  const db = await getDB()
  const uploadedAt = options.uploadedAt || new Date().toISOString()
  const chunks = chunkRows(data, options.chunkSize || DEFAULT_CHUNK_SIZE)

  await clearFileChunks(db, id)
  await db.put(FILE_STORE, {
    id,
    name,
    headers,
    mapping,
    uploadedAt,
    rowCount: data.length,
    chunkCount: chunks.length,
    estimatedBytes: options.estimatedBytes ?? null,
    storageMode: 'chunked',
  })

  for (let index = 0; index < chunks.length; index += 1) {
    await db.put(CHUNK_STORE, {
      id: `${id}::${index}`,
      fileId: id,
      chunkIndex: index,
      rows: chunks[index],
    })
  }
}

export async function getFileData(id, options = {}) {
  const db = await getDB()
  const file = await db.get(FILE_STORE, id)
  if (!file) return null

  if (Array.isArray(file.data)) {
    const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : file.data.length
    return {
      ...file,
      data: file.data.slice(0, maxRows),
      isPartial: maxRows < file.data.length,
    }
  }

  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : Infinity
  const data = await readChunkedRows(db, id, maxRows)

  return {
    ...file,
    data,
    isPartial: maxRows !== Infinity && data.length < (file.rowCount || 0),
  }
}

export async function getFilesData(ids, options = {}) {
  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : Infinity
  const results = []
  let remainingRows = maxRows

  for (const id of ids) {
    const file = await getFileData(id, {
      maxRows: maxRows === Infinity ? Infinity : Math.max(remainingRows, 0),
    })

    if (!file) continue
    results.push(file)

    if (maxRows !== Infinity) {
      remainingRows -= file.data.length
      if (remainingRows <= 0) break
    }
  }

  return results
}

export async function deleteFile(id) {
  const db = await getDB()
  await clearFileChunks(db, id)
  await db.delete(FILE_STORE, id)
}
