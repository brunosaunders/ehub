import { openDB } from 'idb'

const DB_NAME = 'ehub-analytics-db'
const DB_VERSION = 1
let _db = null

async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('csv')) {
        db.createObjectStore('csv', { keyPath: 'id' })
      }
    },
  })
  return _db
}

export async function saveFile(id, name, headers, data, mapping) {
  const db = await getDB()
  await db.put('csv', { id, name, headers, data, mapping, uploadedAt: new Date().toISOString() })
}

export async function getFileData(id) {
  const db = await getDB()
  return db.get('csv', id)
}

export async function getFilesData(ids) {
  const db = await getDB()
  const results = await Promise.all(ids.map((id) => db.get('csv', id)))
  return results.filter(Boolean)
}

export async function deleteFile(id) {
  const db = await getDB()
  await db.delete('csv', id)
}
